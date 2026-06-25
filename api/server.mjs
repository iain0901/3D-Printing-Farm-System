import { createHash, createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { Low } from "lowdb";
import mqtt from "mqtt";
import { z } from "zod";
import Stripe from "stripe";
import { diagnoseBridge, fetchBridgeStatus, sendBridgeCommand } from "./hardware-bridge.mjs";
import { formatBytes, parseModelMetadata } from "./model-metadata.mjs";
import { createObjectStorage, defaultStorageRoot } from "./object-storage.mjs";
import { createPersistenceAdapter } from "./persistence.mjs";
import { solveScheduleAssignments } from "./schedule-solver.mjs";
import { seedData } from "./seed.mjs";

const execFileAsync = promisify(execFile);

const COLLECTIONS = ["printers", "files", "fileFolders", "queue", "todoActions", "spools", "purchaseRequests", "maintenance", "maintenanceTemplates", "maintenanceReports", "parts", "skus", "productionTemplates", "quoteRequests", "orders", "profiles", "addons", "webhooks", "events", "webhookDeliveries", "mqttDeliveries", "bridges", "notificationChannels", "notificationDeliveries", "commerceConnectors", "commerceImports", "apiKeys", "slicerJobs", "materialMappings", "materialMapRuns"];
const RESTORABLE_EXTRA_KEYS = ["users", "workspaces", "workspaceSettings", "costCatalog", "profileDefaults", "profileMatchingPolicy", "billingSessions", "invoices", "dataMeta"];
const RESTORABLE_KEYS = [...COLLECTIONS, ...RESTORABLE_EXTRA_KEYS];
const defaultCostCatalog = {
  currency: "USD",
  materialRates: { PLA: 0.82, PETG: 1.05, ASA: 1.28, TPU: 1.5, Resin: 2.1 },
  machineHourlyRate: 18,
  laborPerOrder: 35,
  failureReservePercent: 6,
  minimumQuote: 18,
  overheadPercent: 8
};
const defaultAddons = [
  { id: "commerce", name: "Commerce Connectors", description: "Import Shopify, Etsy, eBay, and manual orders into production.", category: "Commerce", status: "enabled" },
  { id: "cost", name: "Cost Catalog", description: "Calculate material, labor, overhead, and SKU margin.", category: "Finance", status: "enabled" },
  { id: "audit", name: "Audit Timeline", description: "Track who changed printers, orders, queue, profiles, and settings.", category: "Governance", status: "enabled" },
  { id: "maintenance", name: "Maintenance Tracker", description: "Schedule recurring tasks from print hours and job counts.", category: "Operations", status: "enabled" },
  { id: "mqtt", name: "MQTT Event Stream", description: "Broadcast realtime printer and order events to automations.", category: "Automation", status: "beta" },
  { id: "pwa", name: "PWA Mobile Console", description: "Installable tablet and phone operations interface.", category: "Mobile", status: "available" }
];
const BYTES_PER_GB = 1024 ** 3;
let activeObjectStorage = null;
const billingPlanTiers = [
  { id: "trial", name: "Print Farm Trial", storageLimitGb: 10, monthlyPrice: 0, currency: "USD", features: ["Single workspace", "10 GB model storage", "Manual billing"] },
  { id: "studio", name: "Studio", storageLimitGb: 100, monthlyPrice: 49, currency: "USD", features: ["Production queue", "100 GB model storage", "Team users"] },
  { id: "farm", name: "Print Farm", storageLimitGb: 500, monthlyPrice: 149, currency: "USD", features: ["Fleet scheduling", "500 GB model storage", "Automation API keys"] },
  { id: "enterprise", name: "Enterprise", storageLimitGb: 2000, monthlyPrice: 499, currency: "USD", features: ["Multi-site operations", "2 TB model storage", "Priority support"] }
];
const defaultAuthRateLimit = { max: 8, timeWindow: "1 minute", groupId: "auth" };
const defaultSensitiveRateLimit = { max: 30, timeWindow: "1 minute" };
const CURRENT_SCHEMA_VERSION = 4;
const DEFAULT_WORKSPACE_ID = "ws-default";
const IDEMPOTENCY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const IDEMPOTENCY_MAX_RECORDS = 500;
const IDEMPOTENCY_MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_FULL_BACKUP_MAX_BYTES = 512 * 1024 * 1024;
const DEFAULT_SESSION_TTL_HOURS = 7 * 24;
const DEFAULT_SESSION_IDLE_TIMEOUT_HOURS = 24;
const DEFAULT_AUTH_LOCK_THRESHOLD = 5;
const DEFAULT_AUTH_LOCK_MINUTES = 15;
const API_KEY_GRANTABLE_SCOPES = [
  "actions:write",
  "admin:export",
  "admin:restore",
  "catalog:write",
  "commerce:write",
  "files:write",
  "inventory:write",
  "maintenance:write",
  "metrics:read",
  "notifications:write",
  "orders:write",
  "printers:control",
  "queue:write",
  "webhooks:write"
];
const apiKeyGrantableScopeSet = new Set(API_KEY_GRANTABLE_SCOPES);
const TENANT_COLLECTIONS = ["printers", "files", "fileFolders", "queue", "todoActions", "spools", "purchaseRequests", "maintenance", "maintenanceTemplates", "maintenanceReports", "parts", "skus", "productionTemplates", "quoteRequests", "orders", "profiles", "addons", "webhooks", "events", "webhookDeliveries", "mqttDeliveries", "bridges", "notificationChannels", "notificationDeliveries", "commerceConnectors", "commerceImports", "apiKeys", "slicerJobs", "materialMappings", "materialMapRuns", "billingSessions", "invoices"];
const printerStatusSchema = z.enum(["idle", "printing", "paused", "offline", "error", "maintenance"]);
const jobStatusSchema = z.enum(["queued", "printing", "paused", "complete", "failed", "cancelled"]);
const prioritySchema = z.enum(["Rush", "High", "Normal", "Low"]);
const taskStageSchema = z.enum(["needs slicing", "needs scheduling", "scheduled", "printing", "post processing", "done", "blocked"]);
const roleSchema = z.enum(["Owner", "Admin", "Operator", "Viewer", "Student"]);
const maintenanceStatusSchema = z.enum(["scheduled", "in progress", "done", "blocked"]);
const severitySchema = z.enum(["Low", "Medium", "High", "Urgent"]);
const orderStatusSchema = z.enum(["received", "queued", "printing", "on_hold", "packed", "shipped", "completed", "cancelled"]);
const terminalOrderStatuses = new Set(["completed", "cancelled"]);
const commerceSourceSchema = z.enum(["Shopify", "Etsy", "Manual", "eBay", "Generic"]);
const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  twoFactorCode: z.string().min(6).max(32).optional()
});
const passwordChangeSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8)
});
const passwordResetSchema = z.object({
  password: z.string().min(8).optional(),
  requireChange: z.boolean().default(true)
});
const twoFactorCodeSchema = z.string().trim().min(6).max(32);
const twoFactorEnableSchema = z.object({
  secret: z.string().min(16),
  code: twoFactorCodeSchema
});
const twoFactorDisableSchema = z.object({
  password: z.string().min(8),
  code: twoFactorCodeSchema.optional()
});
const printerSchema = z.object({
  name: z.string().min(1),
  model: z.string().min(1).default("Generic printer"),
  location: z.string().min(1).default("Unassigned"),
  status: printerStatusSchema.default("idle"),
  connection: z.string().min(1).default("Manual"),
  filament: z.string().min(1).default("PLA"),
  compatibleMaterials: z.array(z.string().min(1)).min(1).default(["PLA"]),
  buildVolume: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]).default([220, 220, 250]),
  nozzle: z.number().nonnegative().default(24),
  bed: z.number().nonnegative().default(24),
  targetNozzle: z.number().nonnegative().default(0),
  targetBed: z.number().nonnegative().default(0),
  camera: z.string().min(1).default("No camera")
});
const printerPatchSchema = printerSchema.partial();
const signupSchema = authSchema.extend({
  name: z.string().min(1),
  workspace: z.string().min(1).default("3DSTU FarmFlow Workspace")
});
const userCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: roleSchema.default("Viewer"),
  location: z.string().min(1).default("Pending"),
  password: z.string().min(8).optional()
});
const userPatchSchema = z.object({
  name: z.string().min(1).optional(),
  role: roleSchema.optional(),
  location: z.string().min(1).optional(),
  lastSeen: z.string().min(1).optional()
});
const fileSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["GCODE", "STL", "3MF", "OBJ"]),
  material: z.string().min(1),
  folder: z.string().min(1).default("Inbox"),
  size: z.string().min(1).default("0 MB"),
  tags: z.array(z.string()).default(["api"]),
  thumbnail: z.string().min(1).optional(),
  layerHeight: z.string().min(1).default("0.20"),
  dimensions: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]).default([100, 100, 50]),
  estimateGrams: z.number().nonnegative().default(0),
  estimateMinutes: z.number().nonnegative().default(0),
  quote: z.number().nonnegative().default(0)
});
const fileFolderSchema = z.object({
  name: z.string().min(1).max(80),
  parent: z.string().max(80).optional().default(""),
  purpose: z.enum(["inbox", "production", "review", "archive", "sample"]).default("inbox")
});
const sampleFileSchema = z.object({
  name: z.string().min(1).max(80).default("3DSTU FarmFlow sample bracket"),
  folder: z.string().min(1).default("Samples"),
  material: z.string().min(1).default("PETG")
});
const spoolSchema = z.object({
  material: z.string().min(1),
  color: z.string().min(1).default("#0ea5e9"),
  brand: z.string().min(1).default("Generic"),
  remaining: z.number().min(0).default(1000),
  weight: z.number().positive().default(1000),
  location: z.string().min(1).default("Rack New"),
  dry: z.boolean().default(true),
  nfc: z.string().min(1).default("LP-SPOOL")
});
const spoolPatchSchema = z.object({
  material: z.string().min(1).optional(),
  color: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  remaining: z.number().min(0).optional(),
  weight: z.number().positive().optional(),
  location: z.string().min(1).optional(),
  dry: z.boolean().optional(),
  nfc: z.string().min(1).optional()
});
const spoolUsageSchema = z.object({
  grams: z.number().positive().default(20)
});
const spoolLabelsSchema = z.object({
  ids: z.array(z.string().min(1)).optional().default([]),
  includeEmpty: z.boolean().default(false)
});
const spoolScanSchema = z.object({
  code: z.string().min(1),
  grams: z.number().positive().optional(),
  location: z.string().min(1).optional()
});
const purchaseStatusSchema = z.enum(["open", "ordered", "received", "cancelled"]);
const purchaseRequestSchema = z.object({
  spoolId: z.string().min(1).optional().default(""),
  material: z.string().min(1),
  color: z.string().min(1).default("Any"),
  brand: z.string().min(1).default("Generic"),
  quantity: z.number().int().positive().max(100).default(1),
  targetGrams: z.number().positive().max(10000).default(1000),
  supplier: z.string().min(1).default("Preferred supplier"),
  priority: severitySchema.default("Medium"),
  status: purchaseStatusSchema.default("open"),
  due: z.string().min(1).default("This week"),
  note: z.string().max(1000).optional().default("")
});
const purchaseRequestPatchSchema = purchaseRequestSchema.partial();
const purchaseReorderPlanSchema = z.object({
  thresholdGrams: z.number().nonnegative().max(10000).default(250),
  targetGrams: z.number().positive().max(10000).default(1000),
  quantity: z.number().int().positive().max(50).default(1),
  supplier: z.string().min(1).default("Preferred supplier")
}).default({});
const purchaseReceiveSchema = z.object({
  location: z.string().min(1).default("Rack Receiving"),
  dry: z.boolean().default(true),
  nfcPrefix: z.string().min(1).optional()
}).default({});
const maintenanceSchema = z.object({
  title: z.string().min(1),
  printer: z.string().min(1),
  status: maintenanceStatusSchema.default("scheduled"),
  due: z.string().min(1).default("Next week"),
  progress: z.string().min(1).default("0/4"),
  severity: severitySchema.default("Medium")
});
const maintenancePatchSchema = z.object({
  title: z.string().min(1).optional(),
  printer: z.string().min(1).optional(),
  status: maintenanceStatusSchema.optional(),
  due: z.string().min(1).optional(),
  progress: z.string().min(1).optional(),
  severity: severitySchema.optional()
});
const maintenanceTemplateSchema = z.object({
  title: z.string().min(1),
  printerModel: z.string().min(1).default("FDM fleet"),
  intervalDays: z.number().int().positive().max(730).default(30),
  tasks: z.array(z.string().min(1)).min(1).default(["Inspect motion system", "Clean toolhead", "Run calibration"]),
  severity: severitySchema.default("Medium")
});
const maintenanceReportSchema = z.object({
  title: z.string().min(1),
  printer: z.string().min(1),
  description: z.string().min(1).default("Operator reported a maintenance problem"),
  severity: severitySchema.default("High"),
  createJob: z.boolean().default(true)
});
const orderSchema = z.object({
  source: z.enum(["Shopify", "Etsy", "Manual", "eBay"]).default("Manual"),
  externalId: z.string().optional(),
  customer: z.string().min(1),
  items: z.array(z.string().min(1)).min(1),
  status: orderStatusSchema.default("received"),
  due: z.string().min(1).default("Tomorrow 17:00"),
  value: z.number().nonnegative().default(0)
});
const quoteStatusSchema = z.enum(["new", "reviewing", "quoted", "accepted", "converted", "rejected"]);
const publicQuoteRequestSchema = z.object({
  customer: z.string().min(1).max(120),
  email: z.string().email(),
  company: z.string().max(120).optional().default(""),
  project: z.string().min(1).max(160),
  material: z.string().min(1).default("PLA"),
  quantity: z.number().int().positive().max(10000).default(1),
  due: z.string().min(1).default("Flexible"),
  budget: z.number().nonnegative().default(0),
  notes: z.string().max(2000).optional().default(""),
  fileName: z.string().max(160).optional().default(""),
  source: z.string().min(1).default("Website")
});
const quoteRequestPatchSchema = z.object({
  status: quoteStatusSchema.optional(),
  priority: prioritySchema.optional(),
  quotedValue: z.number().nonnegative().optional(),
  validUntil: z.string().min(1).optional(),
  internalNote: z.string().max(2000).optional()
});
const quoteConvertSchema = z.object({
  due: z.string().min(1).optional(),
  value: z.number().nonnegative().optional(),
  createJob: z.boolean().default(true)
}).default({});
const quoteCustomerLinkSchema = z.object({
  rotate: z.boolean().default(false)
}).default({});
const publicQuoteDecisionSchema = z.object({
  token: z.string().min(12),
  decision: z.enum(["accepted", "rejected", "revision"]),
  note: z.string().max(1000).optional().default("")
});
const commerceConnectorSchema = z.object({
  name: z.string().min(1),
  source: commerceSourceSchema.default("Generic"),
  url: z.string().url(),
  token: z.string().optional().default(""),
  enabled: z.boolean().default(true),
  mapping: z.record(z.string(), z.string()).default({})
});
const commerceConnectorPatchSchema = commerceConnectorSchema.partial();
const commerceCsvImportSchema = z.object({
  source: commerceSourceSchema.default("Generic"),
  csv: z.string().min(1)
});
const webhookSchema = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  events: z.array(z.string().min(1)).min(1),
  enabled: z.boolean().default(true)
});
const webhookPatchSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().url().optional(),
  events: z.array(z.string().min(1)).optional(),
  enabled: z.boolean().optional()
});
const notificationChannelSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["slack", "discord", "custom", "email"]),
  url: z.string().url(),
  token: z.string().optional().default(""),
  events: z.array(z.string().min(1)).min(1),
  enabled: z.boolean().default(true),
  recipients: z.array(z.string().min(1)).default([])
});
const notificationChannelPatchSchema = notificationChannelSchema.partial();
const partSchema = z.object({
  name: z.string().min(1),
  fileId: z.string().min(1),
  material: z.string().min(1),
  process: z.string().min(1).default("0.20mm Production"),
  plates: z.number().int().positive().default(1),
  variants: z.array(z.string()).default([]),
  status: z.enum(["ready", "needs profile", "draft"]).default("draft")
});
const partPatchSchema = z.object({
  name: z.string().min(1).optional(),
  fileId: z.string().min(1).optional(),
  material: z.string().min(1).optional(),
  process: z.string().min(1).optional(),
  plates: z.number().int().positive().optional(),
  variants: z.array(z.string()).optional(),
  status: z.enum(["ready", "needs profile", "draft"]).optional()
});
const parametricNameplateSchema = z.object({
  text: z.string().min(1).max(48).default("3DSTU FarmFlow"),
  width: z.number().min(30).max(300).default(120),
  height: z.number().min(15).max(160).default(42),
  thickness: z.number().min(1).max(12).default(3),
  material: z.string().min(1).default("PLA"),
  feature: z.enum(["keyholes", "magnet pockets", "plain plate"]).default("keyholes"),
  createPart: z.boolean().default(true)
});
const materialMapSchema = z.object({
  apply: z.boolean().default(true)
});
const profileKindSchema = z.enum(["Machine", "Process", "Filament"]);
const profileSourceSchema = z.enum(["Bambu sync", "Orca import", "Manual"]);
const profileSchema = z.object({
  name: z.string().min(1),
  kind: profileKindSchema,
  target: z.string().min(1).default("FDM fleet"),
  source: profileSourceSchema.default("Manual"),
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).default({})
});
const profilePatchSchema = profileSchema.partial();
const profileImportSchema = z.object({
  source: profileSourceSchema.default("Orca import"),
  content: z.string().min(1).optional(),
  profiles: z.array(profileSchema).optional()
}).refine((value) => Boolean(value.content || value.profiles?.length), { message: "Provide content or profiles" });
const profileDefaultsSchema = z.object({
  Machine: z.string().optional().default(""),
  Process: z.string().optional().default(""),
  Filament: z.string().optional().default("")
});
const profileMatchingPolicySchema = z.object({
  materialCompatibility: z.boolean().default(true),
  processFallback: z.boolean().default(true),
  commercialPriority: z.boolean().default(true),
  warnBeforeFallback: z.boolean().default(true),
  dueWindowHours: z.number().int().positive().max(168).default(2),
  updatedAt: z.string().optional().default(""),
  updatedBy: z.string().optional().default("")
});
const profileMatchingPolicyPatchSchema = profileMatchingPolicySchema.partial();
const addonStatusSchema = z.enum(["enabled", "disabled", "beta", "available"]);
const addonConfigValueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
const addonPatchSchema = z.object({
  status: addonStatusSchema.optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), addonConfigValueSchema).optional(),
  note: z.string().max(500).optional().default("")
}).refine((value) => value.status !== undefined || value.enabled !== undefined || value.config !== undefined || Boolean(value.note), { message: "Provide status, enabled, config, or note" });
const skuSchema = z.object({
  sku: z.string().min(1),
  title: z.string().min(1),
  parts: z.array(z.string().min(1)).min(1),
  variants: z.array(z.string()).default([]),
  price: z.number().nonnegative().default(0),
  stock: z.number().int().nonnegative().default(0),
  channel: z.string().min(1).default("Manual")
});
const skuPatchSchema = z.object({
  sku: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  parts: z.array(z.string().min(1)).optional(),
  variants: z.array(z.string()).optional(),
  price: z.number().nonnegative().optional(),
  stock: z.number().int().nonnegative().optional(),
  channel: z.string().min(1).optional()
});
const productionTemplateSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional().default(""),
  fileId: z.string().min(1),
  material: z.string().min(1),
  color: z.string().min(1).default("Any"),
  priority: prioritySchema.default("Normal"),
  stage: taskStageSchema.default("needs scheduling"),
  printerId: z.string().optional().default(""),
  process: z.string().min(1).default("0.20mm Production"),
  dueOffsetDays: z.number().int().min(0).max(365).default(2),
  quantity: z.number().int().positive().max(500).default(1),
  time: z.string().min(1).default("1h 00m"),
  cost: z.number().nonnegative().default(0),
  notes: z.string().max(1000).optional().default("")
});
const productionTemplatePatchSchema = productionTemplateSchema.partial();
const productionTemplateRunSchema = z.object({
  quantity: z.number().int().positive().max(500).optional(),
  due: z.string().min(1).optional(),
  printerId: z.string().min(1).optional(),
  dryRun: z.boolean().default(false)
}).default({});
const orderJobGenerationSchema = z.object({
  dryRun: z.boolean().default(false),
  allowDuplicate: z.boolean().default(false)
}).default({});
const scheduleSchema = z.object({
  printerId: z.string().min(1),
  scheduledStart: z.string().min(1)
});
const slicerJobSchema = z.object({
  fileId: z.string().min(1),
  printerId: z.string().min(1),
  material: z.string().min(1).default("PLA"),
  layerHeight: z.string().min(1).default("0.20"),
  infill: z.number().int().min(0).max(100).default(18),
  supports: z.boolean().default(true),
  profileId: z.string().min(1).optional()
});
const reprintSchema = z.object({
  printerId: z.string().min(1).optional(),
  due: z.string().min(1).default("Tomorrow 12:00"),
  priority: prioritySchema.default("Normal")
}).default({});
const autoScheduleBaseSchema = z.object({
  includeBusyPrinters: z.boolean().default(true),
  respectMaterial: z.boolean().default(true),
  respectBuildVolume: z.boolean().default(true),
  startMinute: z.number().int().min(0).max(1439).default(8 * 60)
});
const autoScheduleSchema = autoScheduleBaseSchema.default({});
const optimizeScheduleSchema = autoScheduleBaseSchema.extend({
  strategy: z.enum(["material-color", "load-balance", "due-priority"]).default("material-color")
}).default({});
const constraintScheduleSchema = autoScheduleBaseSchema.extend({
  objective: z.enum(["balanced-cost", "due-risk", "changeover-min"]).default("balanced-cost"),
  dryRun: z.boolean().default(false),
  maxJobs: z.number().int().min(1).max(200).default(80),
  maxSlotsPerPrinter: z.number().int().min(1).max(200).optional()
}).default({});
const queueMatchSchema = z.object({
  dryRun: z.boolean().default(true),
  maxActiveSlots: z.number().int().min(1).max(50).default(3),
  respectMaterial: z.boolean().default(true),
  respectBuildVolume: z.boolean().default(true)
}).default({});
const hotDropRequestSchema = z.object({
  mode: z.enum(["Upload Only", "Direct Print", "Auto-Queue"]).optional(),
  name: z.string().min(1).default("Hot Drop"),
  material: z.string().min(1).default("PLA"),
  folder: z.string().min(1).default("Hot Drops / Today")
}).default({});
const todoActionSchema = z.object({
  action: z.enum(["claim", "complete", "snooze", "reopen"]),
  owner: z.string().min(1).optional(),
  note: z.string().max(500).optional().default(""),
  snoozeUntil: z.string().min(1).optional()
});
const queueCreateSchema = z.object({
  fileId: z.string().min(1),
  file: z.string().min(1),
  printerId: z.string().min(1).optional(),
  status: jobStatusSchema.default("queued"),
  priority: prioritySchema.default("Normal"),
  stage: taskStageSchema.default("needs scheduling"),
  material: z.string().min(1),
  color: z.string().min(1).default("Any"),
  due: z.string().min(1).default("Tomorrow 17:00"),
  dimensions: z.tuple([z.number().positive(), z.number().positive(), z.number().positive()]).default([100, 100, 50]),
  assignee: z.string().min(1).default("Scheduler"),
  scheduledStart: z.string().min(1).optional(),
  time: z.string().min(1).default("1h 00m"),
  cost: z.number().nonnegative().default(0),
  added: z.string().min(1).default("Just now")
});
const bridgeSchema = z.object({
  printerId: z.string().min(1),
  kind: z.enum(["octoprint", "moonraker", "prusalink", "manual"]),
  name: z.string().min(1),
  baseUrl: z.string().min(1),
  apiKey: z.string().optional().default(""),
  enabled: z.boolean().default(true)
});
const bridgeActionSchema = z.object({
  action: z.enum(["start", "pause", "resume", "cancel", "home axes", "preheat", "cooldown"])
});
const printerActionSchema = bridgeActionSchema.extend({
  printerId: z.string().min(1),
  jobId: z.string().min(1).optional(),
  targetNozzle: z.number().nonnegative().optional(),
  targetBed: z.number().nonnegative().optional()
});
const apiKeySchema = z.object({
  name: z.string().min(1),
  scopes: z.array(z.enum(API_KEY_GRANTABLE_SCOPES)).min(1).default(["queue:write"]).transform((scopes) => [...new Set(scopes)]),
  enabled: z.boolean().default(true),
  expiresAt: z.string().optional().default("")
});
const apiKeyPatchSchema = apiKeySchema.partial();
const workspaceSettingsBaseSchema = z.object({
  workspaceId: z.string().min(1).default(DEFAULT_WORKSPACE_ID),
  organizationName: z.string().min(1).default("North Campus Lab"),
  defaultLocation: z.string().min(1).default("Studio North"),
  units: z.enum(["metric", "imperial"]).default("metric"),
  currency: z.string().min(1).default("USD"),
  timezone: z.string().min(1).default("Asia/Taipei"),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  requireAdmin2fa: z.boolean().default(true),
  auditLogRetention: z.boolean().default(true),
  auditLogRetentionDays: z.number().int().min(7).max(3650).default(365),
  restrictApiByIp: z.boolean().default(false),
  allowedApiIps: z.array(z.string().trim().min(1).refine(isValidIpAllowlistRule, { message: "Must be an IPv4 address or IPv4 CIDR range" })).default([]),
  storageLimitGb: z.number().positive().default(10),
  hotDropMode: z.enum(["Upload Only", "Direct Print", "Auto-Queue"]).default("Direct Print"),
  plan: z.string().min(1).default("Print Farm Trial"),
  onboarding: z.record(z.string(), z.object({
    status: z.enum(["pending", "complete", "skipped"]).default("pending"),
    note: z.string().max(500).default(""),
    updatedAt: z.string().optional(),
    updatedBy: z.string().optional()
  })).default({}),
  stripeCustomerId: z.string().min(1).optional(),
  stripeSubscriptionId: z.string().min(1).optional()
});
const workspaceSettingsSchema = workspaceSettingsBaseSchema.superRefine((value, ctx) => {
  if (value.restrictApiByIp && !value.allowedApiIps.length) {
    ctx.addIssue({
      code: "custom",
      path: ["allowedApiIps"],
      message: "At least one IPv4 address or CIDR range is required when API key IP restrictions are enabled"
    });
  }
});
const workspaceRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  ownerEmail: z.string().email().optional(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  settings: workspaceSettingsSchema
});
const workspaceSettingsPatchSchema = workspaceSettingsBaseSchema.partial();
const onboardingStepPatchSchema = z.object({
  status: z.enum(["pending", "complete", "skipped"]).default("complete"),
  note: z.string().max(500).optional().default("")
});
const billingPlanPatchSchema = z.object({
  planId: z.string().min(1)
});
const billingPortalSchema = z.object({
  returnUrl: z.string().optional().default(""),
  planId: z.string().min(1).optional()
});
const stripeWebhookSchema = z.object({
  id: z.string().min(1).optional(),
  type: z.string().min(1),
  data: z.object({ object: z.record(z.string(), z.any()).default({}) }).default({ object: {} })
});
const costCatalogSchema = z.object({
  currency: z.string().min(1).default(defaultCostCatalog.currency),
  materialRates: z.record(z.string(), z.number().nonnegative()).default(defaultCostCatalog.materialRates),
  machineHourlyRate: z.number().nonnegative().default(defaultCostCatalog.machineHourlyRate),
  laborPerOrder: z.number().nonnegative().default(defaultCostCatalog.laborPerOrder),
  failureReservePercent: z.number().min(0).max(100).default(defaultCostCatalog.failureReservePercent),
  minimumQuote: z.number().nonnegative().default(defaultCostCatalog.minimumQuote),
  overheadPercent: z.number().min(0).max(100).default(defaultCostCatalog.overheadPercent)
});
const costCatalogPatchSchema = costCatalogSchema.partial();
const quoteRequestSchema = z.object({
  material: z.string().min(1),
  grams: z.number().nonnegative(),
  minutes: z.number().nonnegative(),
  includeLabor: z.boolean().default(false),
  quantity: z.number().int().positive().default(1)
});
const historyPatchSchema = z.object({
  note: z.string().max(1000).optional(),
  issueTag: z.string().max(80).optional(),
  issueSeverity: severitySchema.optional(),
  failureReason: z.string().max(1000).optional(),
  failureCategory: z.string().max(80).optional(),
  rootCause: z.string().max(1000).optional(),
  correctiveAction: z.string().max(1000).optional(),
  wasteGrams: z.number().nonnegative().optional(),
  wasteCost: z.number().nonnegative().optional(),
  wasteSpoolId: z.string().min(1).optional(),
  deductWasteFromInventory: z.boolean().optional()
});
const adminRestoreSchema = z.object({
  backup: z.record(z.string(), z.unknown()),
  dryRun: z.boolean().default(true),
  confirm: z.string().optional(),
  preserveStoragePaths: z.boolean().default(false)
});

const defaultPasswords = new Map([
  ["demo@layerpilot.test", "layerpilot"]
]);
const defaultSeedUserEmails = new Set([
  ...seedData.users.map((user) => String(user.email || "").toLowerCase()),
  ...defaultPasswords.keys()
]);
const rolePermissions = {
  Owner: new Set(["*"]),
  Admin: new Set(["*"]),
  Operator: new Set(["files:write", "queue:write", "printers:control", "actions:write", "inventory:write", "maintenance:write", "orders:write", "catalog:write", "webhooks:write", "notifications:write", "commerce:write"]),
  Student: new Set(["files:write", "queue:write"]),
  Viewer: new Set([])
};

function createPasswordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash?.startsWith("scrypt$")) return false;
  const [, salt, hash] = storedHash.split("$");
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const base32Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  return bits.match(/.{1,5}/g)?.map((chunk) => base32Alphabet[parseInt(chunk.padEnd(5, "0"), 2)]).join("") || "";
}

function base32Decode(secret) {
  const normalized = String(secret || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of normalized) {
    const value = base32Alphabet.indexOf(char);
    if (value === -1) continue;
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g)?.map((chunk) => parseInt(chunk, 2)) || [];
  return Buffer.from(bytes);
}

export function generateTotpCode(secret, timestamp = Date.now(), stepSeconds = 30) {
  const key = base32Decode(secret);
  if (!key.length) return "";
  const counter = Math.floor(timestamp / 1000 / stepSeconds);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function verifyTotpCode(secret, code, timestamp = Date.now()) {
  const normalized = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  for (const offset of [-1, 0, 1]) {
    if (generateTotpCode(secret, timestamp + offset * 30_000) === normalized) return true;
  }
  return false;
}

function generateRecoveryCodes() {
  return Array.from({ length: 8 }, () => `lp-${randomBytes(4).toString("hex")}`);
}

function verifyAndConsumeTwoFactorCode(user, code) {
  const normalized = String(code || "").trim();
  if (verifyTotpCode(user.twoFactorSecret, normalized)) return { ok: true, method: "totp" };
  const hashes = Array.isArray(user.twoFactorRecoveryCodeHashes) ? user.twoFactorRecoveryCodeHashes : [];
  const index = hashes.findIndex((hash) => verifyPassword(normalized, hash));
  if (index === -1) return { ok: false };
  hashes.splice(index, 1);
  user.twoFactorRecoveryCodeHashes = hashes;
  return { ok: true, method: "recovery" };
}

function twoFactorStatus(user) {
  return {
    enabled: Boolean(user?.twoFactorEnabled && user?.twoFactorSecret),
    enrolledAt: user?.twoFactorEnrolledAt || "",
    recoveryCodesRemaining: Array.isArray(user?.twoFactorRecoveryCodeHashes) ? user.twoFactorRecoveryCodeHashes.length : 0
  };
}

function buildOtpAuthUrl({ secret, user, issuer }) {
  const label = encodeURIComponent(`${issuer}:${user.email}`);
  const query = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${query.toString()}`;
}

function createApiKeySecret() {
  return `lp_live_${randomBytes(5).toString("hex")}_${randomBytes(24).toString("hex")}`;
}

function apiKeyPrefix(secret) {
  return secret.slice(0, 18);
}

function normalizeClientIp(ip = "") {
  return String(ip || "").replace(/^::ffff:/, "").replace(/^\[|\]$/g, "");
}

function ipv4ToNumber(ip) {
  const normalized = normalizeClientIp(ip);
  if (net.isIP(normalized) !== 4) return null;
  return normalized.split(".").reduce((sum, part) => (sum << 8) + Number(part), 0) >>> 0;
}

function matchesIpRule(ip, rule) {
  const clientIp = normalizeClientIp(ip);
  const candidate = String(rule || "").trim();
  if (!candidate) return false;
  if (!candidate.includes("/")) return normalizeClientIp(candidate) === clientIp;
  const [rangeIp, prefixText] = candidate.split("/");
  const prefix = Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const client = ipv4ToNumber(clientIp);
  const range = ipv4ToNumber(rangeIp);
  if (client === null || range === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (client & mask) === (range & mask);
}

function isValidIpAllowlistRule(rule) {
  const candidate = String(rule || "").trim();
  if (!candidate) return false;
  if (!candidate.includes("/")) return net.isIP(normalizeClientIp(candidate)) === 4;
  const [rangeIp, prefixText, ...rest] = candidate.split("/");
  if (rest.length) return false;
  const prefix = Number(prefixText);
  return net.isIP(normalizeClientIp(rangeIp)) === 4 && Number.isInteger(prefix) && prefix >= 0 && prefix <= 32;
}

function invalidIpAllowlistRules(rules = []) {
  return (Array.isArray(rules) ? rules : []).map((rule) => String(rule || "").trim()).filter((rule) => !isValidIpAllowlistRule(rule));
}

function isApiKeyIpAllowed(settings, request) {
  if (!settings?.restrictApiByIp) return true;
  const allowed = Array.isArray(settings.allowedApiIps) ? settings.allowedApiIps : [];
  if (!allowed.length) return false;
  return allowed.some((rule) => matchesIpRule(request.ip, rule));
}

function envFlag(name, env = process.env) {
  return ["1", "true", "yes", "on"].includes(String(env[name] || "").trim().toLowerCase());
}

function envFlagWithDefault(name, fallback, env = process.env) {
  const value = String(env[name] ?? "").trim();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function publicSignupEnabled(env = process.env) {
  if (env.NODE_ENV !== "production") return true;
  return envFlag("LAYERPILOT_ENABLE_PUBLIC_SIGNUP", env);
}

function envFlagDefault(name, fallback = true) {
  const value = String(process.env[name] || "").trim();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function envPositiveNumber(name, fallback, env = process.env) {
  const value = Number(env[name]);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function authLockoutPolicy(env = process.env) {
  return {
    threshold: Math.max(1, Math.trunc(envPositiveNumber("LAYERPILOT_AUTH_LOCK_THRESHOLD", DEFAULT_AUTH_LOCK_THRESHOLD, env))),
    lockMinutes: envPositiveNumber("LAYERPILOT_AUTH_LOCK_MINUTES", DEFAULT_AUTH_LOCK_MINUTES, env)
  };
}

function activeAuthLock(user, now = new Date()) {
  const lockedUntilMs = Date.parse(user?.authLockedUntil || "");
  if (!Number.isFinite(lockedUntilMs) || lockedUntilMs <= now.getTime()) return null;
  return {
    lockedUntil: new Date(lockedUntilMs).toISOString(),
    retryAfterSeconds: Math.max(1, Math.ceil((lockedUntilMs - now.getTime()) / 1000)),
    reason: user.authLockedReason || "authentication_failed",
    failedAttempts: Number(user.authFailedAttempts || 0)
  };
}

function clearAuthFailureState(user) {
  if (!user) return;
  user.authFailedAttempts = 0;
  user.authFailedAt = "";
  user.authLockedUntil = "";
  user.authLockedReason = "";
}

function recordAuthFailureState(user, reason, now = new Date()) {
  if (!user) return null;
  const policy = authLockoutPolicy();
  const attempts = Number(user.authFailedAttempts || 0) + 1;
  user.authFailedAttempts = attempts;
  user.authFailedAt = now.toISOString();
  if (attempts < policy.threshold) {
    user.authLockedUntil ||= "";
    user.authLockedReason ||= "";
    return { failedAttempts: attempts, locked: false, policy };
  }
  const lockedUntil = new Date(now.getTime() + policy.lockMinutes * 60 * 1000).toISOString();
  user.authLockedUntil = lockedUntil;
  user.authLockedReason = reason;
  return { failedAttempts: attempts, locked: true, lockedUntil, policy };
}

function sessionPolicy() {
  return {
    ttlMs: Math.round(envPositiveNumber("LAYERPILOT_SESSION_TTL_HOURS", DEFAULT_SESSION_TTL_HOURS) * 60 * 60 * 1000),
    idleMs: Math.round(envPositiveNumber("LAYERPILOT_SESSION_IDLE_TIMEOUT_HOURS", DEFAULT_SESSION_IDLE_TIMEOUT_HOURS) * 60 * 60 * 1000)
  };
}

function sessionExpiryFields(now = new Date()) {
  const policy = sessionPolicy();
  const nowMs = now.getTime();
  return {
    expiresAt: new Date(nowMs + policy.ttlMs).toISOString(),
    idleExpiresAt: new Date(nowMs + policy.idleMs).toISOString()
  };
}

function markSessionStoreDirty(data) {
  if (!data) return;
  Object.defineProperty(data, "__sessionStoreDirty", { value: true, writable: true, configurable: true, enumerable: false });
}

function clearSessionStoreDirty(data) {
  if (data?.__sessionStoreDirty) data.__sessionStoreDirty = false;
}

function createSession({ token, user, workspaceId, now = new Date() }) {
  const at = now.toISOString();
  return {
    id: randomUUID(),
    tokenHash: createPasswordHash(token),
    userId: user.id,
    workspaceId: workspaceId || user.workspaceId || DEFAULT_WORKSPACE_ID,
    createdAt: at,
    lastSeenAt: at,
    ...sessionExpiryFields(now)
  };
}

function sessionExpired(session, nowMs = Date.now()) {
  const expiresAt = Date.parse(session.expiresAt || "");
  const idleExpiresAt = Date.parse(session.idleExpiresAt || "");
  return Number.isFinite(expiresAt) && expiresAt <= nowMs || Number.isFinite(idleExpiresAt) && idleExpiresAt <= nowMs;
}

function pruneExpiredSessions(data, now = new Date()) {
  const sessions = ensureArray(data, "sessions");
  const retained = sessions.filter((session) => !sessionExpired(session, now.getTime()));
  if (retained.length !== sessions.length) {
    data.sessions = retained;
    markSessionStoreDirty(data);
  }
  return data.sessions;
}

function sessionMatchesToken(session, token) {
  if (!session || !token || sessionExpired(session)) return false;
  if (session.tokenHash && verifyPassword(token, session.tokenHash)) return true;
  return Boolean(session.token && session.token === token);
}

function touchSession(data, session, token, now = new Date()) {
  if (!session) return;
  if (session.token && !session.tokenHash && token) {
    session.tokenHash = createPasswordHash(token);
    delete session.token;
    markSessionStoreDirty(data);
  }
  session.lastSeenAt = now.toISOString();
  session.idleExpiresAt = new Date(now.getTime() + sessionPolicy().idleMs).toISOString();
  session.expiresAt ||= sessionExpiryFields(new Date(Date.parse(session.createdAt || now.toISOString()) || now.getTime())).expiresAt;
  markSessionStoreDirty(data);
}

function ensureArray(data, key) {
  if (!Array.isArray(data[key])) data[key] = [];
  return data[key];
}

function ensureRecord(data, key) {
  if (!data[key] || typeof data[key] !== "object" || Array.isArray(data[key])) data[key] = {};
  return data[key];
}

function workspaceSlug(value = "workspace") {
  return String(value || "workspace").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "workspace";
}

function defaultWorkspaceSettings(data) {
  return workspaceSettingsSchema.parse({ workspaceId: DEFAULT_WORKSPACE_ID, ...(data.workspaceSettings || {}) });
}

function ensureWorkspaceCatalog(data, now = new Date().toISOString()) {
  const settings = defaultWorkspaceSettings(data);
  data.workspaces = ensureArray(data, "workspaces");
  let workspace = data.workspaces.find((item) => item.id === settings.workspaceId || item.id === DEFAULT_WORKSPACE_ID);
  if (!workspace) {
    workspace = {
      id: settings.workspaceId || DEFAULT_WORKSPACE_ID,
      name: settings.organizationName,
      slug: workspaceSlug(settings.organizationName),
      ownerEmail: (data.users || []).find((user) => user.role === "Owner")?.email || "",
      createdAt: now,
      updatedAt: now,
      settings
    };
    data.workspaces.unshift(workspace);
  } else {
    workspace.id ||= settings.workspaceId || DEFAULT_WORKSPACE_ID;
    workspace.name = settings.organizationName || workspace.name;
    workspace.slug ||= workspaceSlug(workspace.name);
    workspace.createdAt ||= now;
    workspace.updatedAt ||= now;
    workspace.settings = workspaceSettingsSchema.parse({ ...(workspace.settings || {}), ...settings, workspaceId: workspace.id, organizationName: settings.organizationName || workspace.name });
  }
  data.workspaceSettings = workspaceSettingsSchema.parse({ ...workspace.settings, workspaceId: workspace.id });
  return workspace;
}

function workspaceForId(data, workspaceId = DEFAULT_WORKSPACE_ID) {
  ensureWorkspaceCatalog(data);
  return data.workspaces.find((workspace) => workspace.id === workspaceId) || data.workspaces[0];
}

function markWorkspaceDefaults(data, workspaceId = DEFAULT_WORKSPACE_ID) {
  for (const user of ensureArray(data, "users")) user.workspaceId ||= workspaceId;
  for (const session of ensureArray(data, "sessions")) {
    const user = data.users.find((item) => item.id === session.userId);
    session.workspaceId ||= user?.workspaceId || workspaceId;
  }
  for (const collection of TENANT_COLLECTIONS) {
    for (const item of ensureArray(data, collection)) item.workspaceId ||= workspaceId;
  }
}

function itemInWorkspace(item, workspaceId) {
  if (!workspaceId) return true;
  if (!item?.workspaceId) return workspaceId === DEFAULT_WORKSPACE_ID;
  return item.workspaceId === workspaceId;
}

function scopedWorkspaceData(data, workspaceId) {
  const workspace = workspaceForId(data, workspaceId);
  const scoped = { ...data };
  for (const collection of TENANT_COLLECTIONS) {
    scoped[collection] = (data[collection] || []).filter((item) => itemInWorkspace(item, workspace.id));
  }
  scoped.users = (data.users || []).filter((user) => itemInWorkspace(user, workspace.id));
  scoped.sessions = [];
  scoped.workspaces = [workspace];
  scoped.workspaceSettings = workspace.settings || data.workspaceSettings;
  return scoped;
}

function updateWorkspaceSettings(data, workspaceId, patch = {}) {
  const workspace = workspaceForId(data, workspaceId);
  const next = workspaceSettingsSchema.parse({
    ...(workspace.settings || data.workspaceSettings || {}),
    ...patch,
    workspaceId: workspace.id
  });
  workspace.settings = next;
  workspace.name = next.organizationName || workspace.name;
  workspace.slug = workspaceSlug(workspace.name);
  workspace.updatedAt = new Date().toISOString();
  if (workspace.id === DEFAULT_WORKSPACE_ID) data.workspaceSettings = next;
  return next;
}

function workspaceScopeForUser(data, user) {
  return scopedWorkspaceData(data, user?.workspaceId || DEFAULT_WORKSPACE_ID);
}

function applyDataMigrations(data) {
  const now = new Date().toISOString();
  const meta = ensureRecord(data, "dataMeta");
  const fromVersion = Number(meta.schemaVersion || 0);
  const applied = [];
  if (fromVersion < 1) {
    for (const key of [...COLLECTIONS, ...RESTORABLE_EXTRA_KEYS, "sessions", "billingSessions", "invoices"]) {
      if (COLLECTIONS.includes(key) || key === "users" || key === "workspaces" || key === "sessions" || key === "billingSessions" || key === "invoices") ensureArray(data, key);
    }
    ensureRecord(data, "workspaceSettings");
    ensureRecord(data, "costCatalog");
    ensureRecord(data, "profileDefaults");
    ensureRecord(data, "profileMatchingPolicy");
    applied.push({ version: 1, name: "core collection defaults", appliedAt: now });
  }
  if (fromVersion < 2) {
    for (const user of ensureArray(data, "users")) {
      user.id ||= randomUUID();
      user.lastSeen ||= "Never";
      user.location ||= "HQ";
      user.passwordResetRequired = Boolean(user.passwordResetRequired);
      if (user.twoFactorEnabled && !user.twoFactorSecret) user.twoFactorEnabled = false;
      if (!Array.isArray(user.twoFactorRecoveryCodeHashes)) user.twoFactorRecoveryCodeHashes = [];
    }
    for (const key of ensureArray(data, "apiKeys")) {
      key.id ||= randomUUID();
      key.enabled = key.enabled !== false;
      key.createdAt ||= now;
    }
    applied.push({ version: 2, name: "account security metadata", appliedAt: now });
  }
  if (fromVersion < 3) {
    for (const collection of ["printers", "files", "fileFolders", "queue", "spools", "purchaseRequests", "maintenance", "maintenanceTemplates", "parts", "skus", "productionTemplates", "quoteRequests", "orders", "profiles", "webhooks", "notificationChannels", "commerceConnectors", "bridges", "events"]) {
      for (const item of ensureArray(data, collection)) {
        item.id ||= randomUUID();
        item.createdAt ||= item.at || item.updatedAt || now;
        item.updatedAt ||= item.at || item.createdAt || now;
      }
    }
    data.dataMeta ||= {};
    data.dataMeta.integrityLastCheckedAt ||= "";
    applied.push({ version: 3, name: "operational ids and timestamps", appliedAt: now });
  }
  if (fromVersion < 4) {
    const workspace = ensureWorkspaceCatalog(data, now);
    markWorkspaceDefaults(data, workspace.id);
    applied.push({ version: 4, name: "workspace tenant scoping", appliedAt: now });
  }
  data.dataMeta = {
    ...meta,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    migratedAt: applied.length ? now : meta.migratedAt || now,
    migrations: [...(Array.isArray(meta.migrations) ? meta.migrations : []), ...applied]
  };
  if (applied.length) {
    ensureArray(data, "events").unshift({
      id: randomUUID(),
      type: "system.migrated",
      message: `Database schema migrated ${fromVersion || 0} -> ${CURRENT_SCHEMA_VERSION}`,
      data: { fromVersion: fromVersion || 0, toVersion: CURRENT_SCHEMA_VERSION, applied: applied.map((item) => item.name) },
      at: now
    });
  }
  return { fromVersion: fromVersion || 0, toVersion: CURRENT_SCHEMA_VERSION, applied };
}

async function writePreMigrationBackup(file, data, migration) {
  if (!migration.applied.length || !envFlagDefault("LAYERPILOT_AUTO_BACKUP_ON_MIGRATE", true)) return "";
  try {
    await stat(file);
  } catch {
    return "";
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${file}.pre-migration-${migration.fromVersion}-to-${migration.toVersion}-${stamp}.bak.json`;
  await writeFile(backupPath, JSON.stringify({ service: "3DSTU FarmFlow", exportedAt: new Date().toISOString(), reason: "pre-migration-backup", data }, null, 2));
  return backupPath;
}

async function buildDataIntegrityReport(data, options = {}) {
  const errors = [];
  const warnings = [];
  let storage = { checked: false, complete: true, expected: 0, present: 0, bytes: 0, missing: [] };
  const ids = (items = []) => new Set(items.map((item) => item.id).filter(Boolean));
  const printerIds = ids(data.printers);
  const fileIds = ids(data.files);
  const userIds = ids(data.users);
  const spoolIds = ids(data.spools);
  const partNames = new Set((data.parts || []).map((part) => String(part.name || "").toLowerCase()).filter(Boolean));
  const seenEmails = new Set();
  for (const user of data.users || []) {
    const email = String(user.email || "").toLowerCase();
    if (!email) errors.push({ code: "user.email_missing", message: `User ${user.id || "unknown"} is missing an email` });
    if (email && seenEmails.has(email)) errors.push({ code: "user.email_duplicate", message: `Duplicate user email ${email}` });
    if (email) seenEmails.add(email);
    if (!String(user.passwordHash || "").startsWith("scrypt$")) warnings.push({ code: "user.password_hash_missing", message: `${email || user.id} needs a password reset` });
    if (user.twoFactorEnabled && !user.twoFactorSecret) errors.push({ code: "user.2fa_secret_missing", message: `${email || user.id} has 2FA enabled without a secret` });
  }
  for (const session of data.sessions || []) {
    if (!userIds.has(session.userId)) warnings.push({ code: "session.user_missing", message: `Session ${session.id || session.token || "unknown"} points to a missing user` });
  }
  if (options.checkStorage) {
    const manifest = await buildBackupStorageManifest(data, Number.MAX_SAFE_INTEGER);
    storage = {
      checked: true,
      complete: manifest.missing.length === 0,
      expected: manifest.files.length + manifest.missing.length,
      present: manifest.files.length,
      bytes: manifest.bytes,
      missing: manifest.missing
    };
    for (const file of manifest.missing) {
      warnings.push({ code: "file.storage_missing", message: `${file.name || file.fileId} has a missing storage object`, fileId: file.fileId });
    }
  }
  for (const job of data.queue || []) {
    if (job.fileId && !fileIds.has(job.fileId)) warnings.push({ code: "queue.file_missing", message: `${job.file || job.id} references missing file ${job.fileId}` });
    if (job.printerId && !printerIds.has(job.printerId)) errors.push({ code: "queue.printer_missing", message: `${job.file || job.id} references missing printer ${job.printerId}` });
  }
  for (const part of data.parts || []) {
    if (part.fileId && !fileIds.has(part.fileId)) warnings.push({ code: "part.file_missing", message: `${part.name || part.id} references missing file ${part.fileId}` });
  }
  for (const sku of data.skus || []) {
    for (const partName of sku.parts || []) {
      if (!partNames.has(String(partName).toLowerCase())) warnings.push({ code: "sku.part_missing", message: `${sku.sku || sku.id} references missing part ${partName}` });
    }
  }
  for (const request of data.purchaseRequests || []) {
    if (request.spoolId && !spoolIds.has(request.spoolId)) warnings.push({ code: "purchase_request.spool_missing", message: `${request.material || request.id} reorder references missing spool ${request.spoolId}` });
  }
  for (const template of data.productionTemplates || []) {
    if (template.fileId && !fileIds.has(template.fileId)) warnings.push({ code: "production_template.file_missing", message: `${template.name || template.id} references missing file ${template.fileId}` });
    if (template.printerId && !printerIds.has(template.printerId)) warnings.push({ code: "production_template.printer_missing", message: `${template.name || template.id} references missing printer ${template.printerId}` });
  }
  for (const bridge of data.bridges || []) {
    if (bridge.printerId && !printerIds.has(bridge.printerId)) warnings.push({ code: "bridge.printer_missing", message: `${bridge.name || bridge.id} references missing printer ${bridge.printerId}` });
  }
  for (const key of data.apiKeys || []) {
    if (!String(key.secretHash || "").startsWith("scrypt$")) warnings.push({ code: "api_key.secret_hash_missing", message: `${key.name || key.id} has no hashed secret and should stay disabled` });
  }
  const now = new Date().toISOString();
  return {
    ok: errors.length === 0,
    checkedAt: now,
    schemaVersion: Number(data.dataMeta?.schemaVersion || 0),
    counts: Object.fromEntries([...COLLECTIONS, "users", "sessions"].map((key) => [key, Array.isArray(data[key]) ? data[key].length : 0])),
    storage,
    auditRetention: {
      enabled: data.workspaceSettings?.auditLogRetention !== false,
      days: auditRetentionDays(data.workspaceSettings || {}),
      events: Array.isArray(data.events) ? data.events.length : 0,
      lastRunAt: data.dataMeta?.auditRetentionLastRunAt || ""
    },
    errors,
    warnings
  };
}

function metricsTokenFromRequest(request) {
  const headerToken = String(request.headers["x-layerpilot-metrics-token"] || "").trim();
  if (headerToken) return headerToken;
  if (process.env.NODE_ENV === "production") return "";
  return String(request.query?.metricsToken || request.query?.token || "").trim();
}

function hasValidMetricsToken(request) {
  const expected = String(process.env.LAYERPILOT_METRICS_TOKEN || "").trim();
  if (!expected) return false;
  const actual = metricsTokenFromRequest(request);
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function workerTokenFromRequest(request) {
  const headerToken = String(request.headers["x-layerpilot-worker-token"] || "").trim();
  if (headerToken) return headerToken;
  if (process.env.NODE_ENV === "production") return "";
  return String(request.query?.workerToken || request.query?.token || "").trim();
}

function hasValidWorkerToken(request) {
  const expected = String(process.env.LAYERPILOT_WORKER_TOKEN || "").trim();
  if (!expected) return false;
  const actual = workerTokenFromRequest(request);
  if (!actual) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function bootstrapAdminFromEnv(data, now) {
  const email = String(process.env.LAYERPILOT_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.LAYERPILOT_ADMIN_PASSWORD || "");
  if (!email && !password) return "";
  if (!email || !password) throw new Error("LAYERPILOT_ADMIN_EMAIL and LAYERPILOT_ADMIN_PASSWORD must be set together");
  if (password.length < 8) throw new Error("LAYERPILOT_ADMIN_PASSWORD must be at least 8 characters");
  const name = String(process.env.LAYERPILOT_ADMIN_NAME || "Production Owner").trim() || "Production Owner";
  const workspace = String(process.env.LAYERPILOT_WORKSPACE_NAME || "").trim();
  const existing = data.users.find((user) => String(user.email || "").toLowerCase() === email);
  const user = existing || {
    id: randomUUID(),
    email,
    workspaceId: DEFAULT_WORKSPACE_ID,
    location: "HQ",
    lastSeen: "Never"
  };
  user.name = name;
  user.email = email;
  user.role = "Owner";
  user.location ||= "HQ";
  user.passwordHash = createPasswordHash(password);
  user.updatedAt = now;
  if (!existing) data.users.unshift(user);
  if (workspace) {
    data.workspaceSettings.organizationName = workspace;
    const defaultWorkspace = workspaceForId(data, user.workspaceId || DEFAULT_WORKSPACE_ID);
    defaultWorkspace.name = workspace;
    defaultWorkspace.slug = workspaceSlug(workspace);
    defaultWorkspace.settings = workspaceSettingsSchema.parse({ ...defaultWorkspace.settings, organizationName: workspace, workspaceId: defaultWorkspace.id });
    data.workspaceSettings = defaultWorkspace.settings;
  }
  return email;
}

function sanitizeUser(user) {
  if (!user) return null;
  const { passwordHash, twoFactorSecret, twoFactorRecoveryCodeHashes, ...safeUser } = user;
  return { ...safeUser, twoFactor: twoFactorStatus(user), twoFactorEnabled: twoFactorStatus(user).enabled };
}

function sanitizeDataMeta(meta = {}) {
  const { idempotencyKeys, ...safeMeta } = meta || {};
  return safeMeta;
}

function endpointHost(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}

function redactEndpointUrl(value) {
  if (!String(value || "").trim()) return "";
  const host = endpointHost(value);
  return host ? `${host} (redacted)` : "redacted endpoint";
}

function normalizeAddonStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (addonStatusSchema.safeParse(normalized).success) return normalized;
  if (normalized === "ready") return "available";
  return "available";
}

function ensureAddonCatalog(addons = []) {
  const now = new Date().toISOString();
  const byId = new Map(addons.map((addon) => [addon.id, addon]));
  return defaultAddons.map((defaultAddon) => {
    const existing = byId.get(defaultAddon.id) || {};
    const status = normalizeAddonStatus(existing.status || defaultAddon.status);
    return {
      ...defaultAddon,
      ...existing,
      id: defaultAddon.id,
      name: existing.name || defaultAddon.name,
      description: existing.description || defaultAddon.description,
      category: existing.category || defaultAddon.category,
      status,
      enabled: status === "enabled",
      config: existing.config && typeof existing.config === "object" ? existing.config : {},
      createdAt: existing.createdAt || now,
      updatedAt: existing.updatedAt || ""
    };
  });
}

async function ensureAuthData(database, options = {}) {
  database.data.users ||= [];
  database.data.sessions ||= [];
  database.data.bridges ||= [];
  database.data.fileFolders ||= [];
  database.data.todoActions ||= [];
  database.data.maintenanceTemplates ||= [];
  database.data.maintenanceReports ||= [];
  database.data.productionTemplates ||= [];
  database.data.purchaseRequests ||= [];
  database.data.quoteRequests ||= [];
  database.data.webhooks ||= [];
  database.data.webhookDeliveries ||= [];
  database.data.notificationChannels ||= [];
  database.data.notificationDeliveries ||= [];
  database.data.mqttDeliveries ||= [];
  database.data.commerceConnectors ||= [];
  database.data.commerceImports ||= [];
  database.data.apiKeys ||= [];
  database.data.slicerJobs ||= [];
  database.data.billingSessions ||= [];
  database.data.invoices ||= [];
  database.data.workspaces ||= [];
  database.data.materialMappings ||= [];
  database.data.materialMapRuns ||= [];
  database.data.dataMeta ||= {};
  database.data.dataMeta.idempotencyKeys ||= [];
  database.data.addons = ensureAddonCatalog(database.data.addons || []);
  database.data.workspaceSettings = workspaceSettingsSchema.parse(database.data.workspaceSettings || {});
  database.data.costCatalog = costCatalogSchema.parse({ ...defaultCostCatalog, ...(database.data.costCatalog || {}) });
  database.data.profileDefaults = profileDefaultsSchema.parse(database.data.profileDefaults || {});
  database.data.profileMatchingPolicy = profileMatchingPolicySchema.parse(database.data.profileMatchingPolicy || {});
  const now = new Date().toISOString();
  const defaultWorkspace = ensureWorkspaceCatalog(database.data, now);
  markWorkspaceDefaults(database.data, defaultWorkspace.id);
  const bootstrapEmail = bootstrapAdminFromEnv(database.data, now);
  const disableDefaultUsers = envFlag("LAYERPILOT_DISABLE_DEFAULT_USERS");
  const disableDemoLogin = disableDefaultUsers || envFlag("LAYERPILOT_DISABLE_DEMO_LOGIN") || options.skipDemoUser;
  if (disableDefaultUsers) {
    database.data.users = database.data.users.filter((user) => {
      const email = String(user.email || "").toLowerCase();
      return !defaultSeedUserEmails.has(email) || email === bootstrapEmail;
    });
  }
  const demo = database.data.users.find((user) => user.email === "demo@layerpilot.test");
  if (!demo && !disableDemoLogin) {
    database.data.users.unshift({
      id: "u0",
      workspaceId: defaultWorkspace.id,
      name: "Demo Operator",
      email: "demo@layerpilot.test",
      role: "Admin",
      location: "Demo Farm",
      lastSeen: "Now",
      passwordHash: createPasswordHash(defaultPasswords.get("demo@layerpilot.test"))
    });
  }
  for (const user of database.data.users) {
    user.workspaceId ||= defaultWorkspace.id;
    const roleResult = roleSchema.safeParse(user.role);
    if (!roleResult.success) user.role = "Viewer";
    user.location ||= "HQ";
    user.lastSeen ||= "Never";
    user.passwordHash ||= createPasswordHash(defaultPasswords.get(user.email) || "layerpilot");
    user.updatedAt ||= now;
  }
  for (const spool of database.data.spools || []) {
    spool.brand ||= "Generic";
    spool.weight ||= 1000;
    spool.remaining = Number(spool.remaining ?? spool.weight);
    spool.location ||= "Rack";
    spool.color ||= "#0ea5e9";
    spool.dry = spool.dry ?? true;
    spool.nfc ||= `LP-${String(spool.material || "SPOOL").toUpperCase()}-${String(spool.id || randomUUID()).slice(0, 4)}`;
  }
  for (const request of database.data.purchaseRequests || []) {
    request.material ||= "PLA";
    request.color ||= "Any";
    request.brand ||= "Generic";
    request.quantity = Math.max(1, Number(request.quantity || 1));
    request.targetGrams = Math.max(1, Number(request.targetGrams || 1000));
    request.supplier ||= "Preferred supplier";
    request.priority = severitySchema.safeParse(request.priority).success ? request.priority : "Medium";
    request.status = purchaseStatusSchema.safeParse(request.status).success ? request.status : "open";
    request.due ||= "This week";
    request.note ||= "";
    request.spoolId ||= "";
  }
  for (const job of database.data.maintenance || []) {
    job.status = maintenanceStatusSchema.safeParse(job.status).success ? job.status : "scheduled";
    job.progress ||= job.status === "done" ? "Complete" : "0/4";
    job.severity = severitySchema.safeParse(job.severity).success ? job.severity : "Medium";
    job.due ||= "Next week";
  }
  for (const order of database.data.orders || []) {
    order.source ||= "Manual";
    order.customer ||= "Unknown customer";
    order.items = Array.isArray(order.items) && order.items.length ? order.items : ["Manual item x1"];
    order.status = orderStatusSchema.safeParse(order.status).success ? order.status : "received";
    order.due ||= "Tomorrow 17:00";
    order.value = Number(order.value || 0);
  }
  for (const quote of database.data.quoteRequests || []) {
    quote.customer ||= "Unknown customer";
    quote.email ||= "unknown@example.com";
    quote.company ||= "";
    quote.project ||= "3D print request";
    quote.material ||= "PLA";
    quote.quantity = Math.max(1, Number(quote.quantity || 1));
    quote.due ||= "Flexible";
    quote.budget = Number(quote.budget || 0);
    quote.notes ||= "";
    quote.fileName ||= "";
    quote.fileId ||= "";
    quote.fileType ||= "";
    quote.fileSize ||= "";
    quote.source ||= "Website";
    quote.status = quoteStatusSchema.safeParse(quote.status).success ? quote.status : "new";
    quote.priority = prioritySchema.safeParse(quote.priority).success ? quote.priority : "Normal";
    quote.quotedValue = Number(quote.quotedValue || 0);
    quote.internalNote ||= "";
    quote.validUntil ||= "";
    quote.customerAccessToken ||= randomBytes(18).toString("base64url");
  }
  for (const part of database.data.parts || []) {
    part.process ||= "0.20mm Production";
    part.plates = Number(part.plates || 1);
    part.variants = Array.isArray(part.variants) ? part.variants : [];
    part.status = partSchema.shape.status.safeParse(part.status).success ? part.status : "draft";
  }
  for (const profile of database.data.profiles || []) {
    profile.kind = profileKindSchema.safeParse(profile.kind).success ? profile.kind : "Process";
    profile.source = profileSourceSchema.safeParse(profile.source).success ? profile.source : "Manual";
    profile.target ||= "FDM fleet";
    profile.updated ||= "Imported";
    profile.settings = profile.settings && typeof profile.settings === "object" ? profile.settings : {};
  }
  for (const kind of ["Machine", "Process", "Filament"]) {
    const defaultId = database.data.profileDefaults[kind];
    if (defaultId && !(database.data.profiles || []).some((profile) => profile.id === defaultId && profile.kind === kind)) {
      database.data.profileDefaults[kind] = "";
    }
  }
  for (const sku of database.data.skus || []) {
    sku.parts = Array.isArray(sku.parts) && sku.parts.length ? sku.parts : [];
    sku.variants = Array.isArray(sku.variants) ? sku.variants : [];
    sku.price = Number(sku.price || 0);
    sku.stock = Number(sku.stock || 0);
    sku.channel ||= "Manual";
  }
  for (const template of database.data.productionTemplates || []) {
    template.sku ||= "";
    template.color ||= "Any";
    template.priority = prioritySchema.safeParse(template.priority).success ? template.priority : "Normal";
    template.stage = taskStageSchema.safeParse(template.stage).success ? template.stage : "needs scheduling";
    template.printerId ||= "";
    template.process ||= "0.20mm Production";
    template.dueOffsetDays = Number.isFinite(Number(template.dueOffsetDays)) ? Number(template.dueOffsetDays) : 2;
    template.quantity = Math.max(1, Number(template.quantity || 1));
    template.time ||= "1h 00m";
    template.cost = Number(template.cost || 0);
    template.notes ||= "";
  }
  for (const webhook of database.data.webhooks || []) {
    webhook.name ||= "Webhook";
    webhook.url ||= "";
    webhook.events = Array.isArray(webhook.events) && webhook.events.length ? webhook.events : ["*"];
    webhook.enabled = Boolean(webhook.enabled);
    webhook.lastStatus ||= "not sent";
  }
  for (const channel of database.data.notificationChannels || []) {
    channel.name ||= "Notification channel";
    channel.type = notificationChannelSchema.shape.type.safeParse(channel.type).success ? channel.type : "custom";
    channel.url ||= "";
    channel.token ||= "";
    channel.events = Array.isArray(channel.events) && channel.events.length ? channel.events : ["*"];
    channel.enabled = Boolean(channel.enabled);
    channel.recipients = Array.isArray(channel.recipients) ? channel.recipients : [];
    channel.lastStatus ||= "not sent";
  }
  for (const connector of database.data.commerceConnectors || []) {
    connector.name ||= "Commerce feed";
    connector.source = commerceSourceSchema.safeParse(connector.source).success ? connector.source : "Generic";
    connector.url ||= "";
    connector.token ||= "";
    connector.enabled = connector.enabled !== false;
    connector.mapping = connector.mapping && typeof connector.mapping === "object" ? connector.mapping : {};
    connector.lastStatus ||= "not synced";
  }
  for (const key of database.data.apiKeys || []) {
    key.name ||= "Automation key";
    key.prefix ||= "lp_live_legacy";
    const restoredScopes = normalizeApiKeyScopes(key.scopes);
    if (restoredScopes.length) {
      key.scopes = restoredScopes;
    } else if (Array.isArray(key.scopes) && key.scopes.length) {
      key.scopes = ["queue:write"];
      key.enabled = false;
      key.scopeMigrationWarning = "Disabled because restored scopes were not grantable automation scopes";
    } else {
      key.scopes = ["queue:write"];
    }
    key.enabled = key.enabled !== false;
    key.createdAt ||= now;
    key.lastUsedAt ||= "";
  }
  applyAuditRetention(database.data, { now });
  await database.write();
}

function hasPermission(user, permission) {
  if (Array.isArray(user?.apiScopes)) return user.apiScopes.includes("*") || user.apiScopes.includes(permission);
  const permissions = rolePermissions[user?.role] || rolePermissions.Viewer;
  return permissions.has("*") || permissions.has(permission);
}

function isAdminRole(user) {
  return user?.role === "Owner" || user?.role === "Admin";
}

function isTwoFactorEnrollmentRoute(method, routePath) {
  if (method === "GET" && routePath === "/api/auth/me") return true;
  if (method === "POST" && routePath === "/api/auth/logout") return true;
  if (method === "POST" && routePath === "/api/auth/change-password") return true;
  if (method === "POST" && routePath === "/api/auth/2fa/setup") return true;
  if (method === "POST" && routePath === "/api/auth/2fa/enable") return true;
  return false;
}

function requiresProductionAdminTwoFactor(data, user, method, routePath) {
  if (process.env.NODE_ENV !== "production") return false;
  if (!isAdminRole(user)) return false;
  if (twoFactorStatus(user).enabled) return false;
  const settings = workspaceScopeForUser(data, user).workspaceSettings || {};
  if (settings.requireAdmin2fa !== true) return false;
  return !isTwoFactorEnrollmentRoute(method, routePath);
}

function productionRequiresAdminTwoFactor(data, user) {
  if (process.env.NODE_ENV !== "production") return false;
  if (!isAdminRole(user)) return false;
  const settings = workspaceScopeForUser(data, user).workspaceSettings || {};
  return settings.requireAdmin2fa === true;
}

const apiKeyReadScopeRules = [
  { pattern: /^\/api\/metrics$/, scopes: ["metrics:read"] },
  { pattern: /^\/api\/audit(?:\/export)?$/, scopes: ["admin:export"] },
  { pattern: /^\/api\/admin\/(?:export|integrity)$/, scopes: ["admin:export"] },
  { pattern: /^\/api\/catalog\/export$/, scopes: ["catalog:write"] },
  { pattern: /^\/api\/costCatalog$/, scopes: ["catalog:write"] },
  { pattern: /^\/api\/(?:parts|skus|profiles|productionTemplates|materialMappings|materialMapRuns)$/, scopes: ["catalog:write", "orders:write", "queue:write"] },
  { pattern: /^\/api\/(?:orders|quoteRequests)$/, scopes: ["orders:write", "commerce:write", "queue:write"] },
  { pattern: /^\/api\/(?:queue|todos|history|schedule\/diagnostics|slicer\/jobs)$/, scopes: ["queue:write", "actions:write"] },
  { pattern: /^\/api\/(?:printers|bridges)$/, scopes: ["printers:control", "queue:write", "maintenance:write"] },
  { pattern: /^\/api\/(?:files|fileFolders)$/, scopes: ["files:write", "queue:write", "orders:write"] },
  { pattern: /^\/api\/files\/[^/]+\/(?:download|preview)$/, scopes: ["files:write"] },
  { pattern: /^\/api\/(?:spools|purchaseRequests)$/, scopes: ["inventory:write", "queue:write"] },
  { pattern: /^\/api\/(?:maintenance|maintenanceTemplates|maintenanceReports)$/, scopes: ["maintenance:write"] },
  { pattern: /^\/api\/(?:webhooks|webhookDeliveries)$/, scopes: ["webhooks:write"] },
  { pattern: /^\/api\/(?:notificationChannels|notificationDeliveries)$/, scopes: ["notifications:write"] },
  { pattern: /^\/api\/(?:commerceConnectors|commerceImports)$/, scopes: ["commerce:write"] },
  { pattern: /^\/api\/admin\/restore$/, scopes: ["admin:restore"] }
];

function apiKeyReadScopesForRoute(method, routePath) {
  if (String(method || "").toUpperCase() !== "GET") return null;
  const normalized = String(routePath || "").replace(/\/+$/, "") || "/";
  return apiKeyReadScopeRules.find((rule) => rule.pattern.test(normalized))?.scopes || [];
}

function apiKeyCanReadRoute(user, method, routePath) {
  const scopes = apiKeyReadScopesForRoute(method, routePath);
  if (scopes === null) return true;
  return scopes.some((scope) => hasPermission(user, scope));
}

function normalizeApiKeyScopes(scopes) {
  const normalized = [];
  for (const scope of Array.isArray(scopes) ? scopes : []) {
    const value = String(scope || "").trim();
    if (!apiKeyGrantableScopeSet.has(value) || normalized.includes(value)) continue;
    normalized.push(value);
  }
  return normalized;
}

function isMutatingApiRequest(request) {
  return ["POST", "PATCH", "PUT", "DELETE"].includes(String(request.method || "").toUpperCase()) && String(request.url || "").startsWith("/api/");
}

function idempotencyEligibleRoute(method, routePath) {
  if (method === "POST" && routePath === "/api/orders") return true;
  if (method === "POST" && routePath === "/api/queue") return true;
  if (method === "POST" && routePath === "/api/queue/match") return true;
  if (method === "POST" && routePath === "/api/actions") return true;
  if (method === "POST" && routePath === "/api/file-folders") return true;
  if (method === "POST" && routePath === "/api/files") return true;
  if (method === "POST" && routePath === "/api/files/upload") return true;
  if (method === "POST" && routePath === "/api/files/sample") return true;
  if (method === "POST" && routePath === "/api/hot-drop") return true;
  if (method === "POST" && routePath === "/api/parametric/nameplate") return true;
  if (method === "POST" && routePath === "/api/printers") return true;
  if (method === "POST" && routePath === "/api/parts") return true;
  if (method === "POST" && routePath === "/api/skus") return true;
  if (method === "POST" && routePath === "/api/productionTemplates") return true;
  if (method === "POST" && routePath === "/api/profiles") return true;
  if (method === "POST" && routePath === "/api/profiles/import") return true;
  if (method === "POST" && routePath === "/api/spools") return true;
  if (method === "POST" && routePath === "/api/spools/labels") return true;
  if (method === "POST" && routePath === "/api/spools/scan") return true;
  if (method === "POST" && routePath === "/api/maintenance") return true;
  if (method === "POST" && routePath === "/api/maintenance/templates") return true;
  if (method === "POST" && routePath === "/api/maintenance/reports") return true;
  if (method === "POST" && routePath === "/api/webhooks") return true;
  if (method === "POST" && routePath === "/api/notificationChannels") return true;
  if (method === "POST" && routePath === "/api/commerceConnectors") return true;
  if (method === "POST" && routePath === "/api/bridges") return true;
  if (method === "POST" && routePath === "/api/public/quoteRequests") return true;
  if (method === "POST" && routePath === "/api/catalog/material-map") return true;
  if (method === "POST" && routePath === "/api/commerce/import-csv") return true;
  if (method === "POST" && routePath === "/api/purchaseRequests") return true;
  if (method === "POST" && routePath === "/api/purchaseRequests/reorderPlan") return true;
  if (method === "POST" && routePath === "/api/apiKeys") return true;
  if (method === "POST" && routePath === "/api/users") return true;
  if (method === "POST" && routePath === "/api/admin/audit-retention/run") return true;
  if (method === "POST" && routePath === "/api/support/snapshot") return true;
  if (method === "POST" && routePath === "/api/billing/portal") return true;
  if (method === "POST" && routePath === "/api/telemetry/tick") return true;
  if (method === "POST" && routePath === "/api/bridges/sync") return true;
  if (method === "POST" && routePath === "/api/slicer/jobs") return true;
  if (method === "POST" && /^\/api\/schedule\/(auto|optimize|constraint)$/.test(routePath)) return true;
  if (method === "PATCH" && routePath === "/api/workspaceSettings") return true;
  if (method === "PATCH" && routePath === "/api/billing/plan") return true;
  if (method === "PATCH" && routePath === "/api/costCatalog") return true;
  if (method === "PATCH" && routePath === "/api/profile-policy") return true;
  if (method === "PATCH" && /^\/api\/addons\/[^/]+$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/webhooks\/[^/]+$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/notificationChannels\/[^/]+$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/commerceConnectors\/[^/]+$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/apiKeys\/[^/]+$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/users\/[^/]+$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/onboarding\/[^/]+$/.test(routePath)) return true;
  if (method === "POST" && /^\/api\/public\/quoteRequests\/[^/]+\/decision$/.test(routePath)) return true;
  if (method === "POST" && /^\/api\/orders\/[^/]+\/generate-jobs$/.test(routePath)) return true;
  if (method === "POST" && /^\/api\/quoteRequests\/[^/]+\/customer-link$/.test(routePath)) return true;
  if (method === "POST" && /^\/api\/quoteRequests\/[^/]+\/convert-order$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/quoteRequests\/[^/]+$/.test(routePath)) return true;
  if (method === "POST" && /^\/api\/todos\/[^/]+\/action$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/history\/[^/]+$/.test(routePath)) return true;
  if (method === "POST" && /^\/api\/history\/[^/]+\/reprint$/.test(routePath)) return true;
  if (method === "POST" && /^\/api\/webhooks\/[^/]+\/test$/.test(routePath)) return true;
  if (method === "POST" && /^\/api\/notificationChannels\/[^/]+\/test$/.test(routePath)) return true;
  if (method === "POST" && /^\/api\/commerceConnectors\/[^/]+\/test$/.test(routePath)) return true;
  if (method === "POST" && /^\/api\/bridges\/[^/]+\/test$/.test(routePath)) return true;
  if (method === "POST" && /^\/api\/printers\/[^/]+\/sync$/.test(routePath)) return true;
  if (method === "POST" && /^\/api\/productionTemplates\/[^/]+\/run$/.test(routePath)) return true;
  if (method === "POST" && /^\/api\/commerceConnectors\/[^/]+\/import$/.test(routePath)) return true;
  if (method === "POST" && /^\/api\/purchaseRequests\/[^/]+\/receive$/.test(routePath)) return true;
  if (method === "POST" && /^\/api\/users\/[^/]+\/reset-password$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/purchaseRequests\/[^/]+$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/printers\/[^/]+$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/printers\/[^/]+\/status$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/parts\/[^/]+$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/skus\/[^/]+$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/productionTemplates\/[^/]+$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/profiles\/[^/]+$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/profiles\/[^/]+\/default$/.test(routePath)) return true;
  if (method === "DELETE" && /^\/api\/profiles\/[^/]+$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/orders\/[^/]+\/status$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/files\/[^/]+\/version$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/files\/[^/]+\/slice$/.test(routePath)) return true;
  if (method === "DELETE" && /^\/api\/files\/[^/]+$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/spools\/[^/]+$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/spools\/[^/]+\/usage$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/maintenance\/[^/]+$/.test(routePath)) return true;
  if (method === "PATCH" && /^\/api\/queue\/[^/]+\/(schedule|status|priority)$/.test(routePath)) return true;
  return false;
}

function idempotencyKeyFromRequest(request) {
  const raw = request.headers["idempotency-key"] || request.headers["x-idempotency-key"];
  const key = Array.isArray(raw) ? raw[0] : raw;
  return String(key || "").trim();
}

function stableSerialize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Buffer.isBuffer(value)) return JSON.stringify(value.toString("base64"));
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function requestBodyDigest(body) {
  if (body === undefined) return sha256("");
  return sha256(stableSerialize(body));
}

function uploadRequestBodyDigest({ filename, material, folder, buffer }) {
  const byteDigest = Buffer.isBuffer(buffer) ? createHash("sha256").update(buffer).digest("hex") : "";
  return sha256(stableSerialize({
    filename: path.basename(filename || "model.stl"),
    material: material || "PLA",
    folder: folder || "Uploads",
    byteDigest
  }));
}

function ensureIdempotencyLedger(data) {
  data.dataMeta ||= {};
  if (!Array.isArray(data.dataMeta.idempotencyKeys)) data.dataMeta.idempotencyKeys = [];
  return data.dataMeta.idempotencyKeys;
}

function pruneIdempotencyLedger(data, now = new Date()) {
  const cutoff = now.getTime() - IDEMPOTENCY_RETENTION_MS;
  const retained = ensureIdempotencyLedger(data)
    .filter((record) => {
      const createdAt = Date.parse(record.createdAt || "");
      return Number.isFinite(createdAt) && createdAt >= cutoff;
    })
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .slice(0, IDEMPOTENCY_MAX_RECORDS);
  data.dataMeta.idempotencyKeys = retained;
  return retained;
}

function idempotencyFingerprint({ method, path: routePath, workspaceId, bodyDigest }) {
  return sha256([method, routePath, workspaceId || DEFAULT_WORKSPACE_ID, bodyDigest].join("\n"));
}

function sendIdempotentReplay(reply, record) {
  reply.header("x-layerpilot-idempotent-replay", "true");
  if (record.contentType) reply.header("content-type", record.contentType);
  reply.code(record.statusCode || 200).send(record.responseBody || "");
}

function isRestoreCommitRequest(method, routePath, body) {
  return method === "POST" && routePath === "/api/admin/restore" && body?.dryRun === false && body?.confirm === "RESTORE";
}

async function replayCommittedRestoreRequest(database, request, reply, { workspaceId, actorId } = {}) {
  const method = String(request.method || "").toUpperCase();
  const routePath = request.url.split("?")[0];
  if (!isRestoreCommitRequest(method, routePath, request.body)) return false;
  const key = idempotencyKeyFromRequest(request);
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(key)) return false;
  const bodyDigest = requestBodyDigest(request.body);
  const ledger = pruneIdempotencyLedger(database.data);
  const existing = ledger.find((record) => {
    if (record.key !== key || record.method !== method || record.path !== routePath) return false;
    if (workspaceId && record.workspaceId !== workspaceId) return false;
    if (actorId && record.actorId !== actorId) return false;
    const fingerprint = idempotencyFingerprint({ method, path: routePath, workspaceId: record.workspaceId, bodyDigest });
    return record.fingerprint === fingerprint && Number(record.statusCode || 0) >= 200 && Number(record.statusCode || 0) < 300;
  });
  if (!existing) return false;
  existing.replayCount = Number(existing.replayCount || 0) + 1;
  existing.updatedAt = new Date().toISOString();
  await database.write();
  sendIdempotentReplay(reply, existing);
  return true;
}

function publicIdempotencyContext(method, routePath) {
  if (method === "POST" && routePath === "/api/public/quoteRequests") {
    return { workspaceId: DEFAULT_WORKSPACE_ID, actorId: "public:quote-intake" };
  }
  const publicQuoteDecision = method === "POST" ? routePath.match(/^\/api\/public\/quoteRequests\/([^/]+)\/decision$/) : null;
  if (publicQuoteDecision) {
    return { workspaceId: DEFAULT_WORKSPACE_ID, actorId: `public:quote-decision:${publicQuoteDecision[1]}` };
  }
  return null;
}

async function prepareIdempotentRequest(database, request, reply, { workspaceId, actorId, bodyDigest: bodyDigestOverride }) {
  if (!isMutatingApiRequest(request)) return false;
  const key = idempotencyKeyFromRequest(request);
  if (!key) return false;
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(key)) {
    reply.code(400).send({ error: "Invalid Idempotency-Key" });
    return true;
  }
  const method = String(request.method || "").toUpperCase();
  const routePath = request.url.split("?")[0];
  if (!idempotencyEligibleRoute(method, routePath)) return false;
  const bodyDigest = bodyDigestOverride || requestBodyDigest(request.body);
  const fingerprint = idempotencyFingerprint({ method, path: routePath, workspaceId, bodyDigest });
  const ledger = pruneIdempotencyLedger(database.data);
  const existing = ledger.find((record) => record.workspaceId === workspaceId && record.actorId === actorId && record.key === key);
  if (existing) {
    if (existing.fingerprint !== fingerprint || existing.method !== method || existing.path !== routePath) {
      reply.code(409).send({ error: "Idempotency key already used with a different request", key, firstUsedAt: existing.createdAt });
      return true;
    }
    existing.replayCount = Number(existing.replayCount || 0) + 1;
    existing.updatedAt = new Date().toISOString();
    await database.write();
    sendIdempotentReplay(reply, existing);
    return true;
  }
  request.idempotency = { key, method, path: routePath, workspaceId, actorId, bodyDigest, fingerprint, createdAt: new Date().toISOString() };
  return false;
}

function idempotencyActorForRequest(request) {
  const user = request.user || {};
  return request.apiKey ? `api-key:${request.apiKey.id}` : `user:${user.id}`;
}

async function prepareRestoreCommitIdempotentRequest(database, request, reply, { workspaceId, actorId }) {
  const method = String(request.method || "").toUpperCase();
  const routePath = request.url.split("?")[0];
  if (!isRestoreCommitRequest(method, routePath, request.body)) return false;
  const key = idempotencyKeyFromRequest(request);
  if (!key) return false;
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(key)) {
    reply.code(400).send({ error: "Invalid Idempotency-Key" });
    return true;
  }
  if (await replayCommittedRestoreRequest(database, request, reply, { workspaceId, actorId })) return true;
  const bodyDigest = requestBodyDigest(request.body);
  request.idempotency = {
    key,
    method,
    path: routePath,
    workspaceId,
    actorId,
    bodyDigest,
    fingerprint: idempotencyFingerprint({ method, path: routePath, workspaceId, bodyDigest }),
    createdAt: new Date().toISOString()
  };
  return false;
}

function userFromRequest(database, request) {
  const queryToken = typeof request.query?.token === "string" ? request.query.token : "";
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "") || queryToken;
  const session = token ? pruneExpiredSessions(database.data).find((item) => sessionMatchesToken(item, token)) : null;
  const user = session ? database.data.users.find((item) => item.id === session.userId) : null;
  if (user) {
    user.workspaceId ||= session.workspaceId || DEFAULT_WORKSPACE_ID;
    session.workspaceId ||= user.workspaceId;
    touchSession(database.data, session, token);
    return { token, session, user };
  }
  const key = token?.startsWith("lp_live_")
    ? (database.data.apiKeys || []).find((item) => item.enabled && token.startsWith(item.prefix) && verifyPassword(token, item.secretHash))
    : null;
  if (!key) return { token, session: null, user: null, apiKey: null };
  const owner = database.data.users.find((item) => item.id === key.createdBy) || database.data.users[0];
  return {
    token,
    session: null,
    apiKey: key,
    user: {
      id: owner?.id || "api",
      name: key.name,
      email: owner?.email || "api-key@layerpilot.local",
      role: "Viewer",
      workspaceId: key.workspaceId || owner?.workspaceId || DEFAULT_WORKSPACE_ID,
      apiScopes: key.scopes
    }
  };
}

function publicState(data) {
  const { sessions, ...safeState } = data;
  return {
    ...safeState,
    dataMeta: sanitizeDataMeta(data.dataMeta),
    users: data.users.map(sanitizeUser),
    bridges: (data.bridges || []).map(sanitizeBridge),
    webhooks: (data.webhooks || []).map(sanitizeWebhook),
    webhookDeliveries: (data.webhookDeliveries || []).map(sanitizeWebhookDelivery),
    notificationChannels: (data.notificationChannels || []).map(sanitizeNotificationChannel),
    notificationDeliveries: (data.notificationDeliveries || []).map(sanitizeNotificationDelivery),
    commerceConnectors: (data.commerceConnectors || []).map(sanitizeCommerceConnector),
    apiKeys: (data.apiKeys || []).map(sanitizeApiKey),
    quoteRequests: (data.quoteRequests || []).map(sanitizeQuoteRequest),
    addons: (data.addons || []).map(sanitizeAddon)
  };
}

function extractBackupData(backup) {
  if (!backup || typeof backup !== "object") return null;
  const data = backup.data && typeof backup.data === "object" ? backup.data : backup;
  if (!data || typeof data !== "object") return null;
  return data;
}

function normalizeRestoredUsers(importedUsers, currentUsers, actor) {
  const currentByEmail = new Map((currentUsers || []).map((user) => [String(user.email || "").toLowerCase(), user]));
  const users = [];
  const warnings = [];
  for (const item of Array.isArray(importedUsers) ? importedUsers : []) {
    if (!item?.email) continue;
    const email = String(item.email).toLowerCase();
    const current = currentByEmail.get(email);
    const hasHash = typeof item.passwordHash === "string" && item.passwordHash.startsWith("scrypt$");
    const passwordHash = current?.passwordHash || (hasHash ? item.passwordHash : createPasswordHash(randomBytes(18).toString("base64url")));
    const restoredUser = {
      ...item,
      id: item.id || randomUUID(),
      email,
      role: roleSchema.safeParse(item.role).success ? item.role : "Viewer",
      passwordHash,
      restoredAt: new Date().toISOString()
    };
    if (!current && !hasHash) {
      restoredUser.passwordResetRequired = true;
      warnings.push(`User ${email} restored without password hash and requires a password reset`);
    }
    users.push(restoredUser);
  }
  const actorEmail = String(actor?.email || "").toLowerCase();
  if (actorEmail && !users.some((user) => String(user.email || "").toLowerCase() === actorEmail)) {
    const current = currentByEmail.get(actorEmail) || actor;
    users.unshift({
      id: current.id || randomUUID(),
      name: current.name || "Restore operator",
      email: actorEmail,
      role: "Owner",
      location: current.location || "HQ",
      lastSeen: "Now",
      passwordHash: current.passwordHash || createPasswordHash(randomBytes(18).toString("base64url")),
      restoredAt: new Date().toISOString()
    });
    warnings.push(`Current restore operator ${actorEmail} was preserved as Owner`);
  }
  return { users, warnings };
}

function normalizeRestoredSecrets(data) {
  const warnings = [];
  data.apiKeys = (data.apiKeys || []).map((key) => {
    const hasHash = typeof key.secretHash === "string" && key.secretHash.startsWith("scrypt$");
    if (!hasHash) warnings.push(`API key ${key.name || key.id || "restored key"} restored disabled because its secret hash was not in the backup`);
    return {
      ...key,
      id: key.id || randomUUID(),
      enabled: hasHash ? key.enabled === true : false,
      secretHash: hasHash ? key.secretHash : createPasswordHash(randomBytes(24).toString("base64url")),
      restoredAt: new Date().toISOString()
    };
  });
  data.bridges = (data.bridges || []).map((bridge) => ({ ...bridge, apiKey: typeof bridge.apiKey === "string" ? bridge.apiKey : "" }));
  data.notificationChannels = (data.notificationChannels || []).map((channel) => ({ ...channel, token: typeof channel.token === "string" ? channel.token : "" }));
  data.commerceConnectors = (data.commerceConnectors || []).map((connector) => ({ ...connector, token: typeof connector.token === "string" ? connector.token : "" }));
  return warnings;
}

function normalizeRestoredStoragePaths(data, preserveStoragePaths) {
  let stripped = 0;
  data.files = (data.files || []).map((file) => {
    if (!file.storagePath) return file;
    if (preserveStoragePaths && isPathInside(storageRoot(), file.storagePath)) return file;
    stripped += 1;
    const { storagePath, ...safeFile } = file;
    return {
      ...safeFile,
      status: file.status === "deleted" ? "deleted" : "needs file re-upload",
      restoreNote: "File bytes were not included in the JSON backup; upload or restore object storage separately"
    };
  });
  return stripped;
}

function parseBackupByteLimit(value, fallback = DEFAULT_FULL_BACKUP_MAX_BYTES) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = parseHumanFileSize(value);
  return parsed > 0 ? parsed : fallback;
}

function fullBackupMaxBytes(query = {}) {
  const envLimit = parseBackupByteLimit(process.env.LAYERPILOT_FULL_BACKUP_MAX_BYTES);
  const queryLimit = parseBackupByteLimit(query.maxBytes, envLimit);
  return Math.min(envLimit, queryLimit);
}

async function buildBackupStorageManifest(data, maxBytes = DEFAULT_FULL_BACKUP_MAX_BYTES) {
  const files = [];
  const missing = [];
  let bytes = 0;
  for (const file of data.files || []) {
    if (!file.storagePath) continue;
    try {
      const size = await statStoredObject(file);
      bytes += size;
      files.push({
        fileId: file.id,
        name: file.name || path.basename(file.storagePath || file.storageKey || file.id),
        type: file.type || "",
        size,
        originalPath: file.storageKey || (file.storageProvider === "s3" ? String(file.storagePath || "") : path.relative(storageRoot(), file.storagePath).replace(/\\/g, "/"))
      });
    } catch (error) {
      missing.push({ fileId: file.id, name: file.name, reason: error instanceof Error ? error.message : "stat failed" });
    }
  }
  return {
    included: false,
    count: files.length,
    bytes,
    limitBytes: maxBytes,
    oversized: bytes > maxBytes,
    files,
    missing
  };
}

async function buildBackupFilePayloads(data, manifest) {
  const payloads = [];
  const missing = [...(manifest?.missing || [])];
  let bytes = 0;
  for (const fileInfo of manifest?.files || []) {
    const file = (data.files || []).find((item) => item.id === fileInfo.fileId);
    if (!file) continue;
    try {
      const buffer = await readStoredObject(file);
      bytes += buffer.length;
      payloads.push({
        fileId: file.id,
        name: fileInfo.name,
        type: fileInfo.type,
        size: buffer.length,
        originalPath: fileInfo.originalPath,
        bytesBase64: buffer.toString("base64")
      });
    } catch (error) {
      missing.push({ fileId: file.id, name: file.name, reason: error instanceof Error ? error.message : "read failed" });
    }
  }
  return {
    filePayloads: payloads,
    storage: {
      included: true,
      count: payloads.length,
      bytes,
      limitBytes: manifest?.limitBytes || DEFAULT_FULL_BACKUP_MAX_BYTES,
      missing
    }
  };
}

async function restoreBackupFilePayloads(data, backup, options = {}) {
  const payloads = Array.isArray(backup?.filePayloads) ? backup.filePayloads : [];
  const warnings = [];
  let restored = 0;
  if (!options.enabled || !payloads.length) return { restored, warnings };
  const filesById = new Map((data.files || []).map((file) => [file.id, file]));
  for (const payload of payloads) {
    const file = filesById.get(payload.fileId);
    if (!file) {
      warnings.push(`File payload ${payload.fileId || "unknown"} skipped because the file record was not in the backup`);
      continue;
    }
    if (typeof payload.bytesBase64 !== "string" || !payload.bytesBase64) {
      warnings.push(`File payload ${file.name || file.id} skipped because it had no bytes`);
      continue;
    }
    const buffer = Buffer.from(payload.bytesBase64, "base64");
    if (payload.size && Number(payload.size) !== buffer.length) {
      warnings.push(`File payload ${file.name || file.id} size mismatch; restored ${buffer.length} bytes`);
    }
    const filename = path.basename(String(payload.name || file.name || `${file.id}.bin`)).replace(/"/g, "") || `${file.id}.bin`;
    const stored = await storeObject(`restored/${file.id}/${filename}`, buffer, { filename, type: file.type });
    file.storagePath = stored.storagePath;
    file.storageProvider = stored.storageProvider;
    file.storageKey = stored.storageKey;
    file.size = formatBytes(buffer.length);
    if (file.status === "needs file re-upload") file.status = file.sliced || file.type === "GCODE" ? "sliced" : "uploaded";
    delete file.restoreNote;
    file.restoredStorageAt = new Date().toISOString();
    restored += 1;
  }
  return { restored, warnings };
}

function summarizeBackupFilePayloadCoverage(backup, incomingData) {
  const files = Array.isArray(incomingData?.files) ? incomingData.files : [];
  const payloads = Array.isArray(backup?.filePayloads) ? backup.filePayloads : [];
  const storedFiles = files.filter((file) => file?.storagePath || file?.storageKey);
  const filesById = new Map(files.map((file) => [file.id, file]));
  const payloadIds = new Set(payloads.map((payload) => payload?.fileId).filter(Boolean));
  const missing = storedFiles
    .filter((file) => !payloadIds.has(file.id))
    .map((file) => ({ fileId: file.id, name: file.name || file.id }));
  const extra = payloads
    .filter((payload) => payload?.fileId && !filesById.has(payload.fileId))
    .map((payload) => ({ fileId: payload.fileId, name: payload.name || payload.fileId }));
  const included = storedFiles.length - missing.length;
  return {
    complete: missing.length === 0 && extra.length === 0,
    expected: storedFiles.length,
    included,
    missing,
    extra,
    storageIncluded: backup?.storage?.included === true || payloads.length > 0
  };
}

function summarizeRestoreData(data, warnings = [], storagePathsStripped = 0, filePayloadsRestored = 0, filePayloadCoverage = null) {
  const collectionCounts = {};
  for (const key of RESTORABLE_KEYS) {
    if (Array.isArray(data[key])) collectionCounts[key] = data[key].length;
  }
  return {
    service: "3DSTU FarmFlow",
    generatedAt: new Date().toISOString(),
    collectionCounts,
    users: (data.users || []).length,
    printers: (data.printers || []).length,
    queue: (data.queue || []).length,
    files: (data.files || []).length,
    storagePathsStripped,
    filePayloadsRestored,
    filePayloadCoverage,
    warnings
  };
}

async function prepareRestoreData(currentData, backup, options = {}, actor = null) {
  const incoming = extractBackupData(backup);
  if (!incoming) return { error: "Backup payload must include an object or { data } object" };
  const filePayloadCoverage = summarizeBackupFilePayloadCoverage(backup, incoming);
  const restored = structuredClone(seedData);
  for (const key of RESTORABLE_KEYS) {
    if (incoming[key] === undefined) continue;
    restored[key] = structuredClone(incoming[key]);
  }
  const userResult = normalizeRestoredUsers(restored.users, currentData.users || [], actor);
  restored.users = userResult.users;
  restored.sessions = [];
  const secretWarnings = normalizeRestoredSecrets(restored);
  const storagePathsStripped = normalizeRestoredStoragePaths(restored, options.preserveStoragePaths === true);
  restored.events = Array.isArray(restored.events) ? restored.events : [];
  restored.events.unshift({
    id: randomUUID(),
    type: "admin.restore_prepared",
    message: `${actor?.email || "system"} prepared workspace restore`,
    at: new Date().toISOString()
  });
  const restoredPayloads = await restoreBackupFilePayloads(restored, backup, { enabled: options.restoreFilePayloads === true });
  const coverageWarnings = [];
  if (filePayloadCoverage.missing.length) coverageWarnings.push(`Backup is missing file payloads for ${filePayloadCoverage.missing.length} stored file${filePayloadCoverage.missing.length === 1 ? "" : "s"}; restore will mark them for re-upload unless storage is restored separately`);
  if (filePayloadCoverage.extra.length) coverageWarnings.push(`Backup includes ${filePayloadCoverage.extra.length} file payload${filePayloadCoverage.extra.length === 1 ? "" : "s"} without matching file records; those payloads will be skipped`);
  const warnings = [...userResult.warnings, ...secretWarnings, ...coverageWarnings, ...restoredPayloads.warnings];
  return { data: restored, summary: summarizeRestoreData(restored, warnings, storagePathsStripped, restoredPayloads.restored, filePayloadCoverage) };
}

function sendSse(raw, event, data) {
  raw.write(`event: ${event}\n`);
  raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

function closeRealtimeClient(database, client) {
  if (!client) return;
  if (client.keepalive) clearInterval(client.keepalive);
  try {
    if (client.raw) client.raw.end();
    else if (client.socket) client.socket.close();
  } catch {
    // The connection may already be gone.
  }
  database.realtimeClients?.delete(client);
}

function realtimeState(data) {
  return { ...publicState(data), todos: deriveTodos(data) };
}

function realtimeStateForUser(data, user) {
  return realtimeState(scopedWorkspaceData(data, user?.workspaceId || DEFAULT_WORKSPACE_ID));
}

function broadcastRealtime(database, event, data) {
  for (const client of database.realtimeClients || []) {
    try {
      const clientUser = database.data.users.find((user) => user.id === client.userId && itemInWorkspace(user, client.workspaceId));
      if (!clientUser || requiresProductionAdminTwoFactor(database.data, clientUser, "GET", "/api/events/stream")) {
        closeRealtimeClient(database, client);
        continue;
      }
      const payload = data?.state && client.workspaceId
        ? { ...data, state: realtimeState(scopedWorkspaceData(database.data, client.workspaceId)) }
        : data;
      client.send(event, payload);
    } catch {
      database.realtimeClients.delete(client);
    }
  }
}

function webhookMatches(webhook, eventType) {
  return webhook.enabled && webhook.url && webhook.events.some((pattern) => pattern === "*" || pattern === eventType || pattern.endsWith(".*") && eventType.startsWith(pattern.slice(0, -1)));
}

function notificationMatches(channel, eventType) {
  return channel.enabled && channel.url && channel.events.some((pattern) => pattern === "*" || pattern === eventType || pattern.endsWith(".*") && eventType.startsWith(pattern.slice(0, -1)));
}

function mqttEventMatches(patterns = [], eventType = "") {
  return patterns.some((pattern) => pattern === "*" || pattern === eventType || pattern.endsWith(".*") && eventType.startsWith(pattern.slice(0, -1)));
}

function mqttAddonConfig(data) {
  const addon = (data.addons || []).find((item) => item.id === "mqtt");
  const rawConfig = addon?.config && typeof addon.config === "object" ? addon.config : {};
  const brokerUrl = String(rawConfig.brokerUrl || process.env.LAYERPILOT_MQTT_URL || "").trim();
  const topicPrefix = String(rawConfig.topicPrefix || process.env.LAYERPILOT_MQTT_TOPIC_PREFIX || "layerpilot").trim().replace(/^\/+|\/+$/g, "") || "layerpilot";
  const patterns = Array.isArray(rawConfig.events) && rawConfig.events.length ? rawConfig.events.map(String) : ["*"];
  const qos = Math.min(Math.max(Number(rawConfig.qos ?? process.env.LAYERPILOT_MQTT_QOS ?? 0), 0), 2);
  return {
    enabled: Boolean(addon?.enabled && brokerUrl),
    brokerUrl,
    topicPrefix,
    username: String(rawConfig.username || process.env.LAYERPILOT_MQTT_USERNAME || ""),
    password: String(rawConfig.password || process.env.LAYERPILOT_MQTT_PASSWORD || ""),
    clientId: String(rawConfig.clientId || process.env.LAYERPILOT_MQTT_CLIENT_ID || `layerpilot-${randomBytes(4).toString("hex")}`),
    retain: rawConfig.retain === true || process.env.LAYERPILOT_MQTT_RETAIN === "true",
    qos: Number.isFinite(qos) ? qos : 0,
    events: patterns
  };
}

function mqttTopicForEvent(config, eventType) {
  return `${config.topicPrefix}/events/${String(eventType || "unknown").replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
}

function mqttPayload(event, deliveryId, sentAt, data) {
  return JSON.stringify({
    service: "3DSTU FarmFlow",
    workspace: data.workspaceSettings?.organizationName || "3DSTU FarmFlow",
    event,
    deliveryId,
    sentAt
  });
}

async function publishMqttMessage(config, topic, payload, publisher = null) {
  if (publisher) return publisher({ config, topic, payload });
  const client = mqtt.connect(config.brokerUrl, {
    username: config.username || undefined,
    password: config.password || undefined,
    clientId: config.clientId,
    connectTimeout: 5000,
    reconnectPeriod: 0
  });
  try {
    await new Promise((resolve, reject) => {
      client.once("connect", resolve);
      client.once("error", reject);
    });
    await new Promise((resolve, reject) => {
      client.publish(topic, payload, { qos: config.qos, retain: config.retain }, (error) => error ? reject(error) : resolve());
    });
  } finally {
    client.end(true);
  }
}

async function deliverMqtt(database, event, publisher = null) {
  const config = mqttAddonConfig(database.data);
  if (!config.enabled || !mqttEventMatches(config.events, event.type)) return null;
  const sentAt = new Date().toISOString();
  const delivery = {
    id: randomUUID(),
    eventId: event.id,
    eventType: event.type,
    brokerUrl: config.brokerUrl,
    topic: mqttTopicForEvent(config, event.type),
    qos: config.qos,
    retain: config.retain,
    status: "pending",
    at: sentAt
  };
  try {
    await publishMqttMessage(config, delivery.topic, mqttPayload(event, delivery.id, sentAt, database.data), publisher);
    delivery.status = "delivered";
  } catch (error) {
    delivery.status = "failed";
    delivery.error = error instanceof Error ? error.message : "MQTT publish failed";
  }
  database.data.mqttDeliveries ||= [];
  database.data.mqttDeliveries.unshift(delivery);
  return delivery;
}

function notificationPayload(channel, event, deliveryId, sentAt) {
  const title = `[3DSTU FarmFlow] ${event.type}`;
  const text = `${event.message || event.type}\n${sentAt}`;
  if (channel.type === "slack") return { text: `*${title}*\n${text}` };
  if (channel.type === "discord") return { content: `**${title}**\n${text}` };
  if (channel.type === "email") return { to: channel.recipients, subject: title, text, event, deliveryId, sentAt };
  return { event, deliveryId, sentAt, channel: { id: channel.id, name: channel.name, type: channel.type } };
}

async function deliverNotification(database, channel, event, fetchImpl = globalThis.fetch) {
  const sentAt = new Date().toISOString();
  const delivery = {
    id: randomUUID(),
    channelId: channel.id,
    channelName: channel.name,
    channelType: channel.type,
    eventId: event.id,
    eventType: event.type,
    url: channel.url,
    status: "pending",
    statusCode: 0,
    attempt: 1,
    at: sentAt
  };
  try {
    const response = await fetchImpl(channel.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-layerpilot-event": event.type,
        "x-layerpilot-notification": delivery.id,
        ...(channel.token ? { authorization: `Bearer ${channel.token}` } : {})
      },
      body: JSON.stringify(notificationPayload(channel, event, delivery.id, sentAt))
    });
    delivery.statusCode = response.status || 0;
    delivery.status = response.ok ? "delivered" : "failed";
    delivery.response = await response.text().catch(() => "");
  } catch (error) {
    delivery.status = "failed";
    delivery.error = error instanceof Error ? error.message : "Notification delivery failed";
  }
  channel.lastStatus = delivery.status;
  channel.lastStatusCode = delivery.statusCode;
  channel.lastSentAt = sentAt;
  database.data.notificationDeliveries ||= [];
  database.data.notificationDeliveries.unshift(delivery);
  return delivery;
}

async function deliverWebhook(database, webhook, event, fetchImpl = globalThis.fetch) {
  const sentAt = new Date().toISOString();
  const delivery = {
    id: randomUUID(),
    webhookId: webhook.id,
    webhookName: webhook.name,
    eventId: event.id,
    eventType: event.type,
    url: webhook.url,
    status: "pending",
    statusCode: 0,
    attempt: 1,
    at: sentAt
  };
  try {
    const response = await fetchImpl(webhook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-layerpilot-event": event.type,
        "x-layerpilot-delivery": delivery.id
      },
      body: JSON.stringify({ event, deliveryId: delivery.id, sentAt })
    });
    delivery.statusCode = response.status || 0;
    delivery.status = response.ok ? "delivered" : "failed";
    delivery.response = await response.text().catch(() => "");
  } catch (error) {
    delivery.status = "failed";
    delivery.error = error instanceof Error ? error.message : "Webhook delivery failed";
  }
  webhook.lastStatus = delivery.status;
  webhook.lastStatusCode = delivery.statusCode;
  webhook.lastSentAt = sentAt;
  database.data.webhookDeliveries ||= [];
  database.data.webhookDeliveries.unshift(delivery);
  return delivery;
}

async function dispatchEvent(database, type, message, data = {}, options = {}) {
  const actor = options.actor || null;
  const workspaceId = data.workspaceId || options.workspaceId || actor?.workspaceId || DEFAULT_WORKSPACE_ID;
  const actorData = actor ? { actorId: actor.id, actorEmail: actor.email, actorRole: actor.role, actorType: "user" } : {};
  const event = { id: randomUUID(), workspaceId, type, message, data: { ...data, ...actorData, workspaceId }, at: options.at || new Date().toISOString() };
  database.data.events.unshift(event);
  applyAuditRetention(database.data, { now: event.at });
  const matching = (database.data.webhooks || []).filter((webhook) => itemInWorkspace(webhook, workspaceId) && webhookMatches(webhook, type));
  const deliveries = [];
  for (const webhook of matching) {
    deliveries.push(sanitizeWebhookDelivery(await deliverWebhook(database, webhook, event, options.fetchImpl || globalThis.fetch)));
  }
  const matchingNotifications = (database.data.notificationChannels || []).filter((channel) => itemInWorkspace(channel, workspaceId) && notificationMatches(channel, type));
  const notificationDeliveries = [];
  for (const channel of matchingNotifications) {
    notificationDeliveries.push(sanitizeNotificationDelivery(await deliverNotification(database, channel, event, options.fetchImpl || globalThis.fetch)));
  }
  const mqttDelivery = await deliverMqtt(database, event, options.mqttPublisher || database.mqttPublisher || null);
  const mqttDeliveries = mqttDelivery ? [mqttDelivery] : [];
  broadcastRealtime(database, "event", { event, deliveries, notificationDeliveries, mqttDeliveries });
  return { event, deliveries, notificationDeliveries, mqttDeliveries };
}

async function dispatchAuthFailureEvent(database, type, request, options = {}) {
  const email = String(options.email || "").trim().toLowerCase();
  const user = options.user || null;
  const workspaceId = user?.workspaceId || options.workspaceId || DEFAULT_WORKSPACE_ID;
  const requestMeta = {
    ip: normalizeClientIp(request.ip),
    userAgent: String(request.headers?.["user-agent"] || "").slice(0, 200)
  };
  const data = {
    workspaceId,
    userId: user?.id || "",
    email,
    reason: options.reason || "authentication_failed",
    ...requestMeta
  };
  if (Number.isFinite(Number(options.failedAttempts))) data.failedAttempts = Number(options.failedAttempts);
  if (options.lockedUntil) data.lockedUntil = options.lockedUntil;
  if (options.lockedReason) data.lockedReason = options.lockedReason;
  await dispatchEvent(database, type, `${email || "Unknown user"} failed authentication`, data, { workspaceId });
}

function sanitizeBridge(bridge) {
  if (!bridge) return null;
  const { apiKey, ...safeBridge } = bridge;
  return {
    ...safeBridge,
    baseUrl: redactEndpointUrl(bridge.baseUrl),
    baseUrlHost: endpointHost(bridge.baseUrl),
    hasBaseUrl: Boolean(bridge.baseUrl),
    lastDiagnostics: bridge.lastDiagnostics ? sanitizeBridgeDiagnostic(bridge.lastDiagnostics) : bridge.lastDiagnostics,
    hasApiKey: Boolean(apiKey)
  };
}

function sanitizeBridgeDiagnostic(diagnostic) {
  if (!diagnostic) return null;
  return {
    ...diagnostic,
    baseUrl: redactEndpointUrl(diagnostic.baseUrl),
    baseUrlHost: endpointHost(diagnostic.baseUrl),
    hasBaseUrl: Boolean(diagnostic.baseUrl)
  };
}

function sanitizeWebhook(webhook) {
  if (!webhook) return null;
  return {
    ...webhook,
    url: redactEndpointUrl(webhook.url),
    urlHost: endpointHost(webhook.url),
    hasUrl: Boolean(webhook.url)
  };
}

function sanitizeWebhookDelivery(delivery) {
  if (!delivery) return null;
  return {
    ...delivery,
    url: redactEndpointUrl(delivery.url),
    urlHost: endpointHost(delivery.url),
    hasUrl: Boolean(delivery.url)
  };
}

function sanitizeNotificationChannel(channel) {
  if (!channel) return null;
  const { token, ...safeChannel } = channel;
  return {
    ...safeChannel,
    url: redactEndpointUrl(channel.url),
    urlHost: endpointHost(channel.url),
    hasUrl: Boolean(channel.url),
    hasToken: Boolean(token)
  };
}

function sanitizeNotificationDelivery(delivery) {
  if (!delivery) return null;
  return {
    ...delivery,
    url: redactEndpointUrl(delivery.url),
    urlHost: endpointHost(delivery.url),
    hasUrl: Boolean(delivery.url)
  };
}

function sanitizeCommerceConnector(connector) {
  if (!connector) return null;
  const { token, ...safeConnector } = connector;
  return {
    ...safeConnector,
    url: redactEndpointUrl(connector.url),
    urlHost: endpointHost(connector.url),
    hasUrl: Boolean(connector.url),
    hasToken: Boolean(token)
  };
}

function sanitizeApiKey(key) {
  if (!key) return null;
  const { secretHash, ...safeKey } = key;
  return {
    ...safeKey,
    hasSecret: Boolean(secretHash)
  };
}

function sanitizeQuoteRequest(quote) {
  if (!quote) return null;
  const { customerAccessToken, ...safeQuote } = quote;
  return {
    ...safeQuote,
    hasCustomerAccessToken: Boolean(customerAccessToken)
  };
}

function sanitizeAddon(addon) {
  if (!addon) return null;
  const safeConfig = { ...(addon.config || {}) };
  for (const key of ["password", "token", "secret", "apiKey"]) {
    if (safeConfig[key]) {
      safeConfig[`has${key[0].toUpperCase()}${key.slice(1)}`] = true;
      delete safeConfig[key];
    }
  }
  return { ...addon, config: safeConfig };
}

function parseAuditQuery(query = {}) {
  const rawLimit = Number(query.limit);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 1000) : 100;
  const rawOffset = Number(query.offset);
  const offset = Number.isFinite(rawOffset) ? Math.min(Math.max(Math.trunc(rawOffset), 0), 100000) : 0;
  const type = typeof query.type === "string" ? query.type.trim() : "";
  const search = typeof query.search === "string" ? query.search.trim().toLowerCase() : "";
  return { limit, offset, type, search };
}

function auditTypeMatches(eventType = "", filter = "") {
  if (!filter) return true;
  const event = String(eventType).toLowerCase();
  const normalized = filter.toLowerCase();
  if (normalized.endsWith(".*")) return event.startsWith(normalized.slice(0, -1));
  if (!normalized.includes(".")) return event === normalized || event.startsWith(`${normalized}.`);
  return event === normalized;
}

function normalizeAuditEvent(event) {
  return {
    id: event.id || randomUUID(),
    workspaceId: event.workspaceId || event.data?.workspaceId || DEFAULT_WORKSPACE_ID,
    type: String(event.type || "unknown"),
    message: String(event.message || ""),
    at: event.at || new Date(0).toISOString(),
    data: event.data && typeof event.data === "object" ? event.data : {}
  };
}

const auditRetentionProtectedTypes = new Set([
  "admin.restore",
  "admin.integrity_checked",
  "admin.audit_retention_run",
  "system.boot",
  "system.migrated",
  "system.pre_migration_backup"
]);

function auditRetentionDays(settings = {}) {
  const days = Number(settings.auditLogRetentionDays || 365);
  if (!Number.isFinite(days)) return 365;
  return Math.min(Math.max(Math.trunc(days), 7), 3650);
}

function applyAuditRetention(data, options = {}) {
  data.events ||= [];
  const workspaceId = options.workspaceId || data.workspaceSettings?.workspaceId || DEFAULT_WORKSPACE_ID;
  const workspace = workspaceForId(data, workspaceId);
  const settings = workspaceSettingsSchema.parse(options.settings || workspace?.settings || data.workspaceSettings || {});
  const enabled = settings.auditLogRetention !== false;
  const days = auditRetentionDays(settings);
  const nowMs = options.now ? new Date(options.now).getTime() : Date.now();
  const referenceMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const cutoffMs = referenceMs - days * 24 * 60 * 60 * 1000;
  const cutoff = new Date(cutoffMs).toISOString();
  const belongsToWorkspace = (event) => itemInWorkspace(normalizeAuditEvent(event), workspace.id);
  const before = data.events.filter(belongsToWorkspace).length;
  if (!enabled) return { enabled, days, cutoff, before, pruned: 0, kept: before };
  data.events = data.events.filter((event) => {
    if (!belongsToWorkspace(event)) return true;
    if (auditRetentionProtectedTypes.has(String(event.type || ""))) return true;
    const eventMs = new Date(event.at || 0).getTime();
    if (!Number.isFinite(eventMs)) return true;
    return eventMs >= cutoffMs;
  });
  const kept = data.events.filter(belongsToWorkspace).length;
  return { enabled, days, cutoff, before, pruned: before - kept, kept, workspaceId: workspace.id };
}

function buildAuditEvents(data, options = {}) {
  const { limit, offset, type, search } = { ...parseAuditQuery({}), ...options };
  return (data.events || [])
    .map(normalizeAuditEvent)
    .filter((event) => auditTypeMatches(event.type, type))
    .filter((event) => {
      if (!search) return true;
      return [event.type, event.message, JSON.stringify(event.data)].join(" ").toLowerCase().includes(search);
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(offset, offset + limit);
}

function buildAuditEventPage(data, options = {}) {
  const { limit, offset, type, search } = { ...parseAuditQuery({}), ...options };
  const matchedEvents = (data.events || [])
    .map(normalizeAuditEvent)
    .filter((event) => auditTypeMatches(event.type, type))
    .filter((event) => {
      if (!search) return true;
      return [event.type, event.message, JSON.stringify(event.data)].join(" ").toLowerCase().includes(search);
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const events = matchedEvents.slice(offset, offset + limit);
  return {
    total: (data.events || []).length,
    matched: matchedEvents.length,
    returned: events.length,
    limit,
    offset,
    hasMore: offset + events.length < matchedEvents.length,
    events
  };
}

function escapeCsvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function auditEventsToCsv(events) {
  const headers = ["id", "type", "message", "at", "data"];
  const rows = events.map((event) => [
    event.id,
    event.type,
    event.message,
    event.at,
    JSON.stringify(event.data || {})
  ]);
  return [headers.join(","), ...rows.map((row) => row.map(escapeCsvCell).join(","))].join("\n");
}

function rowsToCsv(rows) {
  const headers = Object.keys(rows[0] || {});
  return [headers.join(","), ...rows.map((row) => headers.map((header) => escapeCsvCell(row[header])).join(","))].join("\n");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSpoolLabelExport(spools, generatedAt = new Date().toISOString()) {
  const rows = spools.map((spool) => {
    const remaining = Number(spool.remaining ?? 0);
    const weight = Number(spool.weight ?? 0) || 1;
    const remainingPercent = Math.max(0, Math.min(100, Math.round((remaining / weight) * 100)));
    return {
      code: spool.nfc || spool.id,
      spoolId: spool.id,
      material: spool.material,
      brand: spool.brand,
      color: spool.color,
      location: spool.location,
      remainingGrams: remaining,
      totalGrams: weight,
      remainingPercent,
      dryStorage: spool.dry ? "yes" : "no",
      scanPath: `/api/spools/scan?code=${encodeURIComponent(spool.nfc || spool.id)}`
    };
  });
  const cards = rows.map((row) => `
    <section class="label">
      <div class="swatch" style="background:${escapeHtml(row.color)}"></div>
      <h2>${escapeHtml(row.material)} - ${escapeHtml(row.brand)}</h2>
      <p>${escapeHtml(row.location)} | ${escapeHtml(row.remainingGrams)}g / ${escapeHtml(row.totalGrams)}g</p>
      <strong>${escapeHtml(row.code)}</strong>
      <small>${escapeHtml(row.scanPath)}</small>
    </section>`).join("\n");
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>3DSTU FarmFlow spool labels</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
    .sheet { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
    .label { border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; min-height: 150px; break-inside: avoid; }
    .swatch { width: 34px; height: 34px; border-radius: 6px; border: 1px solid #94a3b8; float: right; }
    h1 { font-size: 18px; margin: 0 0 16px; }
    h2 { font-size: 17px; margin: 0 0 8px; }
    p, small { color: #475569; }
    strong { display: block; font-family: Consolas, monospace; font-size: 20px; margin-top: 12px; letter-spacing: 1px; }
    @media print { body { margin: 8mm; } .label { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>3DSTU FarmFlow spool labels - ${escapeHtml(generatedAt)}</h1>
  <main class="sheet">${cards || "<p>No labels selected.</p>"}</main>
</body>
</html>`;
  return { generatedAt, count: rows.length, rows, csv: rowsToCsv(rows), html };
}

function findSpoolByCode(spools, code) {
  const normalized = String(code || "").trim().toLowerCase();
  return (spools || []).find((spool) => [spool.nfc, spool.id, `${spool.material}-${spool.brand}`, `${spool.material} ${spool.brand}`]
    .filter(Boolean)
    .some((candidate) => String(candidate).trim().toLowerCase() === normalized));
}

function buildPurchaseRequestFromSpool(spool, options = {}, workspaceId = DEFAULT_WORKSPACE_ID) {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    workspaceId,
    spoolId: spool.id,
    material: spool.material || "PLA",
    color: spool.color || "Any",
    brand: spool.brand || "Generic",
    quantity: options.quantity || 1,
    targetGrams: options.targetGrams || Number(spool.weight || 1000),
    supplier: options.supplier || "Preferred supplier",
    priority: Number(spoolAvailableGrams(spool)) <= 0 ? "Urgent" : "High",
    status: "open",
    due: "This week",
    note: `Auto-generated because available inventory is ${Math.round(spoolAvailableGrams(spool))}g.`,
    createdAt: now,
    updatedAt: now
  };
}

function createReorderPlan(data, workspaceId, options = {}) {
  const normalized = purchaseReorderPlanSchema.parse(options || {});
  const workspaceData = scopedWorkspaceData(data, workspaceId);
  const existingOpen = new Set((workspaceData.purchaseRequests || [])
    .filter((request) => ["open", "ordered"].includes(request.status) && request.spoolId)
    .map((request) => request.spoolId));
  const created = [];
  const skipped = [];
  for (const spool of workspaceData.spools || []) {
    const available = spoolAvailableGrams(spool);
    if (available >= normalized.thresholdGrams) continue;
    if (existingOpen.has(spool.id)) {
      skipped.push({ spoolId: spool.id, material: spool.material, reason: "open request exists" });
      continue;
    }
    const request = buildPurchaseRequestFromSpool(spool, normalized, workspaceId);
    data.purchaseRequests.unshift(request);
    existingOpen.add(spool.id);
    created.push(request);
  }
  return { created, skipped, thresholdGrams: normalized.thresholdGrams, purchaseRequests: scopedWorkspaceData(data, workspaceId).purchaseRequests };
}

function receivePurchaseRequest(data, requestId, workspaceId, options = {}) {
  const normalized = purchaseReceiveSchema.parse(options || {});
  const request = (data.purchaseRequests || []).find((item) => item.id === requestId && itemInWorkspace(item, workspaceId));
  if (!request) return { error: "Purchase request not found", statusCode: 404 };
  if (request.status === "cancelled") return { error: "Cancelled purchase request cannot be received", statusCode: 409 };
  const now = new Date().toISOString();
  const prefix = String(normalized.nfcPrefix || `LP-${request.material}`).toUpperCase().replace(/[^A-Z0-9-]+/g, "-").replace(/-+$/g, "");
  const spools = Array.from({ length: Number(request.quantity || 1) }, (_, index) => ({
    id: randomUUID(),
    workspaceId,
    material: request.material,
    color: request.color || "Any",
    brand: request.brand || "Generic",
    remaining: Number(request.targetGrams || 1000),
    weight: Number(request.targetGrams || 1000),
    location: normalized.location,
    dry: normalized.dry,
    nfc: `${prefix}-${String(Date.now()).slice(-5)}-${index + 1}`,
    purchaseRequestId: request.id,
    createdAt: now,
    updatedAt: now
  }));
  data.spools.push(...spools);
  Object.assign(request, { status: "received", receivedAt: now, receivedSpoolIds: spools.map((spool) => spool.id), updatedAt: now });
  return { request, spools, purchaseRequests: scopedWorkspaceData(data, workspaceId).purchaseRequests, inventory: scopedWorkspaceData(data, workspaceId).spools };
}

function buildCatalogExport(data) {
  const parts = data.parts || [];
  const files = data.files || [];
  const rows = (data.skus || []).map((sku) => {
    const linkedParts = (sku.parts || [])
      .map((partName) => parts.find((part) => part.name.toLowerCase() === String(partName).toLowerCase()))
      .filter(Boolean);
    const linkedFiles = linkedParts
      .map((part) => files.find((file) => file.id === part.fileId))
      .filter(Boolean);
    return {
      sku: sku.sku,
      title: sku.title,
      channel: sku.channel,
      price: sku.price,
      stock: sku.stock,
      variants: (sku.variants || []).join("|"),
      parts: (sku.parts || []).join("|"),
      partIds: linkedParts.map((part) => part.id).join("|"),
      fileIds: linkedParts.map((part) => part.fileId).join("|"),
      fileNames: linkedFiles.map((file) => file.name).join("|"),
      materials: [...new Set(linkedParts.map((part) => part.material))].join("|"),
      processes: [...new Set(linkedParts.map((part) => part.process))].join("|"),
      plates: linkedParts.reduce((sum, part) => sum + Number(part.plates || 0), 0),
      partStatuses: [...new Set(linkedParts.map((part) => part.status))].join("|"),
      fileStatuses: [...new Set(linkedFiles.map((file) => file.status || ""))].filter(Boolean).join("|"),
      estimatedMinutes: linkedFiles.reduce((sum, file) => sum + Number(file.estimateMinutes || parseDurationMinutes(file.printTime)), 0),
      estimatedGrams: linkedFiles.reduce((sum, file) => sum + Number(file.estimateGrams || file.usage || 0), 0)
    };
  });
  return {
    exportedAt: new Date().toISOString(),
    rows,
    csv: rowsToCsv(rows)
  };
}

function materialCatalog(data) {
  const names = new Set(["PLA", "PETG", "ASA", "ABS", "TPU", "PA", "Nylon", "PC", "Resin"]);
  for (const material of Object.keys(data.costCatalog?.materialRates || {})) names.add(material);
  for (const spool of data.spools || []) if (spool.material) names.add(spool.material);
  for (const printer of data.printers || []) for (const material of printer.compatibleMaterials || []) names.add(material);
  for (const profile of data.profiles || []) {
    if (profile.kind === "Filament") names.add(profile.name);
    const settingMaterial = profile.settings?.filament_type || profile.settings?.material || profile.settings?.filament_settings_id;
    if (settingMaterial) names.add(String(settingMaterial));
  }
  return [...names].map((name) => String(name).trim()).filter(Boolean);
}

function canonicalizeMaterial(label, catalog) {
  const original = String(label || "").trim();
  if (!original) return { original, canonical: "", confidence: 0, status: "unmapped" };
  const normalized = original.toLowerCase();
  const exact = catalog.find((item) => item.toLowerCase() === normalized);
  if (exact) return { original, canonical: exact, confidence: 1, status: "exact" };
  const sorted = [...catalog].sort((a, b) => b.length - a.length);
  const contains = sorted.find((item) => {
    const key = item.toLowerCase();
    return new RegExp(`(^|[^a-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i").test(normalized);
  });
  if (contains) return { original, canonical: contains, confidence: 0.82, status: "alias" };
  if (normalized.includes("nylon")) return { original, canonical: "Nylon", confidence: 0.72, status: "alias" };
  if (normalized.includes("photopolymer") || normalized.includes("sla") || normalized.includes("msla")) return { original, canonical: "Resin", confidence: 0.7, status: "alias" };
  return { original, canonical: original, confidence: 0.25, status: "unmapped" };
}

function buildMaterialMapping(data, options = {}) {
  const catalog = materialCatalog(data);
  const targets = [
    ...(data.parts || []).map((item) => ({ collection: "parts", id: item.id, name: item.name, material: item.material })),
    ...(data.files || []).map((item) => ({ collection: "files", id: item.id, name: item.name, material: item.material })),
    ...(data.queue || []).map((item) => ({ collection: "queue", id: item.id, name: item.file, material: item.material }))
  ];
  const aliasMap = new Map();
  const items = targets.map((target) => {
    const result = canonicalizeMaterial(target.material, catalog);
    const changed = Boolean(result.canonical && result.canonical !== target.material && result.status !== "unmapped");
    const item = { ...target, canonical: result.canonical, confidence: result.confidence, status: result.status, changed };
    if (result.original) {
      const key = result.original.toLowerCase();
      const existing = aliasMap.get(key);
      if (!existing || result.confidence > existing.confidence) {
        aliasMap.set(key, {
          alias: result.original,
          canonical: result.canonical,
          confidence: result.confidence,
          status: result.status,
          occurrences: 1
        });
      } else {
        existing.occurrences += 1;
      }
    }
    return item;
  });
  if (options.apply !== false) {
    for (const item of items) {
      if (!item.changed) continue;
      const target = data[item.collection]?.find((entry) => entry.id === item.id);
      if (target) target.material = item.canonical;
    }
  }
  const mappings = [...aliasMap.values()].sort((a, b) => a.alias.localeCompare(b.alias));
  return {
    generatedAt: new Date().toISOString(),
    applied: options.apply !== false,
    catalog,
    mappings,
    items,
    changed: items.filter((item) => item.changed).length,
    unmapped: items.filter((item) => item.status === "unmapped").length
  };
}

function applyBridgeStatus(printer, bridgeStatus) {
  printer.status = bridgeStatus.status || printer.status;
  printer.progress = bridgeStatus.progress ?? printer.progress;
  printer.nozzle = bridgeStatus.nozzle ?? printer.nozzle;
  printer.bed = bridgeStatus.bed ?? printer.bed;
  printer.targetNozzle = bridgeStatus.targetNozzle ?? printer.targetNozzle;
  printer.targetBed = bridgeStatus.targetBed ?? printer.targetBed;
  printer.job = bridgeStatus.job || printer.job;
}

function activeJobForPrinter(data, printerId) {
  return (data.queue || []).find((job) => job.printerId === printerId && (job.status === "printing" || job.status === "paused" || job.stage === "printing"));
}

function nextRunnableJobForPrinter(data, printerId, requestedJobId = "") {
  if (requestedJobId) return (data.queue || []).find((job) => job.id === requestedJobId && job.printerId === printerId);
  return activeJobForPrinter(data, printerId) || (data.queue || [])
    .filter((job) => job.printerId === printerId && job.status === "queued" && ["scheduled", "needs scheduling"].includes(job.stage))
    .sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority) || parseDueRank(a) - parseDueRank(b))[0];
}

function targetTempsForPrinter(printer, payload = {}) {
  if (payload.targetNozzle !== undefined || payload.targetBed !== undefined) {
    return {
      targetNozzle: payload.targetNozzle ?? printer.targetNozzle ?? 0,
      targetBed: payload.targetBed ?? printer.targetBed ?? 0
    };
  }
  const filament = `${printer.filament || ""} ${(printer.compatibleMaterials || []).join(" ")}`.toLowerCase();
  if (filament.includes("resin")) return { targetNozzle: 0, targetBed: 0 };
  if (filament.includes("asa")) return { targetNozzle: 255, targetBed: 100 };
  if (filament.includes("petg")) return { targetNozzle: 240, targetBed: 75 };
  if (filament.includes("tpu")) return { targetNozzle: 225, targetBed: 45 };
  return { targetNozzle: 210, targetBed: 60 };
}

export function applyPrinterAction(data, payload) {
  const parsed = printerActionSchema.parse(payload);
  const printer = data.printers.find((item) => item.id === parsed.printerId);
  if (!printer) return { error: "Printer not found", statusCode: 404 };
  const previous = { status: printer.status, job: printer.job || "", progress: printer.progress || 0, targetNozzle: printer.targetNozzle || 0, targetBed: printer.targetBed || 0 };
  let job = activeJobForPrinter(data, printer.id);
  let message = `${printer.name} ${parsed.action}`;
  if (parsed.action === "start" || parsed.action === "resume") {
    job = nextRunnableJobForPrinter(data, printer.id, parsed.jobId);
    if (job) {
      job.status = "printing";
      job.stage = "printing";
      job.startedAt ||= new Date().toISOString();
      job.updatedAt = new Date().toISOString();
      printer.job = job.file;
      message = `${printer.name} started ${job.file}`;
    } else {
      printer.job ||= "Manual control";
      message = `${printer.name} started without linked queue job`;
    }
    printer.status = "printing";
    printer.progress = Math.max(1, Number(printer.progress || 0));
  } else if (parsed.action === "pause") {
    printer.status = "paused";
    if (job) {
      job.status = "paused";
      job.stage = "printing";
      job.updatedAt = new Date().toISOString();
      message = `${printer.name} paused ${job.file}`;
    }
  } else if (parsed.action === "cancel") {
    if (job) {
      job.status = "cancelled";
      job.stage = "blocked";
      job.completedAt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();
      message = `${printer.name} cancelled ${job.file}`;
    }
    printer.status = "idle";
    printer.progress = 0;
    printer.job = "";
  } else if (parsed.action === "preheat") {
    const temps = targetTempsForPrinter(printer, parsed);
    printer.targetNozzle = temps.targetNozzle;
    printer.targetBed = temps.targetBed;
    if (printer.status === "offline" || printer.status === "maintenance") printer.status = "idle";
    message = `${printer.name} preheat ${printer.targetNozzle}/${printer.targetBed}C`;
  } else if (parsed.action === "cooldown") {
    printer.targetNozzle = 0;
    printer.targetBed = 0;
    if (printer.status !== "printing" && printer.status !== "paused") printer.status = "idle";
    message = `${printer.name} cooldown`;
  } else if (parsed.action === "home axes") {
    message = `${printer.name} homing axes`;
  }
  printer.updatedAt = new Date().toISOString();
  return { printer, job, action: parsed.action, previous, message };
}

export async function runBridgePollingTick(database, options = {}) {
  const scopeWorkspaceId = options.workspaceId || "";
  const enabledBridges = (database.data.bridges || []).filter((bridge) => bridge.enabled && bridge.kind !== "manual" && (!scopeWorkspaceId || itemInWorkspace(bridge, scopeWorkspaceId)));
  const synced = [];
  const failed = [];
  for (const bridge of enabledBridges) {
    const workspaceId = bridge.workspaceId || DEFAULT_WORKSPACE_ID;
    const printer = database.data.printers.find((item) => item.id === bridge.printerId && itemInWorkspace(item, workspaceId));
    if (!printer) {
      failed.push({ bridgeId: bridge.id, bridge: bridge.name, error: "Printer not found" });
      continue;
    }
    const previousStatus = printer.status;
    try {
      const status = await fetchBridgeStatus(bridge, { fetchImpl: options.fetchImpl || globalThis.fetch });
      applyBridgeStatus(printer, status);
      bridge.lastStatus = "connected";
      bridge.lastError = "";
      bridge.lastSyncAt = new Date().toISOString();
      synced.push({ bridgeId: bridge.id, bridge: bridge.name, printerId: printer.id, printer: printer.name, status: printer.status, previousStatus });
      if (previousStatus !== printer.status) {
        await dispatchEvent(database, "printer.status", `${printer.name} -> ${printer.status}`, { workspaceId, printerId: printer.id, status: printer.status, source: "bridge.poll" });
      }
    } catch (error) {
      bridge.lastStatus = "error";
      bridge.lastError = error instanceof Error ? error.message : "Bridge sync failed";
      bridge.lastSyncAt = new Date().toISOString();
      printer.status = "offline";
      failed.push({ bridgeId: bridge.id, bridge: bridge.name, printerId: printer.id, printer: printer.name, error: bridge.lastError });
      if (previousStatus !== "offline") {
        await dispatchEvent(database, "printer.status", `${printer.name} -> offline`, { workspaceId, printerId: printer.id, status: "offline", source: "bridge.poll", error: bridge.lastError });
      }
    }
  }
  const stateData = scopeWorkspaceId ? scopedWorkspaceData(database.data, scopeWorkspaceId) : database.data;
  if (!synced.length && !failed.length) return { changed: false, synced, failed, state: realtimeState(stateData) };
  await dispatchEvent(database, "bridge.poll", `${synced.length} bridges synced, ${failed.length} failed`, { workspaceId: scopeWorkspaceId || DEFAULT_WORKSPACE_ID, synced, failed });
  await database.write();
  const payload = { reason: "bridge.poll", state: realtimeState(stateData), synced, failed };
  broadcastRealtime(database, "state", payload);
  return { changed: true, synced, failed, state: payload.state };
}

function exceedsVolume(dimensions = [0, 0, 0], buildVolume = [0, 0, 0]) {
  return dimensions.some((value, index) => Number(value) > Number(buildVolume[index] || 0));
}

function hasMaterialConflict(job, printer) {
  return job.material !== "Auto matched" && !printer.compatibleMaterials?.includes(job.material);
}

function isDueRisk(job) {
  if (job.status === "complete" || job.status === "cancelled") return false;
  if (job.priority === "Rush") return true;
  const due = String(job.due || "");
  const hour = Number(due.match(/\b(\d{1,2}):\d{2}\b/)?.[1]);
  return due.includes("Today") && (job.priority === "High" || Number.isFinite(hour) && hour <= 18);
}

function parseDurationMinutes(value = "") {
  const text = String(value);
  const hours = Number(text.match(/(\d+(?:\.\d+)?)\s*h/i)?.[1] || 0);
  const minutes = Number(text.match(/(\d+)\s*m/i)?.[1] || 0);
  const total = Math.round(hours * 60 + minutes);
  return total > 0 ? total : 60;
}

function parseDueRank(job) {
  const due = String(job.due || "");
  const day = due.includes("Today") ? 0 : due.includes("Tomorrow") ? 1 : 3;
  const hour = Number(due.match(/\b(\d{1,2}):\d{2}\b/)?.[1]);
  const minute = Number(due.match(/\b\d{1,2}:(\d{2})\b/)?.[1]);
  return day * 1440 + (Number.isFinite(hour) ? hour * 60 : 17 * 60) + (Number.isFinite(minute) ? minute : 0);
}

function formatScheduleMinute(totalMinutes) {
  const dayOffset = Math.floor(totalMinutes / 1440);
  const minuteOfDay = ((totalMinutes % 1440) + 1440) % 1440;
  const hour = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const minute = String(minuteOfDay % 60).padStart(2, "0");
  return dayOffset > 0 ? `+${dayOffset}d ${hour}:${minute}` : `${hour}:${minute}`;
}

function formatDurationMinutes(minutes) {
  const normalized = Math.max(1, Math.round(Number(minutes) || 60));
  const hours = Math.floor(normalized / 60);
  const remainder = String(normalized % 60).padStart(2, "0");
  return `${hours}h ${remainder}m`;
}

function storageRoot() {
  return defaultStorageRoot();
}

function objectStorage() {
  if (!activeObjectStorage) activeObjectStorage = createObjectStorage();
  return activeObjectStorage;
}

function isPathInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function parseHumanFileSize(value = "") {
  const match = String(value).trim().match(/^([\d.]+)\s*(B|KB|MB|GB|TB)?$/i);
  if (!match) return 0;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return 0;
  const unit = (match[2] || "B").toUpperCase();
  const multiplier = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 }[unit] || 1;
  return Math.round(amount * multiplier);
}

function slugifyName(value = "model") {
  return String(value || "model").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "model";
}

async function storeObject(relativePath, buffer, metadata = {}) {
  return objectStorage().put({ relativePath, buffer, filename: metadata.filename, type: metadata.type });
}

async function readStoredObject(file) {
  if (file.storageProvider === "s3" || file.storageKey || String(file.storagePath || "").startsWith("s3://")) {
    return objectStorage().get(file);
  }
  if (file.storagePath && isPathInside(storageRoot(), file.storagePath)) return readFile(file.storagePath);
  throw new Error("Stored file is missing or outside storage root");
}

async function statStoredObject(file) {
  if (file.storageProvider === "s3" || file.storageKey || String(file.storagePath || "").startsWith("s3://")) {
    return objectStorage().stat(file);
  }
  if (file.storagePath && isPathInside(storageRoot(), file.storagePath)) {
    const info = await stat(file.storagePath);
    return info.size;
  }
  return 0;
}

function parseAxisValue(line, axis) {
  const match = line.match(new RegExp(`\\b${axis}([-+\\d.]+)`, "i"));
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function buildGcodePreview(buffer) {
  const text = buffer.toString("utf8");
  const lines = text.split(/\r?\n/);
  const position = { x: 0, y: 0, z: 0, e: 0 };
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const layers = new Map();
  const sample = [];
  let motionCommands = 0;
  let extrusionMoves = 0;
  let travelMoves = 0;
  let totalExtrusion = 0;
  for (const rawLine of lines) {
    const line = rawLine.split(";")[0].trim();
    if (!/^(G0|G1)\b/i.test(line)) continue;
    const next = { ...position };
    const x = parseAxisValue(line, "X");
    const y = parseAxisValue(line, "Y");
    const z = parseAxisValue(line, "Z");
    const e = parseAxisValue(line, "E");
    if (x !== null) next.x = x;
    if (y !== null) next.y = y;
    if (z !== null) next.z = z;
    if (e !== null) next.e = e;
    if (x === null && y === null && z === null && e === null) continue;
    motionCommands += 1;
    const extrusion = Math.max(0, next.e - position.e);
    totalExtrusion += extrusion;
    if (extrusion > 0) extrusionMoves += 1;
    else travelMoves += 1;
    bounds.minX = Math.min(bounds.minX, next.x);
    bounds.maxX = Math.max(bounds.maxX, next.x);
    bounds.minY = Math.min(bounds.minY, next.y);
    bounds.maxY = Math.max(bounds.maxY, next.y);
    bounds.minZ = Math.min(bounds.minZ, next.z);
    bounds.maxZ = Math.max(bounds.maxZ, next.z);
    const layerKey = next.z.toFixed(2);
    const layer = layers.get(layerKey) || { z: Number(layerKey), moves: 0, extrusion: 0 };
    layer.moves += 1;
    layer.extrusion += extrusion;
    layers.set(layerKey, layer);
    if (sample.length < 420 && (extrusion > 0 || sample.length % 4 === 0)) {
      sample.push({ x: Math.round(next.x * 100) / 100, y: Math.round(next.y * 100) / 100, z: Math.round(next.z * 100) / 100, extrusion: Math.round(extrusion * 1000) / 1000 });
    }
    Object.assign(position, next);
  }
  const hasBounds = Number.isFinite(bounds.minX) && Number.isFinite(bounds.maxX);
  const extents = hasBounds
    ? {
        min: [bounds.minX, bounds.minY, bounds.minZ].map((value) => Math.round(value * 100) / 100),
        max: [bounds.maxX, bounds.maxY, bounds.maxZ].map((value) => Math.round(value * 100) / 100)
      }
    : { min: [0, 0, 0], max: [0, 0, 0] };
  return {
    kind: "toolpath",
    lineCount: lines.length,
    motionCommands,
    extrusionMoves,
    travelMoves,
    totalExtrusion: Math.round(totalExtrusion * 1000) / 1000,
    layers: [...layers.values()].sort((a, b) => a.z - b.z).map((layer) => ({ ...layer, extrusion: Math.round(layer.extrusion * 1000) / 1000 })).slice(0, 240),
    sample,
    extents
  };
}

async function buildFilePreview(file, buffer, data) {
  const metadata = buffer ? await parseModelMetadata({ buffer, filename: file.name, material: file.material }) : null;
  const dimensions = metadata?.dimensions || file.dimensions || [100, 100, 50];
  const [width, depth, height] = dimensions.map((value) => Number(value) || 0);
  const plate = { width: 256, depth: 256, height: 256 };
  const occupancyPercent = Math.min(999, Math.round((width * depth) / (plate.width * plate.depth) * 100));
  const warnings = [];
  if (!buffer) warnings.push("Stored bytes are unavailable; preview is based on recorded metadata only.");
  if (width > plate.width || depth > plate.depth || height > plate.height) warnings.push("Model exceeds the default 256 x 256 x 256 mm preview plate.");
  if (file.type !== "GCODE" && !file.sliced) warnings.push("Model is not sliced yet; run a slicer profile before production.");
  const visualization = file.type === "GCODE" && buffer
    ? buildGcodePreview(buffer)
    : {
        kind: "bounding-box",
        extents: { min: [0, 0, 0], max: dimensions },
        vertices: [
          [0, 0, 0],
          [width, 0, 0],
          [width, depth, 0],
          [0, depth, 0],
          [0, 0, height],
          [width, 0, height],
          [width, depth, height],
          [0, depth, height]
        ]
      };
  const compatiblePrinters = (data.printers || []).filter((printer) => {
    const volume = printer.buildVolume || [0, 0, 0];
    return volume[0] >= width && volume[1] >= depth && volume[2] >= height && (!file.material || (printer.compatibleMaterials || []).includes(file.material));
  }).map((printer) => ({ id: printer.id, name: printer.name, status: printer.status, buildVolume: printer.buildVolume }));
  if (!compatiblePrinters.length) warnings.push("No current printer matches both material and build-volume requirements.");
  return {
    fileId: file.id,
    generatedAt: new Date().toISOString(),
    name: file.name,
    type: file.type,
    material: file.material,
    summary: {
      dimensions,
      size: file.size,
      estimateGrams: metadata?.estimateGrams || file.estimateGrams || file.usage || 0,
      estimateMinutes: metadata?.estimateMinutes || file.estimateMinutes || 0,
      printTime: metadata?.printTime || file.printTime || "0h 00m",
      quote: file.quote || file.cost || 0,
      sliced: Boolean(file.sliced),
      status: file.status
    },
    buildPlate: {
      ...plate,
      occupancyPercent,
      fit: width <= plate.width && depth <= plate.depth && height <= plate.height ? "fits default plate" : "oversize on default plate"
    },
    visualization,
    compatiblePrinters,
    warnings
  };
}

function triangleNormal(a, b, c) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length, ny / length, nz / length];
}

function stlFacet(a, b, c) {
  const normal = triangleNormal(a, b, c);
  const vertex = (point) => `      vertex ${point[0].toFixed(4)} ${point[1].toFixed(4)} ${point[2].toFixed(4)}`;
  return [
    `  facet normal ${normal[0].toFixed(6)} ${normal[1].toFixed(6)} ${normal[2].toFixed(6)}`,
    "    outer loop",
    vertex(a),
    vertex(b),
    vertex(c),
    "    endloop",
    "  endfacet"
  ].join("\n");
}

function boxFacets(origin, size) {
  const [x, y, z] = origin;
  const [w, d, h] = size;
  const p = [
    [x, y, z],
    [x + w, y, z],
    [x + w, y + d, z],
    [x, y + d, z],
    [x, y, z + h],
    [x + w, y, z + h],
    [x + w, y + d, z + h],
    [x, y + d, z + h]
  ];
  const faces = [
    [0, 2, 1], [0, 3, 2],
    [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6],
    [3, 0, 4], [3, 4, 7]
  ];
  return faces.map(([a, b, c]) => stlFacet(p[a], p[b], p[c]));
}

function buildNameplateStl(payload) {
  const safeText = payload.text.replace(/[^\w .-]/g, "").trim() || "3DSTU FarmFlow";
  const facets = [];
  facets.push(...boxFacets([0, 0, 0], [payload.width, payload.height, payload.thickness]));
  if (payload.feature === "keyholes") {
    const railWidth = Math.max(8, payload.width * 0.12);
    const railHeight = Math.max(4, payload.height * 0.12);
    facets.push(...boxFacets([payload.width * 0.12, payload.height * 0.78, payload.thickness], [railWidth, railHeight, 1.2]));
    facets.push(...boxFacets([payload.width * 0.76, payload.height * 0.78, payload.thickness], [railWidth, railHeight, 1.2]));
  } else if (payload.feature === "magnet pockets") {
    const pocket = Math.max(6, Math.min(payload.width, payload.height) * 0.14);
    facets.push(...boxFacets([payload.width * 0.12, payload.height * 0.12, payload.thickness], [pocket, pocket, 0.8]));
    facets.push(...boxFacets([payload.width * 0.78, payload.height * 0.12, payload.thickness], [pocket, pocket, 0.8]));
  }
  const solidName = `layerpilot_nameplate_${slugifyName(safeText)}`;
  return [`solid ${solidName}`, ...facets, `endsolid ${solidName}`, ""].join("\n");
}

function buildSampleBracketStl(name = "3DSTU FarmFlow sample bracket") {
  const facets = [
    ...boxFacets([0, 0, 0], [120, 36, 8]),
    ...boxFacets([10, 8, 8], [100, 6, 12]),
    ...boxFacets([10, 22, 8], [100, 6, 12]),
    ...boxFacets([16, 6, 20], [12, 24, 8]),
    ...boxFacets([46, 6, 20], [12, 24, 8]),
    ...boxFacets([76, 6, 20], [12, 24, 8]),
    ...boxFacets([104, 6, 20], [8, 24, 8])
  ];
  const solidName = `layerpilot_sample_${slugifyName(name)}`;
  return [`solid ${solidName}`, ...facets, `endsolid ${solidName}`, ""].join("\n");
}

function ensureFileFolder(data, draft) {
  data.fileFolders ||= [];
  const fullName = draft.parent ? `${draft.parent.replace(/[\\\/]+$/g, "")} / ${draft.name}` : draft.name;
  const existing = data.fileFolders.find((folder) => folder.name.toLowerCase() === fullName.toLowerCase() && itemInWorkspace(folder, draft.workspaceId));
  if (existing) return { folder: existing, created: false };
  const folder = {
    id: randomUUID(),
    workspaceId: draft.workspaceId || DEFAULT_WORKSPACE_ID,
    name: fullName,
    parent: draft.parent || "",
    purpose: draft.purpose || "inbox",
    fileCount: (data.files || []).filter((file) => file.folder === fullName).length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  data.fileFolders.push(folder);
  return { folder, created: true };
}

async function createSampleFile(database, payload, options = {}) {
  const parsed = sampleFileSchema.parse(payload || {});
  const workspaceId = options.workspaceId || DEFAULT_WORKSPACE_ID;
  const folderResult = ensureFileFolder(database.data, { name: parsed.folder, purpose: "sample", workspaceId });
  const id = randomUUID();
  const safeName = slugifyName(parsed.name);
  const filename = `${safeName || "layerpilot-sample"}.stl`;
  const stl = buildSampleBracketStl(parsed.name);
  const buffer = Buffer.from(stl, "utf8");
  const stored = await storeObject(`uploads/${id}/${filename}`, buffer, { filename, type: "STL" });
  const dimensions = [120, 36, 28];
  const grams = 64;
  const minutes = 128;
  const quote = calculateQuote(database.data.costCatalog, { material: parsed.material, grams, minutes });
  const file = {
    id,
    workspaceId,
    name: filename,
    type: "STL",
    folder: folderResult.folder.name,
    size: formatBytes(buffer.length),
    material: parsed.material,
    tags: ["sample", "generated", "stored"],
    sliced: false,
    status: "uploaded",
    version: 1,
    dimensions,
    thumbnail: parsed.name,
    printTime: formatDurationMinutes(minutes),
    cost: quote.total,
    layerHeight: "0.20",
    usage: grams,
    estimateGrams: grams,
    estimateMinutes: minutes,
    quote: quote.total,
    quoteBreakdown: quote,
    storagePath: stored.storagePath,
    storageProvider: stored.storageProvider,
    storageKey: stored.storageKey,
    generatedBy: "sample-bracket-stl",
    createdAt: new Date().toISOString()
  };
  database.data.files.push(file);
  folderResult.folder.fileCount = (database.data.files || []).filter((item) => item.folder === folderResult.folder.name).length;
  folderResult.folder.updatedAt = new Date().toISOString();
  return { file, folder: folderResult.folder, folderCreated: folderResult.created, stlBytes: buffer.length };
}

async function createParametricNameplate(database, payload, options = {}) {
  const parsed = parametricNameplateSchema.parse(payload);
  const workspaceId = options.workspaceId || DEFAULT_WORKSPACE_ID;
  const stl = buildNameplateStl(parsed);
  const buffer = Buffer.from(stl, "utf8");
  const id = randomUUID();
  const filename = `${id}-${slugifyName(parsed.text)}.stl`;
  const stored = await storeObject(`uploads/${id}/${filename}`, buffer, { filename, type: "STL" });
  const volumeMm3 = parsed.width * parsed.height * parsed.thickness;
  const grams = Math.max(1, Math.round(volumeMm3 * 0.00124 * 100) / 100);
  const minutes = Math.max(12, Math.round(volumeMm3 / 720));
  const quote = calculateQuote(database.data.costCatalog, { material: parsed.material, grams, minutes });
  const file = {
    id,
    workspaceId,
    name: `Nameplate ${parsed.text}.stl`,
    type: "STL",
    folder: "Parametric / Nameplates",
    size: formatBytes(buffer.length),
    material: parsed.material,
    tags: ["parametric", "nameplate", parsed.feature],
    sliced: false,
    status: "uploaded",
    version: 1,
    dimensions: [parsed.width, parsed.height, parsed.thickness],
    thumbnail: parsed.text,
    printTime: formatDurationMinutes(minutes),
    cost: quote.total,
    layerHeight: "0.20",
    usage: grams,
    quote: quote.total,
    quoteBreakdown: quote,
    storagePath: stored.storagePath,
    storageProvider: stored.storageProvider,
    storageKey: stored.storageKey,
    parametric: {
      generator: "nameplate-box-stl",
      text: parsed.text,
      feature: parsed.feature
    },
    createdAt: new Date().toISOString()
  };
  database.data.files.push(file);
  let part = null;
  if (parsed.createPart) {
    part = {
      id: randomUUID(),
      workspaceId,
      name: `Parametric nameplate - ${parsed.text}`,
      fileId: file.id,
      material: parsed.material,
      process: "0.20mm Production",
      plates: 1,
      variants: ["Text", parsed.feature],
      status: "ready",
      updatedAt: new Date().toISOString()
    };
    database.data.parts.push(part);
  }
  return { file, part, stlBytes: buffer.length, estimates: { grams, minutes, quote } };
}

async function createStoredModelFile(database, payload, options = {}) {
  const workspaceId = options.workspaceId || DEFAULT_WORKSPACE_ID;
  const filename = path.basename(payload.filename || "model.stl");
  const buffer = payload.buffer;
  const material = payload.material || "PLA";
  const folder = payload.folder || "Uploads";
  const metadata = await parseModelMetadata({ buffer, filename, material });
  const id = payload.id || randomUUID();
  const folderResult = ensureFileFolder(database.data, { name: folder, purpose: payload.folderPurpose || "inbox", workspaceId });
  const stored = await storeObject(`uploads/${id}/${filename}`, buffer, { filename, type: metadata.type });
  const quote = calculateQuote(database.data.costCatalog, { material, grams: metadata.estimateGrams, minutes: metadata.estimateMinutes });
  const file = {
    id,
    workspaceId,
    name: filename,
    type: metadata.type,
    folder: folderResult.folder.name,
    size: formatBytes(buffer.length),
    material,
    tags: payload.tags || ["uploaded", "parsed"],
    sliced: metadata.sliced,
    status: metadata.status,
    version: 1,
    dimensions: metadata.dimensions,
    thumbnail: filename,
    printTime: metadata.printTime,
    cost: quote.total,
    layerHeight: "0.20",
    usage: metadata.estimateGrams,
    estimateGrams: metadata.estimateGrams,
    estimateMinutes: metadata.estimateMinutes,
    quote: quote.total,
    quoteBreakdown: quote,
    storagePath: stored.storagePath,
    storageProvider: stored.storageProvider,
    storageKey: stored.storageKey,
    source: payload.source || "Upload",
    quoteRequestId: payload.quoteRequestId || "",
    createdAt: new Date().toISOString()
  };
  database.data.files.push(file);
  folderResult.folder.fileCount = (database.data.files || []).filter((item) => item.folder === folderResult.folder.name).length;
  folderResult.folder.updatedAt = new Date().toISOString();
  return { file, folder: folderResult.folder, metadata };
}

async function storedFileBytes(file) {
  if (file.storagePath) {
    try {
      return await statStoredObject(file);
    } catch {
      // Missing stored bytes fall back to recorded metadata below.
    }
  }
  return parseHumanFileSize(file.size);
}

async function buildStorageUsage(data) {
  const bytes = (await Promise.all((data.files || []).map(storedFileBytes))).reduce((sum, size) => sum + size, 0);
  const limitGb = Number(data.workspaceSettings?.storageLimitGb || 10);
  const usedGb = Math.round(bytes / BYTES_PER_GB * 100) / 100;
  return {
    usedBytes: bytes,
    used: formatBytes(bytes),
    usedGb,
    limitGb,
    percent: limitGb > 0 ? Math.min(100, Math.round(bytes / (limitGb * BYTES_PER_GB) * 1000) / 10) : 0,
    files: (data.files || []).length,
    storedFiles: (data.files || []).filter((file) => file.storagePath).length
  };
}

const productionDefaultSecretValues = new Map([
  ["LAYERPILOT_ADMIN_PASSWORD", "change-this-password"],
  ["LAYERPILOT_WORKER_TOKEN", "change-this-worker-token"],
  ["LAYERPILOT_METRICS_TOKEN", "change-this-metrics-token"]
]);

function productionDependencyConfigIssues(env = process.env) {
  const issues = [];
  const dbAdapter = String(env.LAYERPILOT_DB_ADAPTER || "json").trim();
  if (!["json", "sqlite"].includes(dbAdapter)) issues.push("LAYERPILOT_DB_ADAPTER must be json or sqlite");

  const storageProvider = String(env.LAYERPILOT_OBJECT_STORAGE_PROVIDER || "local").trim().toLowerCase();
  if (!["local", "s3"].includes(storageProvider)) {
    issues.push("LAYERPILOT_OBJECT_STORAGE_PROVIDER must be local or s3");
  } else if (storageProvider === "s3") {
    for (const key of ["LAYERPILOT_S3_BUCKET", "LAYERPILOT_S3_REGION", "LAYERPILOT_S3_ACCESS_KEY_ID", "LAYERPILOT_S3_SECRET_ACCESS_KEY"]) {
      if (!String(env[key] || "").trim()) issues.push(`Missing ${key}`);
    }
  }

  if (String(env.LAYERPILOT_STRIPE_SECRET_KEY || "").trim() || String(env.LAYERPILOT_STRIPE_WEBHOOK_SECRET || "").trim()) {
    for (const key of ["LAYERPILOT_STRIPE_SECRET_KEY", "LAYERPILOT_STRIPE_WEBHOOK_SECRET", "LAYERPILOT_STRIPE_PRICE_STUDIO", "LAYERPILOT_STRIPE_PRICE_FARM", "LAYERPILOT_STRIPE_PRICE_ENTERPRISE"]) {
      if (!String(env[key] || "").trim()) issues.push(`Missing ${key}`);
    }
  }

  if (String(env.LAYERPILOT_MQTT_URL || "").trim()) {
    if (!/^mqtts?:\/\//.test(String(env.LAYERPILOT_MQTT_URL || ""))) issues.push("LAYERPILOT_MQTT_URL must start with mqtt:// or mqtts://");
    const qos = String(env.LAYERPILOT_MQTT_QOS || "0").trim();
    if (!["0", "1", "2"].includes(qos)) issues.push("LAYERPILOT_MQTT_QOS must be 0, 1, or 2");
    const retain = String(env.LAYERPILOT_MQTT_RETAIN || "false").trim();
    if (!["true", "false"].includes(retain)) issues.push("LAYERPILOT_MQTT_RETAIN must be true or false");
  }

  return issues;
}

function rawRequestBody(request) {
  const raw = request.rawBody;
  if (typeof raw === "string" || Buffer.isBuffer(raw)) return raw;
  return JSON.stringify(request.body || {});
}

function stripeWebhookPayloadFromRequest(request, secret) {
  const signature = request.headers["stripe-signature"];
  if (!signature) return { ok: true, payload: request.body || {}, verified: false };
  if (!secret) {
    return { ok: false, statusCode: 503, error: "Stripe webhook secret is required for signature verification" };
  }
  try {
    return {
      ok: true,
      payload: Stripe.webhooks.constructEvent(rawRequestBody(request), signature, secret),
      verified: true
    };
  } catch {
    return { ok: false, statusCode: 401, error: "Invalid Stripe webhook signature" };
  }
}

function productionReadinessConfigChecks(data, env = process.env) {
  if (env.NODE_ENV !== "production") return [];
  const checks = [];
  const required = ["LAYERPILOT_ADMIN_EMAIL", "LAYERPILOT_ADMIN_PASSWORD", "LAYERPILOT_WORKER_TOKEN", "LAYERPILOT_METRICS_TOKEN"];
  const missing = required.filter((key) => !String(env[key] || "").trim());
  checks.push({
    name: "production-env-required",
    ok: missing.length === 0,
    detail: missing.length ? `Missing ${missing.join(", ")}` : "required production env values present"
  });

  const weak = [];
  const adminPassword = String(env.LAYERPILOT_ADMIN_PASSWORD || "");
  const workerToken = String(env.LAYERPILOT_WORKER_TOKEN || "");
  const metricsToken = String(env.LAYERPILOT_METRICS_TOKEN || "");
  if (adminPassword && adminPassword.length < 14) weak.push("LAYERPILOT_ADMIN_PASSWORD length < 14");
  if (workerToken && workerToken.length < 32) weak.push("LAYERPILOT_WORKER_TOKEN length < 32");
  if (metricsToken && metricsToken.length < 32) weak.push("LAYERPILOT_METRICS_TOKEN length < 32");
  for (const [key, defaultValue] of productionDefaultSecretValues.entries()) {
    if (String(env[key] || "") === defaultValue) weak.push(`${key} uses documented default`);
  }
  checks.push({
    name: "production-secrets",
    ok: weak.length === 0,
    detail: weak.length ? weak.join("; ") : "production secrets pass minimum checks"
  });

  const disableDefaultUsers = envFlag("LAYERPILOT_DISABLE_DEFAULT_USERS", env);
  const disableDemoLogin = disableDefaultUsers || envFlag("LAYERPILOT_DISABLE_DEMO_LOGIN", env);
  const seededUsers = (data.users || [])
    .map((user) => String(user.email || "").toLowerCase())
    .filter((email) => defaultSeedUserEmails.has(email));
  const defaultUserIssues = [];
  if (!disableDefaultUsers) defaultUserIssues.push("LAYERPILOT_DISABLE_DEFAULT_USERS is not true");
  if (!disableDemoLogin) defaultUserIssues.push("LAYERPILOT_DISABLE_DEMO_LOGIN is not true");
  if (seededUsers.length) defaultUserIssues.push(`seeded users present: ${seededUsers.join(", ")}`);
  checks.push({
    name: "production-default-access",
    ok: defaultUserIssues.length === 0,
    detail: defaultUserIssues.length ? defaultUserIssues.join("; ") : "default and demo access disabled"
  });

  const signupEnabled = publicSignupEnabled(env);
  checks.push({
    name: "production-public-signup",
    ok: true,
    enabled: signupEnabled,
    detail: signupEnabled ? "public signup explicitly enabled" : "public signup disabled by default"
  });

  const settings = data.workspaceSettings || {};
  const allowlist = Array.isArray(settings.allowedApiIps) ? settings.allowedApiIps : [];
  const allowlistIssues = [];
  if (settings.restrictApiByIp === true && !allowlist.length) {
    allowlistIssues.push("restrictApiByIp is true but allowedApiIps is empty");
  }
  for (const rule of invalidIpAllowlistRules(allowlist)) {
    allowlistIssues.push(`invalid allowedApiIps rule: ${rule || "(blank)"}`);
  }
  checks.push({
    name: "production-api-ip-allowlist",
    ok: allowlistIssues.length === 0,
    detail: allowlistIssues.length ? allowlistIssues.join("; ") : "API key IP allowlist configuration is valid"
  });

  const dependencyIssues = productionDependencyConfigIssues(env);
  checks.push({
    name: "production-dependencies",
    ok: dependencyIssues.length === 0,
    detail: dependencyIssues.length ? dependencyIssues.join("; ") : "optional dependency configuration is consistent"
  });
  return checks;
}

function productionWorkerReadinessCheck(data, env = process.env, now = new Date()) {
  if (env.NODE_ENV !== "production") return null;
  const telemetryEnabled = envFlagWithDefault("LAYERPILOT_WORKER_TELEMETRY", false, env);
  const bridgePollingEnabled = envFlagWithDefault("LAYERPILOT_WORKER_BRIDGE_POLLING", false, env);
  if (!telemetryEnabled && !bridgePollingEnabled) {
    return { name: "worker", ok: true, detail: "worker checks disabled" };
  }
  const telemetryIntervalMs = envPositiveNumber("LAYERPILOT_WORKER_TELEMETRY_INTERVAL_MS", 5000, env);
  const bridgePollingIntervalMs = envPositiveNumber("LAYERPILOT_WORKER_BRIDGE_POLL_INTERVAL_MS", 10000, env);
  const enabledIntervals = [
    telemetryEnabled ? telemetryIntervalMs : 0,
    bridgePollingEnabled ? bridgePollingIntervalMs : 0
  ].filter((value) => value > 0);
  const staleAfterMs = Math.max(60_000, Math.max(...enabledIntervals) * 3);
  const worker = data.dataMeta?.worker || null;
  const enabledJobs = [
    telemetryEnabled ? "telemetry" : "",
    bridgePollingEnabled ? "bridge polling" : ""
  ].filter(Boolean).join(" and ");
  if (!worker?.lastRunAt) {
    return {
      name: "worker",
      ok: false,
      detail: `no worker heartbeat for enabled ${enabledJobs}`,
      enabled: { telemetry: telemetryEnabled, bridgePolling: bridgePollingEnabled },
      staleAfterMs
    };
  }
  const lastRunMs = Date.parse(worker.lastRunAt);
  if (!Number.isFinite(lastRunMs)) {
    return {
      name: "worker",
      ok: false,
      id: worker.id || "worker",
      detail: `invalid worker heartbeat timestamp: ${worker.lastRunAt}`,
      enabled: { telemetry: telemetryEnabled, bridgePolling: bridgePollingEnabled },
      staleAfterMs
    };
  }
  const ageMs = Math.max(0, now.getTime() - lastRunMs);
  const ok = ageMs <= staleAfterMs;
  return {
    name: "worker",
    ok,
    id: worker.id || "worker",
    detail: ok ? `${worker.id || "worker"} last ran ${Math.round(ageMs / 1000)}s ago` : `${worker.id || "worker"} heartbeat stale by ${Math.round((ageMs - staleAfterMs) / 1000)}s`,
    lastRunAt: worker.lastRunAt,
    ageMs,
    staleAfterMs,
    enabled: { telemetry: telemetryEnabled, bridgePolling: bridgePollingEnabled }
  };
}

async function checkReadiness(database, startedAt) {
  const checks = [];
  const checkedAt = new Date().toISOString();
  try {
    await database.write();
    checks.push({ name: "database", ok: true, detail: `${database.persistenceLabel || "lowdb-json"} writable` });
  } catch (error) {
    checks.push({ name: "database", ok: false, detail: error.message });
  }
  try {
    const storage = await objectStorage().health();
    checks.push({ name: "storage", ok: true, detail: storage.detail });
  } catch (error) {
    checks.push({ name: "storage", ok: false, detail: error.message });
  }
  const integrity = await buildDataIntegrityReport(database.data);
  checks.push({
    name: "data-integrity",
    ok: integrity.ok,
    detail: integrity.ok ? `${integrity.warnings.length} warning(s)` : `${integrity.errors.length} error(s)`,
    schemaVersion: integrity.schemaVersion
  });
  const workerCheck = productionWorkerReadinessCheck(database.data, process.env, new Date(checkedAt));
  if (workerCheck) checks.push(workerCheck);
  else if (database.data.dataMeta?.worker?.lastRunAt) checks.push({
    name: "worker",
    ok: true,
    detail: `${database.data.dataMeta.worker.id || "worker"} last ran at ${database.data.dataMeta.worker.lastRunAt}`
  });
  checks.push(...productionReadinessConfigChecks(database.data));
  const ok = checks.every((check) => check.ok);
  return {
    ok,
    service: "layerpilot-api",
    checkedAt,
    uptimeSeconds: Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000)),
    checks
  };
}

function countBy(items, key) {
  return (items || []).reduce((counts, item) => {
    const value = String(typeof key === "function" ? key(item) : item?.[key] || "unknown");
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function promValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function promLabel(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function metricLine(name, value, labels = {}) {
  const labelText = Object.entries(labels).length
    ? `{${Object.entries(labels).map(([key, val]) => `${key}="${promLabel(val)}"`).join(",")}}`
    : "";
  return `${name}${labelText} ${promValue(value)}`;
}

async function buildOperationalMetrics(database, startedAt) {
  const data = database.data;
  const storage = await buildStorageUsage(data);
  const todos = deriveTodos(data);
  const lines = [
    "# HELP layerpilot_up 3DSTU FarmFlow API process availability.",
    "# TYPE layerpilot_up gauge",
    metricLine("layerpilot_up", 1),
    "# HELP layerpilot_uptime_seconds 3DSTU FarmFlow API uptime in seconds.",
    "# TYPE layerpilot_uptime_seconds gauge",
    metricLine("layerpilot_uptime_seconds", Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000))),
    "# HELP layerpilot_storage_used_bytes Stored model and generated file bytes.",
    "# TYPE layerpilot_storage_used_bytes gauge",
    metricLine("layerpilot_storage_used_bytes", storage.usedBytes),
    "# HELP layerpilot_storage_limit_bytes Configured workspace storage limit.",
    "# TYPE layerpilot_storage_limit_bytes gauge",
    metricLine("layerpilot_storage_limit_bytes", storage.limitGb * BYTES_PER_GB),
    "# HELP layerpilot_records_total Current persisted record counts by collection.",
    "# TYPE layerpilot_records_total gauge"
  ];
  for (const collection of COLLECTIONS) {
    lines.push(metricLine("layerpilot_records_total", Array.isArray(data[collection]) ? data[collection].length : 0, { collection }));
  }
  lines.push("# HELP layerpilot_printers_total Current printers by status.");
  lines.push("# TYPE layerpilot_printers_total gauge");
  for (const [status, count] of Object.entries(countBy(data.printers, "status"))) {
    lines.push(metricLine("layerpilot_printers_total", count, { status }));
  }
  lines.push("# HELP layerpilot_queue_jobs_total Current queue jobs by status.");
  lines.push("# TYPE layerpilot_queue_jobs_total gauge");
  for (const [status, count] of Object.entries(countBy(data.queue, "status"))) {
    lines.push(metricLine("layerpilot_queue_jobs_total", count, { status }));
  }
  lines.push("# HELP layerpilot_todos_total Derived todos by severity and status.");
  lines.push("# TYPE layerpilot_todos_total gauge");
  for (const [key, count] of Object.entries(countBy(todos, (todo) => `${todo.status || "open"}:${todo.severity || "unknown"}`))) {
    const [status, severity] = key.split(":");
    lines.push(metricLine("layerpilot_todos_total", count, { status, severity }));
  }
  lines.push("# HELP layerpilot_events_total Persisted event count.");
  lines.push("# TYPE layerpilot_events_total gauge");
  lines.push(metricLine("layerpilot_events_total", (data.events || []).length));
  return `${lines.join("\n")}\n`;
}

function resolveBillingPlan(settings) {
  const plan = billingPlanTiers.find((tier) => tier.id === settings?.plan || tier.name === settings?.plan);
  if (plan) return plan;
  return {
    id: "custom",
    name: settings?.plan || "Custom",
    storageLimitGb: Number(settings?.storageLimitGb || 10),
    monthlyPrice: 0,
    currency: settings?.currency || "USD",
    features: ["Custom workspace plan"],
    isCustom: true
  };
}

function billingPortalMode(stripeClient) {
  if (stripeClient) return "stripe";
  return process.env.LAYERPILOT_BILLING_PORTAL_URL ? "external" : "internal";
}

function stripePriceIdForPlan(planId) {
  if (!planId || planId === "trial") return "";
  const envKey = `LAYERPILOT_STRIPE_PRICE_${String(planId).toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
  return process.env[envKey] || "";
}

function planForStripePrice(priceId) {
  if (!priceId) return null;
  return billingPlanTiers.find((tier) => stripePriceIdForPlan(tier.id) === priceId) || null;
}

function createStripeClient() {
  const secretKey = process.env.LAYERPILOT_STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey);
}

async function buildBillingSummary(data, { stripeClient = null } = {}) {
  const plan = resolveBillingPlan(data.workspaceSettings || {});
  return {
    status: plan.id === "trial" ? "trialing" : "active",
    plan,
    tiers: billingPlanTiers,
    storage: await buildStorageUsage(data),
    portalMode: billingPortalMode(stripeClient || process.env.LAYERPILOT_STRIPE_SECRET_KEY),
    invoices: (data.invoices || []).slice(0, 12),
    sessions: (data.billingSessions || []).slice(0, 5)
  };
}

async function createBillingSession({ data, user, returnUrl, requestedPlanId, stripeClient }) {
  const now = new Date();
  const currentPlan = resolveBillingPlan(data.workspaceSettings || {});
  const targetPlan = billingPlanTiers.find((tier) => tier.id === requestedPlanId) || currentPlan;
  const checkoutPlan = targetPlan.id === "trial" ? billingPlanTiers.find((tier) => tier.id === "studio") || targetPlan : targetPlan;
  const fallbackUrl = process.env.LAYERPILOT_BILLING_PORTAL_URL || `/settings?billingSession=${randomUUID()}`;
  const baseSession = {
    id: randomUUID(),
    status: "created",
    createdBy: user.id,
    createdByEmail: user.email,
    returnUrl,
    planId: checkoutPlan.id,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString()
  };

  if (stripeClient) {
    const customer = data.workspaceSettings?.stripeCustomerId;
    if (customer && stripeClient.billingPortal?.sessions?.create) {
      const stripeSession = await stripeClient.billingPortal.sessions.create({ customer, return_url: returnUrl || undefined });
      return { ...baseSession, id: stripeSession.id || baseSession.id, mode: "stripe", provider: "stripe", status: stripeSession.status || "created", url: stripeSession.url, stripeSessionId: stripeSession.id };
    }
    const price = stripePriceIdForPlan(checkoutPlan.id);
    if (price && stripeClient.checkout?.sessions?.create) {
      const stripeSession = await stripeClient.checkout.sessions.create({
        mode: "subscription",
        customer_email: user.email,
        line_items: [{ price, quantity: 1 }],
        success_url: `${returnUrl || "http://127.0.0.1:8797/settings"}?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${returnUrl || "http://127.0.0.1:8797/settings"}?billing=cancelled`,
        metadata: { layerpilotPlanId: checkoutPlan.id, workspaceId: data.workspaceSettings?.workspaceId || user.workspaceId || DEFAULT_WORKSPACE_ID }
      });
      return { ...baseSession, id: stripeSession.id || baseSession.id, mode: "stripe", provider: "stripe", status: stripeSession.status || "created", url: stripeSession.url, stripeSessionId: stripeSession.id, stripePriceId: price };
    }
  }

  return {
    ...baseSession,
    mode: process.env.LAYERPILOT_BILLING_PORTAL_URL ? "external" : "internal",
    provider: process.env.LAYERPILOT_BILLING_PORTAL_URL ? "external" : "internal",
    url: fallbackUrl
  };
}

function applyStripeBillingEvent(data, event) {
  const object = event.data?.object || {};
  const invoiceId = object.id || event.id || `stripe-${Date.now()}`;
  const priceId = object.lines?.data?.[0]?.price?.id || object.items?.data?.[0]?.price?.id || object.plan?.id || object.price?.id || "";
  const plan = planForStripePrice(priceId);
  const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
  const subscriptionId = typeof object.subscription === "string" ? object.subscription : object.id?.startsWith?.("sub_") ? object.id : object.subscription?.id;

  if (customerId) data.workspaceSettings.stripeCustomerId = customerId;
  if (subscriptionId) data.workspaceSettings.stripeSubscriptionId = subscriptionId;
  if (plan) {
    data.workspaceSettings = workspaceSettingsSchema.parse({
      ...data.workspaceSettings,
      plan: plan.name,
      storageLimitGb: plan.storageLimitGb,
      stripeCustomerId: data.workspaceSettings.stripeCustomerId,
      stripeSubscriptionId: data.workspaceSettings.stripeSubscriptionId
    });
  }

  if (event.type.startsWith("invoice.") || event.type.startsWith("checkout.session.") || event.type.startsWith("customer.subscription.")) {
    const amount = Number(object.amount_paid ?? object.amount_due ?? object.amount_total ?? (plan?.monthlyPrice || 0) * 100) / 100;
    const status = object.status || (event.type.endsWith(".completed") || event.type.endsWith(".paid") ? "paid" : "open");
    const invoice = {
      id: invoiceId,
      provider: "stripe",
      planId: plan?.id || "",
      plan: plan?.name || resolveBillingPlan(data.workspaceSettings).name,
      amount,
      currency: String(object.currency || plan?.currency || data.workspaceSettings?.currency || "USD").toUpperCase(),
      status,
      note: `Stripe ${event.type}`,
      at: object.created ? new Date(Number(object.created) * 1000).toISOString() : new Date().toISOString()
    };
    const existingIndex = data.invoices.findIndex((item) => item.id === invoice.id);
    if (existingIndex >= 0) data.invoices[existingIndex] = { ...data.invoices[existingIndex], ...invoice };
    else data.invoices.unshift(invoice);
    return { plan, invoice };
  }
  return { plan, invoice: null };
}

function fileReferences(data, fileId) {
  const activeQueue = (data.queue || []).filter((job) => job.fileId === fileId && !["complete", "failed", "cancelled"].includes(job.status));
  const parts = (data.parts || []).filter((part) => part.fileId === fileId);
  const quoteRequests = (data.quoteRequests || []).filter((quote) => quote.fileId === fileId && quote.status !== "converted" && quote.status !== "rejected");
  const slicerJobs = (data.slicerJobs || []).filter((job) => job.fileId === fileId && job.status === "running");
  return {
    activeQueue: activeQueue.map((job) => ({ id: job.id, file: job.file, status: job.status })),
    parts: parts.map((part) => ({ id: part.id, name: part.name })),
    quoteRequests: quoteRequests.map((quote) => ({ id: quote.id, project: quote.project, status: quote.status })),
    slicerJobs: slicerJobs.map((job) => ({ id: job.id, status: job.status }))
  };
}

function hasReferences(references) {
  return references.activeQueue.length || references.parts.length || references.quoteRequests.length || references.slicerJobs.length;
}

async function removeStoredFile(fileOrPath) {
  const storagePath = typeof fileOrPath === "string" ? fileOrPath : fileOrPath?.storagePath;
  if (!storagePath) return false;
  if (typeof fileOrPath === "object" && (fileOrPath.storageProvider === "s3" || fileOrPath.storageKey || String(storagePath).startsWith("s3://"))) return objectStorage().delete(fileOrPath);
  if (String(storagePath).startsWith("s3://")) return objectStorage().delete({ storagePath, storageProvider: "s3" });
  const resolved = path.resolve(storagePath);
  const root = storageRoot();
  if (!isPathInside(root, resolved)) return false;
  const parent = path.dirname(resolved);
  await rm(resolved, { force: true }).catch(() => undefined);
  if (isPathInside(root, parent) && /[\\\/](uploads|slices)[\\\/][^\\\/]+$/.test(parent)) {
    await rm(parent, { recursive: true, force: true }).catch(() => undefined);
  }
  return true;
}

function estimateSliceOutput(file, settings) {
  const layer = Number(settings.layerHeight || file.layerHeight || 0.2) || 0.2;
  const layerFactor = Math.max(0.55, Math.min(2.5, 0.2 / layer));
  const infillFactor = 0.75 + Number(settings.infill || 18) / 100;
  const supportFactor = settings.supports ? 1.12 : 1;
  const baseMinutes = Number(file.estimateMinutes || parseDurationMinutes(file.printTime) || 60);
  const estimateMinutes = Math.max(10, Math.round(baseMinutes * layerFactor * infillFactor * supportFactor));
  const estimateGrams = Math.max(1, Math.round(Number(file.estimateGrams || file.usage || 20) * infillFactor * supportFactor));
  const quote = Math.max(18, Math.round(estimateGrams * 1.35 + estimateMinutes * 0.3));
  return { estimateMinutes, estimateGrams, quote, printTime: formatDurationMinutes(estimateMinutes) };
}

export function calculateQuote(costCatalog, { material, grams, minutes, includeLabor = false, quantity = 1 }) {
  const catalog = costCatalogSchema.parse({ ...defaultCostCatalog, ...(costCatalog || {}) });
  const materialRate = catalog.materialRates[material] ?? catalog.materialRates[Object.keys(catalog.materialRates).find((key) => material?.toLowerCase().includes(key.toLowerCase())) || "PLA"] ?? 1;
  const materialCost = Number(grams || 0) / 100 * materialRate;
  const machineCost = Number(minutes || 0) / 60 * catalog.machineHourlyRate;
  const laborCost = includeLabor ? catalog.laborPerOrder : 0;
  const subtotal = (materialCost + machineCost + laborCost) * quantity;
  const reserve = subtotal * catalog.failureReservePercent / 100;
  const overhead = subtotal * catalog.overheadPercent / 100;
  const total = Math.max(catalog.minimumQuote, Math.round((subtotal + reserve + overhead) * 100) / 100);
  return {
    currency: catalog.currency,
    material,
    quantity,
    grams,
    minutes,
    materialCost: Math.round(materialCost * 100) / 100,
    machineCost: Math.round(machineCost * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
    reserve: Math.round(reserve * 100) / 100,
    overhead: Math.round(overhead * 100) / 100,
    total
  };
}

function buildInternalGcode({ file, printer, profile, settings, estimates }) {
  const [x, y, z] = file.dimensions || [100, 100, 50];
  return [
    "; Generated by 3DSTU FarmFlow internal slicer adapter",
    `; Source file: ${file.name}`,
    `; Printer: ${printer.name}`,
    `; Profile: ${profile?.name || "Default"}`,
    `; Material: ${settings.material}`,
    `; Layer height: ${settings.layerHeight}`,
    `; Infill: ${settings.infill}%`,
    `; Supports: ${settings.supports ? "enabled" : "disabled"}`,
    `; Estimated print time: ${estimates.printTime}`,
    `; Estimated grams: ${estimates.estimateGrams}`,
    "G21 ; metric",
    "G90 ; absolute",
    "M82 ; absolute extrusion",
    `M104 S${settings.material === "PETG" ? 240 : settings.material === "ASA" ? 255 : 210}`,
    "M140 S60",
    "G28",
    "G1 Z0.2 F900",
    "G1 X0 Y0 F6000",
    `G1 X${Math.min(x, printer.buildVolume?.[0] || x).toFixed(1)} Y0 E1 F1200`,
    `G1 X${Math.min(x, printer.buildVolume?.[0] || x).toFixed(1)} Y${Math.min(y, printer.buildVolume?.[1] || y).toFixed(1)} E2 F1200`,
    `G1 X0 Y${Math.min(y, printer.buildVolume?.[1] || y).toFixed(1)} E3 F1200`,
    "G1 X0 Y0 E4 F1200",
    `G1 Z${Math.min(z, printer.buildVolume?.[2] || z).toFixed(1)} F900`,
    "M104 S0",
    "M140 S0",
    "M84",
    "; End 3DSTU FarmFlow generated G-code",
    ""
  ].join("\n");
}

function slicerArgsFromTemplate({ inputPath, outputPath, configPath }) {
  const raw = process.env.LAYERPILOT_SLICER_ARGS;
  if (!raw) return ["--export-gcode", "--output", outputPath, inputPath];
  try {
    const args = JSON.parse(raw);
    if (Array.isArray(args)) {
      return args.map((arg) => String(arg).replaceAll("{input}", inputPath).replaceAll("{output}", outputPath).replaceAll("{config}", configPath));
    }
  } catch {
    return raw.split(/\s+/).filter(Boolean).map((arg) => arg.replaceAll("{input}", inputPath).replaceAll("{output}", outputPath).replaceAll("{config}", configPath));
  }
  return ["--export-gcode", "--output", outputPath, inputPath];
}

function resolveSlicerProfile(data, payload, printer) {
  const profiles = data.profiles || [];
  const workspaceId = payload.workspaceId || DEFAULT_WORKSPACE_ID;
  if (payload.profileId) return profiles.find((item) => item.id === payload.profileId && itemInWorkspace(item, workspaceId));
  const defaults = data.profileDefaults || {};
  const preferred = [defaults.Process, defaults.Machine, defaults.Filament]
    .map((id) => profiles.find((profile) => profile.id === id && itemInWorkspace(profile, workspaceId)))
    .find(Boolean);
  if (preferred) return preferred;
  return profiles.find((item) => itemInWorkspace(item, workspaceId) && (item.target === printer.name || item.target === printer.model));
}

async function runSlicerJob(database, payload) {
  const workspaceId = payload.workspaceId || DEFAULT_WORKSPACE_ID;
  const file = database.data.files.find((item) => item.id === payload.fileId && itemInWorkspace(item, workspaceId));
  if (!file) return { error: "File not found", statusCode: 404 };
  const printer = database.data.printers.find((item) => item.id === payload.printerId && itemInWorkspace(item, workspaceId));
  if (!printer) return { error: "Printer not found", statusCode: 404 };
  const profile = resolveSlicerProfile(database.data, payload, printer);
  const now = new Date().toISOString();
  const job = {
    id: randomUUID(),
    workspaceId,
    fileId: file.id,
    sourceFile: file.name,
    printerId: printer.id,
    printer: printer.name,
    profileId: profile?.id || "",
    profile: profile?.name || "Default",
    status: "running",
    engine: process.env.LAYERPILOT_SLICER_CMD ? "external" : "internal",
    settings: payload,
    createdAt: now,
    updatedAt: now
  };
  database.data.slicerJobs.unshift(job);
  const outputDir = path.join(storageRoot(), "slices", job.id);
  await mkdir(outputDir, { recursive: true });
  const outputName = `${path.basename(file.name, path.extname(file.name))}.gcode`;
  const outputPath = path.join(outputDir, outputName);
  const configPath = path.join(outputDir, "layerpilot-slicer-settings.json");
  const estimates = estimateSliceOutput(file, payload);
  const quote = calculateQuote(database.data.costCatalog, { material: payload.material, grams: estimates.estimateGrams, minutes: estimates.estimateMinutes });
  estimates.quote = quote.total;
  estimates.quoteBreakdown = quote;
  await writeFile(configPath, JSON.stringify({ file, printer, profile, settings: payload, estimates }, null, 2));
  try {
    if (process.env.LAYERPILOT_SLICER_CMD && file.storagePath) {
      let inputPath = file.storagePath;
      if (file.storageProvider === "s3" || file.storageKey || String(file.storagePath || "").startsWith("s3://")) {
        inputPath = path.join(outputDir, path.basename(file.name || `${file.id}.model`));
        await writeFile(inputPath, await readStoredObject(file));
      }
      const args = slicerArgsFromTemplate({ inputPath, outputPath, configPath });
      const result = await execFileAsync(process.env.LAYERPILOT_SLICER_CMD, args, { timeout: Number(process.env.LAYERPILOT_SLICER_TIMEOUT_MS || 120000), maxBuffer: 1024 * 1024 });
      job.stdout = result.stdout?.slice(0, 4000) || "";
      job.stderr = result.stderr?.slice(0, 4000) || "";
    } else {
      await writeFile(outputPath, buildInternalGcode({ file, printer, profile, settings: payload, estimates }));
      job.warning = file.storagePath ? "" : "Internal slicer adapter used because no external slicer command is configured";
    }
    const output = await readFile(outputPath);
    const stored = await storeObject(`slices/${job.id}/${outputName}`, output, { filename: outputName, type: "GCODE" });
    Object.assign(file, {
      type: "GCODE",
      sliced: true,
      status: "sliced",
      version: Number(file.version || 1) + 1,
      material: payload.material,
      layerHeight: payload.layerHeight,
      printTime: estimates.printTime,
      cost: estimates.quote,
      usage: estimates.estimateGrams,
      estimateMinutes: estimates.estimateMinutes,
      estimateGrams: estimates.estimateGrams,
      quote: estimates.quote,
      size: formatBytes(output.length),
      storagePath: stored.storagePath,
      storageProvider: stored.storageProvider,
      storageKey: stored.storageKey,
      thumbnail: outputName,
      updatedAt: new Date().toISOString()
    });
    Object.assign(job, {
      status: "complete",
      outputPath,
      outputName,
      outputSize: formatBytes(output.length),
      estimates,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    Object.assign(job, {
      status: "failed",
      error: error instanceof Error ? error.message : "Slicer job failed",
      updatedAt: new Date().toISOString()
    });
  }
  return { job, file };
}

function parseOrderItem(item) {
  const text = String(item || "").trim();
  const match = text.match(/^(.+?)\s+x\s*(\d+)$/i);
  return {
    sku: (match ? match[1] : text).trim(),
    quantity: Math.max(1, Number(match?.[2] || 1))
  };
}

function normalizeCommerceSource(source) {
  const parsed = commerceSourceSchema.safeParse(source);
  if (!parsed.success || parsed.data === "Generic") return "Manual";
  return parsed.data;
}

function normalizeCommerceKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseCsvText(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map(normalizeCommerceKey);
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ""])));
}

function lineItemToText(item) {
  if (typeof item === "string") return item.trim();
  const sku = item?.sku || item?.variant_sku || item?.title || item?.name || item?.product_id || "CUSTOM";
  const quantity = Math.max(1, Number(item?.quantity || item?.qty || 1));
  return `${sku} x${quantity}`;
}

function normalizeCommerceItems(record) {
  if (Array.isArray(record?.items)) return record.items.map(lineItemToText).filter(Boolean);
  if (Array.isArray(record?.line_items)) return record.line_items.map(lineItemToText).filter(Boolean);
  if (Array.isArray(record?.lineItems)) return record.lineItems.map(lineItemToText).filter(Boolean);
  const text = record?.items || record?.item || record?.sku || record?.lineitems || "";
  if (record?.sku && record?.quantity) return [`${record.sku} x${Math.max(1, Number(record.quantity || 1))}`];
  return String(text)
    .split(/\s*[;|]\s*|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCommerceRecord(record, fallbackSource = "Generic") {
  const source = normalizeCommerceSource(record?.source || fallbackSource);
  const externalId = String(record?.externalId || record?.externalid || record?.external_id || record?.orderid || record?.order_id || record?.id || record?.name || "").trim();
  const customerObject = record?.customer && typeof record.customer === "object" ? record.customer : null;
  const shipping = record?.shipping_address || record?.shippingAddress || {};
  const customer = String(
    typeof record?.customer === "string" && record.customer ||
    record?.customer_name ||
    record?.customername ||
    customerObject?.name ||
    customerObject?.email ||
    shipping?.name ||
    record?.email ||
    "Unknown customer"
  ).trim();
  const items = normalizeCommerceItems(record);
  const value = Number(record?.value ?? record?.total_price ?? record?.totalprice ?? record?.total ?? record?.amount ?? 0);
  const status = orderStatusSchema.safeParse(String(record?.status || "").toLowerCase()).success ? String(record.status).toLowerCase() : "received";
  const due = String(record?.due || record?.due_at || record?.dueat || record?.delivery_due || record?.created_at || record?.createdat || "Tomorrow 17:00").trim();
  const parsed = orderSchema.safeParse({
    source,
    externalId: externalId || undefined,
    customer,
    items: items.length ? items : ["CUSTOM x1"],
    status,
    due,
    value: Number.isFinite(value) && value >= 0 ? value : 0
  });
  if (!parsed.success) return { error: parsed.error.issues };
  return { order: parsed.data };
}

function nextOrderId(data) {
  const max = (data.orders || []).reduce((highest, order) => {
    const number = Number(String(order.id || "").match(/^ord-(\d+)$/)?.[1] || 0);
    return Math.max(highest, number);
  }, 1000);
  return `ord-${max + 1}`;
}

function commerceDuplicate(data, draft, workspaceId = DEFAULT_WORKSPACE_ID) {
  if (draft.externalId) {
    return data.orders.find((order) => itemInWorkspace(order, workspaceId) && order.source === draft.source && String(order.externalId || "") === String(draft.externalId));
  }
  const signature = `${draft.source}|${draft.customer}|${draft.items.join("|")}|${draft.due}|${draft.value}`.toLowerCase();
  return data.orders.find((order) => itemInWorkspace(order, workspaceId) && `${order.source}|${order.customer}|${(order.items || []).join("|")}|${order.due}|${order.value}`.toLowerCase() === signature);
}

async function importCommerceOrders(database, { records, source = "Generic", connectorId = "", connectorName = "Manual import", workspaceId = DEFAULT_WORKSPACE_ID }) {
  const created = [];
  const skipped = [];
  for (const record of records) {
    const normalized = normalizeCommerceRecord(record, source);
    if (normalized.error) {
      skipped.push({ reason: "Invalid order", issues: normalized.error });
      continue;
    }
    const duplicate = commerceDuplicate(database.data, normalized.order, workspaceId);
    if (duplicate) {
      skipped.push({ reason: "Duplicate order", externalId: normalized.order.externalId || "", orderId: duplicate.id });
      continue;
    }
    const order = { id: nextOrderId(database.data), workspaceId, ...normalized.order, updatedAt: new Date().toISOString(), importedAt: new Date().toISOString(), connectorId: connectorId || undefined };
    database.data.orders.push(order);
    created.push(order);
  }
  const importRun = {
    id: randomUUID(),
    workspaceId,
    source,
    connectorId: connectorId || undefined,
    connectorName,
    status: skipped.length && !created.length ? "skipped" : "imported",
    created: created.length,
    skipped: skipped.length,
    at: new Date().toISOString()
  };
  database.data.commerceImports.unshift(importRun);
  if (created.length) {
    await dispatchEvent(database, "commerce.imported", `${created.length} ${source} orders imported`, { workspaceId, connectorId, orderIds: created.map((order) => order.id), skipped: skipped.length });
  }
  return { created, skipped, importRun, orders: database.data.orders };
}

function materialFromPart(part) {
  const material = String(part.material || "Auto matched");
  const known = ["PLA", "PETG", "ASA", "TPU", "Resin"];
  return known.find((item) => material.toLowerCase().includes(item.toLowerCase())) || material;
}

function profileKindFromSettings(settings = {}, fallback = "Process") {
  const keys = Object.keys(settings).join(" ").toLowerCase();
  const name = String(settings.name || settings.filament_settings_id || settings.printer_settings_id || settings.print_settings_id || "").toLowerCase();
  if (keys.includes("printer") || keys.includes("bed_shape") || keys.includes("machine") || name.includes("printer")) return "Machine";
  if (keys.includes("filament") || keys.includes("temperature") || keys.includes("nozzle_temperature") || name.includes("filament") || name.includes("pla") || name.includes("petg")) return "Filament";
  return fallback;
}

function parsePrimitiveProfileValue(value) {
  const text = String(value || "").trim();
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text.includes(";")) return text.split(";").map((item) => item.trim()).filter(Boolean);
  return text;
}

function parseKeyValueProfileText(content) {
  const profiles = [];
  let current = { settings: {} };
  const flush = () => {
    if (!Object.keys(current.settings).length) return;
    const name = String(current.settings.name || current.settings.filament_settings_id || current.settings.printer_settings_id || current.settings.print_settings_id || current.section || "Imported profile").replace(/^"|"$/g, "");
    profiles.push({
      name,
      kind: profileKindFromSettings(current.settings),
      target: String(current.settings.printer_model || current.settings.compatible_printers || current.settings.target || "FDM fleet"),
      settings: current.settings
    });
  };
  for (const rawLine of String(content).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const section = line.match(/^\[(.+)]$/);
    if (section) {
      flush();
      current = { section: section[1], settings: {} };
      continue;
    }
    const keyValue = line.match(/^([^=:#]+)\s*[:=]\s*(.+)$/);
    if (keyValue) current.settings[keyValue[1].trim()] = parsePrimitiveProfileValue(keyValue[2]);
  }
  flush();
  return profiles;
}

function normalizeProfileDraft(draft, source) {
  const settings = draft.settings && typeof draft.settings === "object" ? draft.settings : { ...draft };
  const name = draft.name || settings.name || settings.filament_settings_id || settings.printer_settings_id || settings.print_settings_id || settings.profile_name || "Imported profile";
  const parsed = profileSchema.safeParse({
    name: String(name),
    kind: draft.kind || profileKindFromSettings(settings),
    target: String(draft.target || settings.target || settings.printer_model || settings.compatible_printers || "FDM fleet"),
    source: draft.source || source,
    settings
  });
  return parsed.success ? parsed.data : null;
}

function parseProfileImportPayload(payload) {
  const source = payload.source || "Orca import";
  const imported = [];
  if (Array.isArray(payload.profiles)) {
    for (const profile of payload.profiles) {
      const normalized = normalizeProfileDraft(profile, source);
      if (normalized) imported.push(normalized);
    }
    return imported;
  }
  const content = String(payload.content || "");
  try {
    const json = JSON.parse(content);
    const rows = Array.isArray(json) ? json : Array.isArray(json.profiles) ? json.profiles : [json];
    for (const row of rows) {
      const normalized = normalizeProfileDraft(row, source);
      if (normalized) imported.push(normalized);
    }
    return imported;
  } catch {
    return parseKeyValueProfileText(content).map((profile) => ({ ...profile, source }));
  }
}

function createJobFromPart({ order, sku, part, file, printer, copyIndex }) {
  return {
    id: randomUUID(),
    workspaceId: order.workspaceId || DEFAULT_WORKSPACE_ID,
    fileId: file?.id || part.fileId,
    file: `${order.id} ${sku.sku} ${part.name}${copyIndex > 1 ? ` #${copyIndex}` : ""}`,
    printerId: printer.id,
    printer: printer.name,
    status: "queued",
    priority: order.due?.includes("Today") ? "High" : "Normal",
    stage: file?.sliced ? "needs scheduling" : "needs slicing",
    material: materialFromPart(part),
    color: part.variants?.find((variant) => ["Black", "Blue", "Orange", "Carbon", "White", "Gray"].includes(variant)) || "Any",
    due: order.due,
    dimensions: file?.dimensions || [120, 100, 50],
    assignee: "Scheduler",
    time: file?.printTime || "2h 00m",
    cost: Math.round((file?.cost || sku.price || order.value || 0) / Math.max(1, part.plates || 1)),
    added: `From ${order.id}`,
    sourceOrderId: order.id,
    sourceSku: sku.sku,
    sourcePartId: part.id
  };
}

function createJobFromQuote({ quote, order, file, printer, workspaceData }) {
  const job = {
    id: randomUUID(),
    workspaceId: quote.workspaceId || order.workspaceId || DEFAULT_WORKSPACE_ID,
    fileId: file.id,
    file: `${quote.project} x${quote.quantity}`,
    printerId: printer.id,
    printer: printer.name,
    status: "queued",
    priority: quote.priority || "Normal",
    stage: file.sliced ? "needs scheduling" : "needs slicing",
    material: quote.material || file.material || "PLA",
    color: "Any",
    due: order.due || quote.due || "Flexible",
    dimensions: file.dimensions || [100, 100, 50],
    assignee: "Scheduler",
    time: file.printTime || "1h 00m",
    cost: Number(order.value || quote.quotedValue || quote.estimatedQuote || file.cost || 0),
    added: `Quote ${quote.id}`,
    sourceOrderId: order.id,
    sourceQuoteRequestId: quote.id,
    estimateGrams: file.estimateGrams || file.usage || quote.estimatedGrams || 0,
    estimateMinutes: file.estimateMinutes || quote.estimatedMinutes || 0
  };
  job.scheduleWarnings = getScheduleWarnings(workspaceData, job, printer);
  return job;
}

function publicQuoteSummary(quote) {
  return {
    id: quote.id,
    status: quote.status,
    project: quote.project,
    customer: quote.customer,
    company: quote.company || "",
    material: quote.material,
    quantity: quote.quantity,
    due: quote.due,
    budget: quote.budget,
    quotedValue: quote.quotedValue || 0,
    validUntil: quote.validUntil || "",
    fileName: quote.fileName || "",
    fileType: quote.fileType || "",
    fileSize: quote.fileSize || "",
    estimatedGrams: quote.estimatedGrams || 0,
    estimatedMinutes: quote.estimatedMinutes || 0,
    estimatedQuote: quote.estimatedQuote || 0,
    orderId: quote.orderId || "",
    customerDecision: quote.customerDecision || "",
    customerDecisionAt: quote.customerDecisionAt || "",
    customerDecisionNote: quote.customerDecisionNote || "",
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt
  };
}

function quoteTokenMatches(quote, token) {
  if (!quote?.customerAccessToken || !token) return false;
  const expected = Buffer.from(String(quote.customerAccessToken));
  const received = Buffer.from(String(token));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function quoteExpired(quote, now = new Date()) {
  if (!quote?.validUntil) return false;
  const expiresAt = new Date(`${quote.validUntil}T23:59:59.999Z`);
  return Number.isFinite(expiresAt.getTime()) && expiresAt < now;
}

function publicQuoteUrl(request, quote) {
  const configured = process.env.LAYERPILOT_PUBLIC_URL || "";
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(request.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const host = forwardedHost || request.headers.host || "127.0.0.1:8797";
  const base = (configured || `${forwardedProto || "http"}://${host}`).replace(/\/+$/, "");
  const params = new URLSearchParams({ quoteId: quote.id, quoteToken: quote.customerAccessToken || "" });
  return `${base}/?${params.toString()}#quote`;
}

function convertQuoteToProduction(data, quote, { workspaceId, due, value, createJob = true, reviewedBy = "system" } = {}) {
  if (quote.orderId) return { error: "Quote request already converted", statusCode: 409, orderId: quote.orderId };
  const now = new Date().toISOString();
  const targetWorkspaceId = workspaceId || quote.workspaceId || DEFAULT_WORKSPACE_ID;
  const order = {
    id: `ord-${1000 + data.orders.length + 1}`,
    workspaceId: targetWorkspaceId,
    source: "Manual",
    externalId: quote.id,
    customer: quote.company ? `${quote.customer} / ${quote.company}` : quote.customer,
    items: [`${quote.project} x${quote.quantity}`],
    status: "received",
    due: due || quote.due || "Flexible",
    value: Number(value ?? quote.quotedValue ?? quote.budget ?? 0),
    quoteRequestId: quote.id,
    updatedAt: now
  };
  data.orders.push(order);
  const scoped = scopedWorkspaceData(data, targetWorkspaceId);
  const file = quote.fileId ? scoped.files.find((item) => item.id === quote.fileId) : null;
  const printer = scoped.printers.find((item) => item.status === "idle") || scoped.printers.find((item) => item.status !== "offline" && item.status !== "maintenance") || scoped.printers[0];
  const job = createJob && file && printer ? createJobFromQuote({ quote, order, file, printer, workspaceData: scoped }) : null;
  if (job) {
    data.queue.push(job);
    order.status = "queued";
    order.updatedAt = now;
  }
  Object.assign(quote, { status: "converted", orderId: order.id, convertedAt: now, updatedAt: now, reviewedBy });
  const nextScoped = scopedWorkspaceData(data, targetWorkspaceId);
  return { quoteRequest: quote, order, job, orders: nextScoped.orders, quoteRequests: nextScoped.quoteRequests, queue: nextScoped.queue, todos: deriveTodos(nextScoped) };
}

function dueFromOffset(days = 2) {
  const date = new Date(Date.now() + Number(days || 0) * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function createJobsFromProductionTemplate(data, templateId, options = {}) {
  const normalized = productionTemplateRunSchema.parse(options || {});
  const template = (data.productionTemplates || []).find((item) => item.id === templateId);
  if (!template) return { error: "Production template not found", statusCode: 404 };
  if (options.workspaceId && !itemInWorkspace(template, options.workspaceId)) return { error: "Production template not found", statusCode: 404 };
  const workspaceId = template.workspaceId || DEFAULT_WORKSPACE_ID;
  const workspaceData = scopedWorkspaceData(data, workspaceId);
  const file = workspaceData.files.find((item) => item.id === template.fileId);
  if (!file) return { error: "Template linked file not found", statusCode: 404 };
  const printer = normalized.printerId
    ? workspaceData.printers.find((item) => item.id === normalized.printerId)
    : template.printerId
      ? workspaceData.printers.find((item) => item.id === template.printerId)
      : workspaceData.printers.find((item) => item.status === "idle") || workspaceData.printers.find((item) => item.status !== "offline" && item.status !== "maintenance") || workspaceData.printers[0];
  if (!printer) return { error: "Printer not found", statusCode: 404 };
  const quantity = normalized.quantity || template.quantity || 1;
  const due = normalized.due || dueFromOffset(template.dueOffsetDays);
  const jobs = Array.from({ length: quantity }, (_, index) => {
    const job = {
      id: randomUUID(),
      workspaceId,
      fileId: file.id,
      file: `${template.name}${quantity > 1 ? ` #${index + 1}` : ""}`,
      printerId: printer.id,
      printer: printer.name,
      status: "queued",
      priority: template.priority || "Normal",
      stage: template.stage || (file.sliced ? "needs scheduling" : "needs slicing"),
      material: template.material || file.material || "PLA",
      color: template.color || "Any",
      due,
      dimensions: file.dimensions || [100, 100, 50],
      assignee: "Scheduler",
      time: template.time || file.printTime || "1h 00m",
      cost: Number(template.cost || file.cost || 0),
      added: `Template: ${template.name}`,
      sourceTemplateId: template.id,
      sourceSku: template.sku || "",
      process: template.process || ""
    };
    job.scheduleWarnings = getScheduleWarnings(workspaceData, job, printer);
    return job;
  });
  if (!normalized.dryRun) {
    data.queue.push(...jobs);
    template.lastRunAt = new Date().toISOString();
    template.runCount = Number(template.runCount || 0) + jobs.length;
    template.updatedAt = template.lastRunAt;
  }
  const nextWorkspaceData = scopedWorkspaceData(data, workspaceId);
  return { template: { ...template }, jobs, dryRun: normalized.dryRun, queue: nextWorkspaceData.queue, todos: deriveTodos(nextWorkspaceData) };
}

export function generateJobsForOrder(data, orderId, options = {}) {
  const normalized = orderJobGenerationSchema.parse(options);
  const order = data.orders.find((item) => item.id === orderId);
  if (!order) return { error: "Order not found", statusCode: 404 };
  if (terminalOrderStatuses.has(order.status)) return { error: "Cannot generate jobs for a terminal order", statusCode: 409, order };
  const workspaceId = order.workspaceId || DEFAULT_WORKSPACE_ID;
  const workspaceData = scopedWorkspaceData(data, workspaceId);
  const existingJobs = (data.queue || []).filter((job) => itemInWorkspace(job, workspaceId) && job.sourceOrderId === order.id && !["cancelled", "failed"].includes(job.status));
  if (existingJobs.length && !normalized.allowDuplicate) {
    return { order, jobs: [], existingJobs, missing: [], skus: workspaceData.skus, todos: deriveTodos(workspaceData), dryRun: normalized.dryRun, duplicateBlocked: true };
  }
  const printer = workspaceData.printers.find((item) => item.status === "idle") || workspaceData.printers.find((item) => item.status !== "offline" && item.status !== "maintenance") || workspaceData.printers[0];
  if (!printer) return { error: "Printer not found", statusCode: 404 };
  const jobs = [];
  const missing = [];
  const stockChanges = [];
  for (const item of order.items) {
    const parsed = parseOrderItem(item);
    const sku = data.skus.find((entry) => itemInWorkspace(entry, workspaceId) && entry.sku.toLowerCase() === parsed.sku.toLowerCase());
    if (!sku) {
      missing.push({ item, reason: "SKU not found" });
      continue;
    }
    const parts = sku.parts.map((name) => data.parts.find((part) => itemInWorkspace(part, workspaceId) && part.name.toLowerCase() === name.toLowerCase())).filter(Boolean);
    if (!parts.length) {
      missing.push({ item, reason: "No linked parts" });
      continue;
    }
    for (let copy = 1; copy <= parsed.quantity; copy += 1) {
      for (const part of parts) {
        const file = data.files.find((entry) => entry.id === part.fileId && itemInWorkspace(entry, workspaceId));
        const job = createJobFromPart({ order, sku, part, file, printer, copyIndex: copy });
        job.scheduleWarnings = getScheduleWarnings(workspaceData, job, printer);
        jobs.push(job);
      }
    }
    const before = Number(sku.stock || 0);
    const after = Math.max(0, before - parsed.quantity);
    stockChanges.push({ sku: sku.sku, before, after, quantity: parsed.quantity });
    if (!normalized.dryRun) sku.stock = after;
  }
  if (!normalized.dryRun) {
    data.queue.push(...jobs);
    if (jobs.length) order.status = "queued";
    order.updatedAt = new Date().toISOString();
  }
  const nextWorkspaceData = scopedWorkspaceData(data, workspaceId);
  return { order: normalized.dryRun ? { ...order } : order, jobs, missing, skus: nextWorkspaceData.skus, todos: deriveTodos(nextWorkspaceData), dryRun: normalized.dryRun, duplicateBlocked: false, existingJobs: [], stockChanges };
}

function applyOrderStatusChange(data, order, status) {
  const workspaceId = order.workspaceId || DEFAULT_WORKSPACE_ID;
  const workspaceData = scopedWorkspaceData(data, workspaceId);
  const now = new Date().toISOString();
  const linkedJobs = (data.queue || []).filter((job) => itemInWorkspace(job, workspaceId) && job.sourceOrderId === order.id);
  const changedJobs = [];
  const materialChanges = [];
  order.status = status;
  order.updatedAt = now;
  if (status === "cancelled") {
    for (const job of linkedJobs) {
      if (["complete", "failed", "cancelled"].includes(job.status)) continue;
      job.status = "cancelled";
      job.stage = "blocked";
      job.updatedAt = now;
      job.completedAt = now;
      const materialChange = releaseJobMaterialReservation(workspaceData, job);
      if (materialChange) materialChanges.push(materialChange);
      changedJobs.push(job);
    }
  }
  if (status === "on_hold") {
    for (const job of linkedJobs) {
      if (job.status !== "queued") continue;
      job.stage = "blocked";
      job.updatedAt = now;
      changedJobs.push(job);
    }
  }
  if (status === "completed") {
    order.completedAt = now;
  }
  return { order, jobs: changedJobs, materialChanges, spools: workspaceData.spools, todos: deriveTodos(workspaceData) };
}

function priorityWeight(priority) {
  return { Rush: 0, High: 1, Normal: 2, Low: 3 }[priority] ?? 2;
}

function materialKey(value = "") {
  return String(value || "").trim().toLowerCase();
}

function jobEstimateGrams(data, job) {
  const direct = Number(job.estimateGrams ?? job.estimatedGrams ?? job.usage ?? job.grams ?? 0);
  const file = data.files?.find((item) => item.id === job.fileId);
  const fromFile = Number(file?.estimateGrams ?? file?.usage ?? 0);
  const fromCost = Number(job.cost || 0) > 0 ? Number(job.cost) : 0;
  return Math.max(1, Math.round(direct || fromFile || fromCost || parseDurationMinutes(job.time) * 0.35));
}

function normalizeSpoolReservations(spool) {
  spool.reservations = Array.isArray(spool.reservations) ? spool.reservations.filter((item) => item && item.jobId) : [];
  spool.reserved = Math.max(0, Math.round(spool.reservations.reduce((sum, item) => sum + Number(item.grams || 0), 0)));
  return spool.reserved;
}

function spoolAvailableGrams(spool) {
  return Math.max(0, Number(spool.remaining || 0) - normalizeSpoolReservations(spool));
}

function jobReservationCovers(data, job) {
  if (!job.reservedSpoolId || !job.reservedGrams) return false;
  const spool = data.spools?.find((item) => item.id === job.reservedSpoolId);
  return !!spool && materialKey(spool.material) === materialKey(job.material) && Number(job.reservedGrams || 0) >= jobEstimateGrams(data, job);
}

function findReservableSpool(data, job) {
  if (!Array.isArray(data.spools) || materialKey(job.material) === "auto matched") return null;
  const requiredGrams = jobEstimateGrams(data, job);
  return data.spools
    .filter((spool) => materialKey(spool.material) === materialKey(job.material) && spoolAvailableGrams(spool) >= requiredGrams)
    .sort((a, b) => Number(b.dry === true) - Number(a.dry === true) || spoolAvailableGrams(a) - spoolAvailableGrams(b))[0] || null;
}

function hasMaterialCoverage(data, job) {
  if (materialKey(job.material) === "auto matched") return true;
  if (jobReservationCovers(data, job)) return true;
  return !!findReservableSpool(data, job);
}

function releaseJobMaterialReservation(data, job) {
  if (!job?.reservedSpoolId) return null;
  const spool = data.spools?.find((item) => item.id === job.reservedSpoolId);
  const released = { spoolId: job.reservedSpoolId, grams: Number(job.reservedGrams || 0), material: job.material };
  if (spool) {
    spool.reservations = (spool.reservations || []).filter((item) => item.jobId !== job.id);
    normalizeSpoolReservations(spool);
    spool.updatedAt = new Date().toISOString();
  }
  delete job.reservedSpoolId;
  delete job.reservedGrams;
  job.materialReservation = job.materialReservation ? { ...job.materialReservation, status: "released", releasedAt: new Date().toISOString() } : undefined;
  return released;
}

function reserveJobMaterial(data, job) {
  releaseJobMaterialReservation(data, job);
  if (["complete", "cancelled", "failed"].includes(job.status)) return null;
  const spool = findReservableSpool(data, job);
  if (!spool) {
    job.materialReservation = {
      status: "missing",
      material: job.material,
      requiredGrams: jobEstimateGrams(data, job),
      checkedAt: new Date().toISOString()
    };
    return null;
  }
  const grams = jobEstimateGrams(data, job);
  const reservation = {
    jobId: job.id,
    file: job.file,
    grams,
    material: job.material,
    printerId: job.printerId,
    scheduledStart: job.scheduledStart,
    at: new Date().toISOString()
  };
  spool.reservations = [...(spool.reservations || []), reservation];
  normalizeSpoolReservations(spool);
  spool.updatedAt = reservation.at;
  job.reservedSpoolId = spool.id;
  job.reservedGrams = grams;
  job.materialReservation = { ...reservation, spoolId: spool.id, spoolLocation: spool.location, status: "reserved" };
  return job.materialReservation;
}

function consumeJobMaterialReservation(data, job) {
  if (!job?.reservedSpoolId) return null;
  const spool = data.spools?.find((item) => item.id === job.reservedSpoolId);
  const grams = Math.max(1, Math.round(Number(job.reservedGrams || 0) || jobEstimateGrams(data, job)));
  const consumedAt = new Date().toISOString();
  const consumed = { spoolId: job.reservedSpoolId, grams, material: job.material, consumedAt };
  if (spool) {
    spool.remaining = Math.max(0, Number(spool.remaining || 0) - grams);
    spool.reservations = (spool.reservations || []).filter((item) => item.jobId !== job.id);
    normalizeSpoolReservations(spool);
    spool.updatedAt = consumedAt;
    consumed.remaining = spool.remaining;
    consumed.spoolLocation = spool.location;
  }
  delete job.reservedSpoolId;
  delete job.reservedGrams;
  job.materialReservation = { ...(job.materialReservation || {}), ...consumed, status: "consumed" };
  return consumed;
}

export function getScheduleWarnings(data, job, printer, scheduledStart = job.scheduledStart) {
  const warnings = [];
  if (!printer) return ["Printer missing"];
  if (printer.status === "offline") warnings.push("Printer offline");
  if (printer.status === "error") warnings.push("Printer error");
  if (printer.status === "maintenance") warnings.push("In maintenance");
  if ((printer.status === "printing" || printer.status === "paused") && job.status === "queued") warnings.push("Printer busy");
  if (hasMaterialConflict(job, printer)) warnings.push("Material conflict");
  if (!hasMaterialCoverage(data, job)) warnings.push("Insufficient material");
  if (exceedsVolume(job.dimensions, printer.buildVolume)) warnings.push("Size mismatch");
  if (isDueRisk(job)) warnings.push("Due date risk");
  const overlap = scheduledStart
    ? data.queue.find((item) => item.id !== job.id && item.printerId === printer.id && item.scheduledStart === scheduledStart && item.status !== "complete" && item.status !== "cancelled")
    : null;
  if (overlap) warnings.push(`Slot overlap with ${overlap.file}`);
  return warnings;
}

function seedLaneAvailability(data, startMinute, ignoredJobIds = new Set()) {
  const lanes = Object.fromEntries(data.printers.map((printer) => [printer.id, startMinute]));
  for (const printer of data.printers) {
    if (printer.status === "printing" || printer.status === "paused") lanes[printer.id] += 45;
  }
  for (const job of data.queue) {
    if (ignoredJobIds.has(job.id)) continue;
    if (!job.scheduledStart || job.status === "complete" || job.status === "cancelled") continue;
    const match = String(job.scheduledStart).match(/(?:(\+(\d+)d)\s*)?(\d{1,2}):(\d{2})/);
    if (!match) continue;
    const start = Number(match[2] || 0) * 1440 + Number(match[3]) * 60 + Number(match[4]);
    lanes[job.printerId] = Math.max(lanes[job.printerId] || startMinute, start + parseDurationMinutes(job.time));
  }
  return lanes;
}

function filamentChangeCost(job, printer) {
  const filament = String(printer.filament || "").toLowerCase();
  const material = String(job.material || "").toLowerCase();
  const color = String(job.color || "").toLowerCase();
  const materialCost = material && filament.includes(material) ? 0 : 45;
  const colorCost = color && color !== "any" && filament.includes(color) ? 0 : color && color !== "any" ? 15 : 0;
  return materialCost + colorCost;
}

function scorePrinterForJob(data, job, printer, laneAvailability, options) {
  const materialConflict = hasMaterialConflict(job, printer);
  const sizeMismatch = exceedsVolume(job.dimensions, printer.buildVolume);
  const unavailable = ["offline", "error", "maintenance"].includes(printer.status);
  const busy = printer.status === "printing" || printer.status === "paused";
  let score = laneAvailability[printer.id] || options.startMinute;
  if (unavailable) score += 8000;
  if (!options.includeBusyPrinters && busy) score += 5000;
  if (busy) score += 180;
  if (options.respectMaterial && materialConflict) score += 3500;
  if (options.respectBuildVolume && sizeMismatch) score += 6000;
  score += filamentChangeCost(job, printer);
  score += Number(printer.utilization || 0);
  if (isDueRisk(job)) score -= 80;
  const warnings = getScheduleWarnings(data, job, printer, formatScheduleMinute(laneAvailability[printer.id] || options.startMinute));
  return {
    printer,
    score,
    warnings,
    changeCost: filamentChangeCost(job, printer),
    startMinute: laneAvailability[printer.id] || options.startMinute
  };
}

function compareJobsForStrategy(strategy) {
  return (a, b) => {
    if (strategy === "material-color") {
      return String(a.material).localeCompare(String(b.material))
        || String(a.color).localeCompare(String(b.color))
        || priorityWeight(a.priority) - priorityWeight(b.priority)
        || parseDueRank(a) - parseDueRank(b);
    }
    if (strategy === "load-balance") {
      return priorityWeight(a.priority) - priorityWeight(b.priority)
        || parseDueRank(a) - parseDueRank(b)
        || parseDurationMinutes(b.time) - parseDurationMinutes(a.time);
    }
    return priorityWeight(a.priority) - priorityWeight(b.priority)
      || parseDueRank(a) - parseDueRank(b)
      || String(a.material).localeCompare(String(b.material))
      || String(a.color).localeCompare(String(b.color));
  };
}

function optimizeScoreForStrategy(strategy, baseScore, job, printer, laneAvailability, options) {
  if (strategy === "material-color") {
    return baseScore
      + filamentChangeCost(job, printer) * 3
      + (String(printer.filament || "").toLowerCase().includes(String(job.material || "").toLowerCase()) ? -60 : 0)
      + (String(job.color || "").toLowerCase() !== "any" && String(printer.filament || "").toLowerCase().includes(String(job.color || "").toLowerCase()) ? -30 : 0);
  }
  if (strategy === "load-balance") {
    const laneTimes = Object.values(laneAvailability).map((value) => Number(value || options.startMinute));
    const average = laneTimes.reduce((sum, value) => sum + value, 0) / Math.max(1, laneTimes.length);
    return baseScore + Math.max(0, Number(laneAvailability[printer.id] || options.startMinute) - average) * 4 - Number(printer.utilization || 0);
  }
  return baseScore;
}

export function optimizeScheduleQueue(data, options = {}) {
  const normalized = optimizeScheduleSchema.parse(options);
  const candidates = data.queue
    .filter((job) => job.status === "queued" && job.stage !== "needs slicing")
    .sort(compareJobsForStrategy(normalized.strategy));
  const laneAvailability = seedLaneAvailability(data, normalized.startMinute, new Set(candidates.map((job) => job.id)));
  const scheduled = [];
  const skipped = [];
  for (const job of candidates) {
    const ranked = data.printers
      .map((printer) => {
        const base = scorePrinterForJob(data, job, printer, laneAvailability, normalized);
        return { ...base, score: optimizeScoreForStrategy(normalized.strategy, base.score, job, printer, laneAvailability, normalized) };
      })
      .sort((a, b) => a.score - b.score);
    const selected = ranked[0];
    if (!selected) {
      skipped.push({ jobId: job.id, file: job.file, reason: "No printers available" });
      continue;
    }
    const scheduledStart = formatScheduleMinute(selected.startMinute);
    job.printerId = selected.printer.id;
    job.printer = selected.printer.name;
    job.scheduledStart = scheduledStart;
    job.stage = "scheduled";
    job.optimizationStrategy = normalized.strategy;
    const materialReservation = reserveJobMaterial(data, job);
    job.scheduleWarnings = getScheduleWarnings(data, job, selected.printer, scheduledStart);
    laneAvailability[selected.printer.id] = selected.startMinute + parseDurationMinutes(job.time);
    scheduled.push({
      jobId: job.id,
      file: job.file,
      printerId: selected.printer.id,
      printer: selected.printer.name,
      material: job.material,
      color: job.color,
      strategy: normalized.strategy,
      scheduledStart,
      durationMinutes: parseDurationMinutes(job.time),
      changeCost: selected.changeCost,
      materialReservation,
      score: Math.round(selected.score),
      warnings: job.scheduleWarnings,
      alternatives: ranked.slice(0, 3).map((item) => ({
        printerId: item.printer.id,
        printer: item.printer.name,
        score: Math.round(item.score),
        warnings: item.warnings
      }))
    });
  }
  return { strategy: normalized.strategy, scheduled, skipped, jobs: scheduled.map((item) => data.queue.find((job) => job.id === item.jobId)).filter(Boolean), spools: data.spools || [], diagnostics: buildScheduleDiagnostics(data), todos: deriveTodos(data) };
}

function isSolverHardBlocked(options, warnings) {
  if (warnings.includes("Printer offline") || warnings.includes("Printer error") || warnings.includes("In maintenance")) return true;
  if (!options.includeBusyPrinters && warnings.includes("Printer busy")) return true;
  if (options.respectMaterial && warnings.includes("Material conflict")) return true;
  if (options.respectBuildVolume && warnings.includes("Size mismatch")) return true;
  return false;
}

export function constraintScheduleQueue(data, options = {}) {
  const normalized = constraintScheduleSchema.parse(options);
  const candidates = data.queue
    .filter((job) => job.status === "queued" && job.stage !== "needs slicing")
    .sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority) || parseDueRank(a) - parseDueRank(b))
    .slice(0, normalized.maxJobs);
  const maxLimited = data.queue.filter((job) => job.status === "queued" && job.stage !== "needs slicing").length - candidates.length;
  const laneAvailability = seedLaneAvailability(data, normalized.startMinute, new Set(candidates.map((job) => job.id)));
  const solved = solveScheduleAssignments({
    jobs: candidates,
    printers: data.printers,
    options: normalized,
    durationOf: (job) => parseDurationMinutes(job.time),
    dueRankOf: parseDueRank,
    priorityRankOf: (job) => priorityWeight(job.priority),
    isDueRisk,
    isHardBlocked: (_job, _printer, warnings) => isSolverHardBlocked(normalized, warnings),
    scoreCandidate: (job, printer) => scorePrinterForJob(data, job, printer, laneAvailability, normalized)
  });

  const assignments = [...solved.assignments].sort((a, b) => String(a.printer.id).localeCompare(String(b.printer.id)) || a.slot - b.slot || priorityWeight(a.job.priority) - priorityWeight(b.job.priority) || parseDueRank(a.job) - parseDueRank(b.job));
  const scheduled = [];
  for (const assignment of assignments) {
    const job = data.queue.find((item) => item.id === assignment.job.id);
    const printer = data.printers.find((item) => item.id === assignment.printer.id);
    if (!job || !printer) continue;
    const startMinute = laneAvailability[printer.id] || normalized.startMinute;
    const scheduledStart = formatScheduleMinute(startMinute);
    const warnings = getScheduleWarnings(data, job, printer, scheduledStart);
    laneAvailability[printer.id] = startMinute + parseDurationMinutes(job.time);
    if (!normalized.dryRun) {
      job.printerId = printer.id;
      job.printer = printer.name;
      job.scheduledStart = scheduledStart;
      job.stage = "scheduled";
      job.optimizationStrategy = `constraint-${normalized.objective}`;
      job.solverObjective = normalized.objective;
      job.solverSlot = assignment.slot;
      reserveJobMaterial(data, job);
      job.scheduleWarnings = warnings;
    }
    scheduled.push({
      jobId: job.id,
      file: job.file,
      printerId: printer.id,
      printer: printer.name,
      material: job.material,
      color: job.color,
      strategy: `constraint-${normalized.objective}`,
      objective: normalized.objective,
      scheduledStart,
      durationMinutes: parseDurationMinutes(job.time),
      changeCost: assignment.candidate.changeCost,
      materialReservation: job.materialReservation || null,
      slot: assignment.slot,
      score: Math.round(assignment.cost),
      warnings,
      alternatives: []
    });
  }

  const skipped = [...solved.skipped];
  if (maxLimited > 0) {
    skipped.push({ jobId: "max-jobs-limit", file: `${maxLimited} jobs not evaluated`, reason: `maxJobs limited this solver run to ${normalized.maxJobs} jobs` });
  }

  return {
    strategy: `constraint-${normalized.objective}`,
    dryRun: normalized.dryRun,
    solver: solved.solver,
    scheduled,
    skipped,
    jobs: normalized.dryRun ? [] : scheduled.map((item) => data.queue.find((job) => job.id === item.jobId)).filter(Boolean),
    spools: data.spools || [],
    diagnostics: buildScheduleDiagnostics(data),
    todos: deriveTodos(data)
  };
}

export function matchQueueNow(data, options = {}) {
  const normalized = queueMatchSchema.parse(options);
  const activeJobs = data.queue.filter((job) => job.status === "printing" || job.status === "paused");
  const openSlots = Math.max(0, normalized.maxActiveSlots - activeJobs.length);
  const availablePrinters = data.printers.filter((printer) => !["offline", "error", "maintenance", "printing", "paused"].includes(printer.status));
  const usedPrinters = new Set();
  const matches = [];
  const skipped = [];
  const candidates = data.queue
    .filter((job) => job.status === "queued" && ["scheduled", "needs scheduling"].includes(job.stage))
    .sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority) || parseDueRank(a) - parseDueRank(b) || String(a.scheduledStart || "").localeCompare(String(b.scheduledStart || "")));

  for (const job of candidates) {
    if (matches.length >= openSlots) {
      skipped.push({ jobId: job.id, file: job.file, reason: "Production slots full" });
      continue;
    }
    const ranked = availablePrinters
      .filter((printer) => !usedPrinters.has(printer.id))
      .map((printer) => {
        const warnings = getScheduleWarnings(data, job, printer, job.scheduledStart);
        const hardBlocked = normalized.respectMaterial && warnings.includes("Material conflict") || normalized.respectBuildVolume && warnings.includes("Size mismatch");
        let score = Number(printer.utilization || 0) + filamentChangeCost(job, printer) + (job.scheduledStart ? 0 : 45);
        if (isDueRisk(job)) score -= 60;
        if (warnings.includes("Printer busy")) score += 5000;
        if (warnings.includes("Printer offline") || warnings.includes("Printer error") || warnings.includes("In maintenance")) score += 8000;
        if (hardBlocked) score += 9000;
        return { printer, warnings, hardBlocked, score };
      })
      .sort((a, b) => a.score - b.score);
    const selected = ranked.find((item) => !item.hardBlocked);
    if (!selected) {
      skipped.push({ jobId: job.id, file: job.file, reason: ranked[0]?.warnings.join(", ") || "No compatible printer" });
      continue;
    }
    usedPrinters.add(selected.printer.id);
    matches.push({
      jobId: job.id,
      file: job.file,
      printerId: selected.printer.id,
      printer: selected.printer.name,
      scheduledStart: job.scheduledStart || "",
      priority: job.priority,
      material: job.material,
      warnings: selected.warnings,
      score: Math.round(selected.score)
    });
  }

  if (!normalized.dryRun) {
    const now = new Date().toISOString();
    for (const match of matches) {
      const job = data.queue.find((item) => item.id === match.jobId);
      const printer = data.printers.find((item) => item.id === match.printerId);
      if (!job || !printer) continue;
      job.printerId = printer.id;
      job.printer = printer.name;
      job.status = "printing";
      job.stage = "printing";
      job.startedAt = now;
      job.updatedAt = now;
      reserveJobMaterial(data, job);
      job.scheduleWarnings = match.warnings;
      printer.status = "printing";
      printer.job = job.file;
      printer.progress = Math.max(1, Number(printer.progress || 0));
      printer.queue = Math.max(0, Number(printer.queue || 0) - 1);
      printer.updatedAt = now;
    }
  }

  return {
    dryRun: normalized.dryRun,
    maxActiveSlots: normalized.maxActiveSlots,
    activeSlots: activeJobs.length,
    openSlots,
    matches,
    skipped,
    jobs: matches.map((match) => data.queue.find((job) => job.id === match.jobId)).filter(Boolean),
    printers: data.printers,
    spools: data.spools || [],
    todos: deriveTodos(data)
  };
}

export function autoScheduleQueue(data, options = {}) {
  const normalized = autoScheduleSchema.parse(options);
  const laneAvailability = seedLaneAvailability(data, normalized.startMinute);
  const candidates = data.queue
    .filter((job) => job.status === "queued" && job.stage === "needs scheduling")
    .sort((a, b) => priorityWeight(a.priority) - priorityWeight(b.priority) || parseDueRank(a) - parseDueRank(b) || String(a.material).localeCompare(String(b.material)) || String(a.color).localeCompare(String(b.color)));
  const scheduled = [];
  const skipped = [];
  for (const job of candidates) {
    const ranked = data.printers
      .map((printer) => scorePrinterForJob(data, job, printer, laneAvailability, normalized))
      .sort((a, b) => a.score - b.score);
    const selected = ranked[0];
    if (!selected) {
      skipped.push({ jobId: job.id, file: job.file, reason: "No printers available" });
      continue;
    }
    const scheduledStart = formatScheduleMinute(selected.startMinute);
    job.printerId = selected.printer.id;
    job.printer = selected.printer.name;
    job.scheduledStart = scheduledStart;
    job.stage = "scheduled";
    const materialReservation = reserveJobMaterial(data, job);
    job.scheduleWarnings = getScheduleWarnings(data, job, selected.printer, scheduledStart);
    laneAvailability[selected.printer.id] = selected.startMinute + parseDurationMinutes(job.time);
    scheduled.push({
      jobId: job.id,
      file: job.file,
      printerId: selected.printer.id,
      printer: selected.printer.name,
      scheduledStart,
      durationMinutes: parseDurationMinutes(job.time),
      changeCost: selected.changeCost,
      materialReservation,
      score: Math.round(selected.score),
      warnings: job.scheduleWarnings,
      alternatives: ranked.slice(0, 3).map((item) => ({
        printerId: item.printer.id,
        printer: item.printer.name,
        score: Math.round(item.score),
        warnings: item.warnings
      }))
    });
  }
  return { scheduled, skipped, jobs: scheduled.map((item) => data.queue.find((job) => job.id === item.jobId)).filter(Boolean), spools: data.spools || [], diagnostics: buildScheduleDiagnostics(data), todos: deriveTodos(data) };
}

export function buildScheduleDiagnostics(data) {
  return {
    generatedAt: new Date().toISOString(),
    pending: data.queue.filter((job) => job.stage === "needs slicing" || job.stage === "needs scheduling" || !job.scheduledStart).map((job) => ({
      jobId: job.id,
      file: job.file,
      stage: job.stage,
      due: job.due,
      printerMatches: data.printers.map((printer) => ({
        printerId: printer.id,
        printer: printer.name,
        warnings: getScheduleWarnings(data, job, printer)
      }))
    })),
    lanes: data.printers.map((printer) => ({
      printerId: printer.id,
      printer: printer.name,
      status: printer.status,
      jobs: data.queue.filter((job) => job.printerId === printer.id && (job.scheduledStart || job.status === "printing" || job.status === "paused")).map((job) => ({
        jobId: job.id,
        file: job.file,
        scheduledStart: job.scheduledStart,
        warnings: getScheduleWarnings(data, job, printer)
      }))
    }))
  };
}

function groupCount(items, keyFn) {
  return items.reduce((counts, item) => {
    const key = keyFn(item) || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function dayLabel(value = "") {
  const text = String(value || "");
  if (text.includes("Today")) return "Today";
  if (text.includes("Tomorrow")) return "Tomorrow";
  const iso = text.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso.slice(5);
  return text.split(/\s+/)[0] || "Backlog";
}

function materialWasteCost(data, material, grams) {
  const catalog = costCatalogSchema.parse({ ...defaultCostCatalog, ...(data.costCatalog || {}) });
  const materialRate = catalog.materialRates[material] ?? catalog.materialRates[Object.keys(catalog.materialRates).find((key) => String(material || "").toLowerCase().includes(key.toLowerCase())) || "PLA"] ?? 1;
  return Math.round(Number(grams || 0) / 100 * materialRate * 100) / 100;
}

function failureAnalytics(data) {
  const queue = data.queue || [];
  const printers = data.printers || [];
  const failedJobs = queue.filter((job) => job.status === "failed" || job.status === "cancelled" || Number(job.wasteGrams || 0) > 0 || job.failureReason || job.failureCategory);
  const wasteGrams = Math.round(failedJobs.reduce((sum, job) => sum + Number(job.wasteGrams || 0), 0));
  const wasteCost = Math.round(failedJobs.reduce((sum, job) => sum + Number(job.wasteCost ?? materialWasteCost(data, job.material, job.wasteGrams || 0)), 0) * 100) / 100;
  const rootCauseRows = Object.entries(groupCount(failedJobs, (job) => job.rootCause || job.failureReason || "Unclassified"))
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8);
  return {
    wasteGrams,
    wasteCost,
    failureCategories: groupCount(failedJobs, (job) => job.failureCategory || job.issueTag || (job.status === "cancelled" ? "Cancelled" : "Print failure")),
    rootCauses: rootCauseRows,
    printerReliability: printers.map((printer) => {
      const jobs = queue.filter((job) => job.printerId === printer.id || job.printer === printer.name);
      const finished = jobs.filter((job) => ["complete", "failed", "cancelled"].includes(job.status));
      const failed = jobs.filter((job) => job.status === "failed" || job.status === "cancelled");
      const printerWasteGrams = Math.round(jobs.reduce((sum, job) => sum + Number(job.wasteGrams || 0), 0));
      return {
        printerId: printer.id,
        printer: printer.name,
        finished: finished.length,
        failed: failed.length,
        successRate: finished.length ? Math.round((finished.length - failed.length) / finished.length * 100) : 100,
        wasteGrams: printerWasteGrams,
        wasteCost: Math.round(jobs.reduce((sum, job) => sum + Number(job.wasteCost ?? materialWasteCost(data, job.material, job.wasteGrams || 0)), 0) * 100) / 100
      };
    })
  };
}

export function buildAnalytics(data) {
  const queue = data.queue || [];
  const printers = data.printers || [];
  const finished = queue.filter((job) => ["complete", "failed", "cancelled"].includes(job.status));
  const completed = queue.filter((job) => job.status === "complete");
  const failed = queue.filter((job) => job.status === "failed" || job.status === "cancelled");
  const totalDuration = queue.reduce((sum, job) => sum + parseDurationMinutes(job.time), 0);
  const dayBuckets = groupCount(queue, (job) => dayLabel(job.completedAt || job.updatedAt || job.added || job.due));
  const daily = Object.entries(dayBuckets).slice(0, 10).map(([day, jobs]) => {
    const jobsForDay = queue.filter((job) => dayLabel(job.completedAt || job.updatedAt || job.added || job.due) === day);
    const done = jobsForDay.filter((job) => job.status === "complete").length;
    const bad = jobsForDay.filter((job) => job.status === "failed" || job.status === "cancelled").length;
    const finishedForDay = done + bad;
    return {
      day,
      jobs,
      hours: Math.round(jobsForDay.reduce((sum, job) => sum + parseDurationMinutes(job.time), 0) / 60),
      success: finishedForDay ? Math.round(done / finishedForDay * 100) : 100
    };
  });
  const utilization = printers.length
    ? Math.round(printers.reduce((sum, printer) => sum + Number(printer.utilization ?? (printer.status === "printing" ? 80 : printer.status === "idle" ? 20 : 45)), 0) / printers.length)
    : 0;
  return {
    jobs: queue.length,
    active: queue.filter((job) => job.status === "printing" || job.status === "paused").length,
    queued: queue.filter((job) => job.status === "queued").length,
    completed: completed.length,
    failed: failed.length,
    successRate: finished.length ? Math.round(completed.length / finished.length * 100) : 100,
    utilization,
    cost: queue.reduce((sum, job) => sum + Number(job.cost || 0), 0),
    printHours: Math.round(totalDuration / 60),
    materialMix: groupCount(queue, (job) => job.material),
    ...failureAnalytics(data),
    printerLoad: printers.map((printer) => ({
      printerId: printer.id,
      printer: printer.name,
      status: printer.status,
      utilization: Number(printer.utilization || 0),
      queued: queue.filter((job) => job.printerId === printer.id && job.status === "queued").length,
      active: queue.filter((job) => job.printerId === printer.id && ["printing", "paused"].includes(job.status)).length
    })),
    daily
  };
}

const onboardingTemplates = [
  { id: "workspace", title: "Workspace identity", description: "Organization name, default location, timezone, and currency are configured." },
  { id: "team", title: "Team access", description: "At least one additional team member or API automation identity is configured." },
  { id: "security", title: "Security posture", description: "Admin 2FA policy, audit retention, and optional API IP restrictions are reviewed." },
  { id: "printers", title: "Printer fleet", description: "At least one printer exists and can be used by the scheduler." },
  { id: "materials", title: "Material inventory", description: "At least one spool is registered for material planning." },
  { id: "files", title: "File library", description: "A model or G-code file exists in the workspace library." },
  { id: "production", title: "Production queue", description: "At least one queue job exists for schedule and workflow validation." },
  { id: "automation", title: "Automation channels", description: "API keys, webhooks, notifications, or printer bridges are configured." },
  { id: "backup", title: "Backup drill", description: "A workspace export or restore drill has been performed." },
  { id: "support", title: "Support handoff", description: "A redacted support snapshot can be generated for 3DSTU support." }
];

function buildOnboarding(data) {
  const settings = data.workspaceSettings || {};
  const manual = settings.onboarding || {};
  const checks = {
    workspace: Boolean(settings.organizationName && settings.defaultLocation && settings.timezone && settings.currency),
    team: (data.users || []).length > 1 || (data.apiKeys || []).length > 0,
    security: settings.requireAdmin2fa === true && settings.auditLogRetention !== false,
    printers: (data.printers || []).length > 0,
    materials: (data.spools || []).length > 0,
    files: (data.files || []).length > 0,
    production: (data.queue || []).length > 0,
    automation: Boolean((data.apiKeys || []).length || (data.webhooks || []).length || (data.notificationChannels || []).length || (data.bridges || []).length),
    backup: Boolean((data.events || []).some((event) => ["admin.export", "admin.restore"].includes(event.type)) || manual.backup?.status === "complete"),
    support: Boolean(manual.support?.status === "complete")
  };
  const steps = onboardingTemplates.map((template) => {
    const saved = manual[template.id] || {};
    const autoComplete = checks[template.id] === true;
    const status = saved.status === "skipped" ? "skipped" : autoComplete ? "complete" : saved.status || "pending";
    return {
      ...template,
      status,
      autoComplete,
      note: saved.note || "",
      updatedAt: saved.updatedAt || "",
      updatedBy: saved.updatedBy || ""
    };
  });
  const complete = steps.filter((step) => step.status === "complete" || step.status === "skipped").length;
  return {
    generatedAt: new Date().toISOString(),
    workspace: {
      id: settings.workspaceId || DEFAULT_WORKSPACE_ID,
      name: settings.organizationName || "Workspace",
      plan: settings.plan || "Print Farm Trial"
    },
    progress: {
      complete,
      total: steps.length,
      percent: Math.round(complete / Math.max(1, steps.length) * 100)
    },
    steps
  };
}

function redactSupportValue(value, key = "") {
  if (/count$/i.test(key) || /^apiKeys$/i.test(key)) return value;
  if (/password|secret|token|authorization|stripe|hash/i.test(key) || /^apiKey$/i.test(key)) return "REDACTED";
  if (Array.isArray(value)) return value.map((item) => redactSupportValue(item, key));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactSupportValue(entryValue, entryKey)]));
  if (typeof value === "string" && /(^|[._-])(url|uri|endpoint|baseUrl|publicUrl|callbackUrl|feedUrl)$/i.test(key) && /^https?:\/\//i.test(value.trim())) return redactEndpointUrl(value);
  return value;
}

async function buildSupportSnapshot(data, user) {
  const scoped = workspaceScopeForUser(data, user);
  const onboarding = buildOnboarding(scoped);
  const integrity = await buildDataIntegrityReport(scoped);
  return redactSupportValue({
    service: "3DSTU FarmFlow",
    generatedAt: new Date().toISOString(),
    generatedBy: user.email,
    workspace: onboarding.workspace,
    version: process.env.npm_package_version || "",
    schemaVersion: data.dataMeta?.schemaVersion || 0,
    counts: {
      printers: scoped.printers.length,
      users: scoped.users.length,
      files: scoped.files.length,
      queue: scoped.queue.length,
      spools: scoped.spools.length,
      purchaseRequests: scoped.purchaseRequests.length,
      productionTemplates: scoped.productionTemplates.length,
      quoteRequests: scoped.quoteRequests.length,
      orders: scoped.orders.length,
      webhooks: scoped.webhooks.length,
      apiKeys: scoped.apiKeys.length
    },
    readiness: {
      onboarding: onboarding.progress,
      integrityWarnings: integrity.warnings.length,
      storageLimitGb: scoped.workspaceSettings?.storageLimitGb || 0
    },
    analytics: buildAnalytics(scoped),
    onboarding,
    recentEvents: (scoped.events || []).slice(0, 20).map((event) => ({ type: event.type, message: event.message, at: event.at, data: event.data || {} })),
    settings: scoped.workspaceSettings
  });
}

export function buildPrintHistory(data) {
  return (data.queue || [])
    .filter((job) => ["complete", "failed", "cancelled"].includes(job.status) || job.completedAt || job.stage === "post processing")
    .map((job) => ({
      id: job.id,
      fileId: job.fileId,
      file: job.file,
      printerId: job.printerId,
      printer: job.printer,
      status: job.status,
      duration: job.time,
      material: job.material,
      cost: Number(job.cost || 0),
      date: job.completedAt || job.updatedAt || job.added || job.due,
      note: job.failureReason || job.note || (job.status === "complete" ? "Completed" : job.status === "failed" ? "Needs review" : "Archived job"),
      issueTag: job.issueTag || "",
      issueSeverity: job.issueSeverity || "",
      flaggedAt: job.flaggedAt || "",
      failureReason: job.failureReason || "",
      failureCategory: job.failureCategory || "",
      rootCause: job.rootCause || "",
      correctiveAction: job.correctiveAction || "",
      wasteGrams: Number(job.wasteGrams || 0),
      wasteCost: Number(job.wasteCost ?? materialWasteCost(data, job.material, job.wasteGrams || 0)),
      wasteSpoolId: job.wasteSpoolId || "",
      wasteInventoryDeductedAt: job.wasteInventoryDeductedAt || "",
      sourceOrderId: job.sourceOrderId || ""
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function createReprintJob(data, sourceJob, options) {
  const workspaceId = sourceJob.workspaceId || DEFAULT_WORKSPACE_ID;
  const workspaceData = scopedWorkspaceData(data, workspaceId);
  const printer = options.printerId
    ? data.printers.find((item) => item.id === options.printerId && itemInWorkspace(item, workspaceId))
    : workspaceData.printers.find((item) => item.status === "idle") || workspaceData.printers.find((item) => !["offline", "maintenance"].includes(item.status)) || workspaceData.printers[0];
  if (!printer) return { error: "Printer not found", statusCode: 404 };
  const job = {
    ...sourceJob,
    id: randomUUID(),
    workspaceId,
    printerId: printer.id,
    printer: printer.name,
    status: "queued",
    priority: options.priority,
    stage: sourceJob.stage === "needs slicing" ? "needs slicing" : "needs scheduling",
    due: options.due,
    scheduledStart: undefined,
    scheduleWarnings: [],
    completedAt: undefined,
    failureReason: undefined,
    failureCategory: undefined,
    rootCause: undefined,
    correctiveAction: undefined,
    wasteGrams: undefined,
    wasteCost: undefined,
    wasteSpoolId: undefined,
    wasteInventoryDeductedAt: undefined,
    wasteInventoryDeductedGrams: undefined,
    added: `Reprint from ${sourceJob.id}`,
    sourceJobId: sourceJob.id,
    updatedAt: new Date().toISOString()
  };
  job.scheduleWarnings = getScheduleWarnings(workspaceData, job, printer);
  data.queue.push(job);
  return { job };
}

async function parsePublicQuoteRequestPayload(request) {
  if (!request.isMultipart?.()) return { payload: request.body || {}, upload: null };
  const part = await request.file();
  if (!part) return { payload: {}, upload: null };
  const fieldValue = (name, fallback = "") => {
    const raw = part.fields?.[name]?.value;
    return typeof raw === "string" ? raw : fallback;
  };
  const filename = path.basename(part.filename || fieldValue("fileName", "model.stl"));
  const buffer = await part.toBuffer();
  return {
    payload: {
      customer: fieldValue("customer"),
      email: fieldValue("email"),
      company: fieldValue("company"),
      project: fieldValue("project"),
      material: fieldValue("material", "PLA"),
      quantity: Number(fieldValue("quantity", "1")),
      due: fieldValue("due", "Flexible"),
      budget: Number(fieldValue("budget", "0")),
      notes: fieldValue("notes"),
      fileName: fieldValue("fileName", filename),
      source: fieldValue("source", "Website")
    },
    upload: buffer.length ? { filename, buffer } : null
  };
}

function publicQuoteIntakeDigest(incoming = {}) {
  const upload = incoming.upload
    ? {
      filename: incoming.upload.filename || "",
      bytes: Buffer.byteLength(incoming.upload.buffer || Buffer.alloc(0)),
      sha256: createHash("sha256").update(incoming.upload.buffer || Buffer.alloc(0)).digest("hex")
    }
    : null;
  return sha256(stableSerialize({ payload: incoming.payload || {}, upload }));
}

export async function openDatabase(file = process.env.LAYERPILOT_DB_PATH || path.join(process.cwd(), "api", "data", "layerpilot.db.json"), options = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  const adapter = createPersistenceAdapter(file, options);
  const db = new Low(adapter, structuredClone(seedData));
  db.persistenceLabel = adapter.persistenceLabel || "lowdb-json";
  db.close = async () => adapter.close?.();
  await db.read();
  db.data ||= structuredClone(seedData);
  const beforeMigration = structuredClone(db.data);
  const migration = applyDataMigrations(db.data);
  const backupPath = await writePreMigrationBackup(file, beforeMigration, migration);
  if (backupPath) {
    db.data.dataMeta.lastPreMigrationBackup = backupPath;
    db.data.events.unshift({
      id: randomUUID(),
      type: "system.pre_migration_backup",
      message: "Pre-migration database backup created",
      data: { backupPath, fromVersion: migration.fromVersion, toVersion: migration.toVersion },
      at: new Date().toISOString()
    });
  }
  await ensureAuthData(db);
  await db.write();
  return db;
}

export function deriveTodos(data) {
  const todos = [];
  for (const job of data.queue) {
    const printer = data.printers.find((item) => item.id === job.printerId);
    if (job.stage === "needs slicing") {
      todos.push({ id: `${job.id}-slice`, title: `Slice ${job.file}`, owner: job.assignee || "Slicer", source: job.file, kind: "slicing", severity: "Medium", due: job.due });
    }
    if (job.stage === "needs scheduling") {
      todos.push({ id: `${job.id}-schedule`, title: `Schedule ${job.file}`, owner: "Scheduler", source: job.file, kind: "scheduling", severity: job.priority === "Rush" ? "High" : "Medium", due: job.due });
    }
    if (printer && job.material !== "Auto matched" && !printer.compatibleMaterials.includes(job.material)) {
      todos.push({ id: `${job.id}-material`, title: `Change material on ${printer.name}`, owner: "Operator", source: job.file, kind: "material", severity: "High", due: job.due });
    }
    if (printer && exceedsVolume(job.dimensions, printer.buildVolume)) {
      todos.push({ id: `${job.id}-size`, title: `Move ${job.file} to a larger printer`, owner: "Scheduler", source: job.file, kind: "size", severity: "High", due: job.due });
    }
    if (job.stage === "post processing" || job.status === "complete") {
      todos.push({ id: `${job.id}-post`, title: `Pickup / post-process ${job.file}`, owner: job.assignee || "Operator", source: job.file, kind: "post", severity: "Low", due: job.due });
    }
    if (job.stage === "blocked" || job.status === "failed" || isDueRisk(job) || printer && ["offline", "error", "maintenance"].includes(printer.status) && ["scheduled", "printing"].includes(job.stage)) {
      todos.push({ id: `${job.id}-exception`, title: `Resolve exception: ${job.file}`, owner: "Lead", source: job.file, kind: "exception", severity: "Urgent", due: job.due });
    }
  }
  return applyTodoActions(todos, data.todoActions || []);
}

function applyTodoActions(todos, actions) {
  const latest = new Map();
  for (const action of [...actions].sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")))) {
    latest.set(action.todoId, action);
  }
  return todos
    .map((todo) => {
      const action = latest.get(todo.id);
      if (!action) return { ...todo, status: "open" };
      if (action.action === "complete") return null;
      if (action.action === "claim") return { ...todo, owner: action.owner || action.createdBy || todo.owner, status: "claimed", actionNote: action.note || "", claimedBy: action.owner || action.createdBy || "" };
      if (action.action === "snooze") return { ...todo, status: "snoozed", due: action.snoozeUntil || todo.due, actionNote: action.note || "", snoozeUntil: action.snoozeUntil || "" };
      return { ...todo, status: "open", actionNote: action.note || "" };
    })
    .filter(Boolean);
}

export async function runTelemetryTick(database, options = {}) {
  const increment = Number(options.increment ?? 2);
  const scopeWorkspaceId = options.workspaceId || "";
  const changedPrinters = [];
  const completedJobs = [];
  const now = new Date().toISOString();
  for (const printer of database.data.printers.filter((item) => !scopeWorkspaceId || itemInWorkspace(item, scopeWorkspaceId))) {
    if (printer.status !== "printing") continue;
    const workspaceId = printer.workspaceId || DEFAULT_WORKSPACE_ID;
    const previous = Number(printer.progress || 0);
    printer.progress = Math.min(100, previous + increment);
    if (printer.targetNozzle) printer.nozzle = Math.round(Number(printer.targetNozzle) - 4 + Math.random() * 6);
    if (printer.targetBed) printer.bed = Math.round(Number(printer.targetBed) - 2 + Math.random() * 4);
    changedPrinters.push(printer.id);
    const activeJob = database.data.queue.find((job) => job.printerId === printer.id && itemInWorkspace(job, workspaceId) && (job.status === "printing" || job.stage === "printing"));
    if (activeJob) {
      activeJob.status = "printing";
      activeJob.stage = "printing";
    }
    if (printer.progress >= 100) {
      printer.status = "idle";
      printer.progress = 0;
      const finishedJob = activeJob || database.data.queue.find((job) => job.printerId === printer.id && itemInWorkspace(job, workspaceId) && job.status === "printing");
      if (finishedJob) {
        finishedJob.status = "complete";
        finishedJob.stage = "post processing";
        finishedJob.completedAt = now;
        completedJobs.push(finishedJob);
        await dispatchEvent(database, "print.completed", `${finishedJob.file} completed on ${printer.name}`, { workspaceId, printerId: printer.id, jobId: finishedJob.id });
      }
      printer.job = undefined;
    }
  }
  const stateData = scopeWorkspaceId ? scopedWorkspaceData(database.data, scopeWorkspaceId) : database.data;
  if (!changedPrinters.length && !completedJobs.length) return { changed: false, printers: [], completedJobs: [], todos: deriveTodos(stateData) };
  await database.write();
  const payload = { reason: completedJobs.length ? "telemetry.completed" : "telemetry.progress", state: realtimeState(stateData), changedPrinters, completedJobs };
  broadcastRealtime(database, "state", payload);
  return { changed: true, changedPrinters, completedJobs, todos: deriveTodos(stateData) };
}

export async function buildServer({ db, enableTelemetry = false, telemetryIntervalMs = 5000, enableBridgePolling = false, bridgePollingIntervalMs = 10000, serveStatic = process.env.LAYERPILOT_SERVE_STATIC === "true", authRateLimit = defaultAuthRateLimit, sensitiveRateLimit = defaultSensitiveRateLimit, mqttPublisher = null, stripeClient = createStripeClient(), objectStorageAdapter = createObjectStorage() } = {}) {
  const database = db || await openDatabase();
  activeObjectStorage = objectStorageAdapter;
  database.realtimeClients ||= new Set();
  database.mqttPublisher = mqttPublisher;
  const startedAt = new Date();
  const app = Fastify({ logger: false });
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    request.rawBody = body;
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body));
    } catch (error) {
      error.statusCode = 400;
      done(error, undefined);
    }
  });
  await app.register(cors, { origin: true });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        workerSrc: ["'self'"]
      }
    },
    frameguard: { action: "deny" },
    crossOriginEmbedderPolicy: false
  });
  await app.register(rateLimit, {
    global: false,
    max: 1000,
    timeWindow: "1 minute",
    hook: "preHandler"
  });
  await app.register(websocket);
  await app.register(multipart, { limits: { fileSize: 200 * 1024 * 1024, files: 1 } });
  if (serveStatic) {
    await app.register(fastifyStatic, {
      root: path.join(process.cwd(), "dist"),
      prefix: "/",
      wildcard: false
    });
  }
  const telemetryTimer = enableTelemetry
    ? setInterval(() => {
      runTelemetryTick(database).catch(() => undefined);
    }, telemetryIntervalMs)
    : null;
  const bridgePollingTimer = enableBridgePolling
    ? setInterval(() => {
      runBridgePollingTick(database).catch(() => undefined);
    }, bridgePollingIntervalMs)
    : null;
  if (telemetryTimer?.unref) telemetryTimer.unref();
  if (bridgePollingTimer?.unref) bridgePollingTimer.unref();
  app.addHook("onClose", async () => {
    if (telemetryTimer) clearInterval(telemetryTimer);
    if (bridgePollingTimer) clearInterval(bridgePollingTimer);
    for (const client of [...(database.realtimeClients || [])]) closeRealtimeClient(database, client);
    database.realtimeClients?.clear();
    await database.close?.();
  });

  app.addHook("preHandler", async (request, reply) => {
    const routePath = request.url.split("?")[0];
    const publicRoute = routePath === "/api/health" || routePath === "/api/readiness" || routePath === "/api/metrics" && hasValidMetricsToken(request) || routePath === "/api/internal/worker-broadcast" && hasValidWorkerToken(request) || routePath === "/api/billing/webhook/stripe" || routePath === "/api/public/quoteRequests" || routePath.startsWith("/api/public/quoteRequests/") || routePath.startsWith("/api/auth/") || serveStatic && !routePath.startsWith("/api/");
    if (publicRoute) return;
    if (await replayCommittedRestoreRequest(database, request, reply)) return;
    const { session, user, apiKey } = userFromRequest(database, request);
    if (!user) return reply.code(401).send({ error: "Authentication required" });
    if (apiKey && !isApiKeyIpAllowed(workspaceScopeForUser(database.data, user).workspaceSettings, request)) {
      return reply.code(403).send({ error: "API key is not allowed from this IP", ip: normalizeClientIp(request.ip) });
    }
    request.user = user;
    request.apiKey = apiKey || null;
    if (!apiKey && requiresProductionAdminTwoFactor(database.data, user, request.method, routePath)) {
      return reply.code(403).send({
        error: "Two-factor enrollment required",
        requiresTwoFactorEnrollment: true,
        remediation: "Enroll TOTP two-factor authentication before accessing production admin APIs."
      });
    }
    if (apiKey && !apiKeyCanReadRoute(user, request.method, routePath)) {
      return reply.code(403).send({ error: "API key scope does not allow reading this resource" });
    }
    const workspaceId = user.workspaceId || DEFAULT_WORKSPACE_ID;
    const actorId = idempotencyActorForRequest(request);
    if (!apiKey && await prepareRestoreCommitIdempotentRequest(database, request, reply, { workspaceId, actorId })) return;
    const uploadMultipartRoute = String(request.method || "").toUpperCase() === "POST" && routePath === "/api/files/upload";
    if (!uploadMultipartRoute && await prepareIdempotentRequest(database, request, reply, { workspaceId, actorId })) return;
    const now = new Date().toISOString();
    if (session) session.lastSeenAt = now;
    if (apiKey) apiKey.lastUsedAt = now;
    if (database.data.__sessionStoreDirty || apiKey) {
      await database.write();
      clearSessionStoreDirty(database.data);
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    const context = request.idempotency;
    if (!context || reply.statusCode < 200 || reply.statusCode >= 400) return payload;
    const responseBody = Buffer.isBuffer(payload) ? payload.toString("utf8") : String(payload || "");
    if (Buffer.byteLength(responseBody) > IDEMPOTENCY_MAX_RESPONSE_BYTES) return payload;
    const ledger = pruneIdempotencyLedger(database.data);
    if (ledger.some((record) => record.workspaceId === context.workspaceId && record.actorId === context.actorId && record.key === context.key)) return payload;
    const now = new Date().toISOString();
    ledger.unshift({
      id: randomUUID(),
      key: context.key,
      method: context.method,
      path: context.path,
      workspaceId: context.workspaceId,
      actorId: context.actorId,
      bodyDigest: context.bodyDigest,
      fingerprint: context.fingerprint,
      statusCode: reply.statusCode,
      contentType: String(reply.getHeader("content-type") || "application/json; charset=utf-8"),
      responseBody,
      responseBytes: Buffer.byteLength(responseBody),
      replayCount: 0,
      createdAt: context.createdAt || now,
      updatedAt: now
    });
    pruneIdempotencyLedger(database.data);
    await database.write();
    return payload;
  });

  app.get("/api/health", async () => ({ ok: true, service: "layerpilot-api", persistence: database.persistenceLabel || "lowdb-json" }));
  app.get("/api/readiness", async (request, reply) => {
    const readiness = await checkReadiness(database, startedAt);
    if (!readiness.ok) reply.code(503);
    return readiness;
  });
  app.post("/api/internal/worker-broadcast", async (request, reply) => {
    if (!hasValidWorkerToken(request)) return reply.code(403).send({ error: "Invalid worker token" });
    await database.read();
    database.realtimeClients ||= new Set();
    const reason = typeof request.body === "object" && request.body?.reason ? String(request.body.reason) : "worker.cycle";
    const payload = { reason, state: realtimeState(database.data), worker: database.data.dataMeta?.worker || null };
    broadcastRealtime(database, "state", payload);
    return { ok: true, clients: database.realtimeClients.size, worker: payload.worker };
  });
  app.get("/api/metrics", async (request, reply) => {
    if (!hasValidMetricsToken(request) && !hasPermission(request.user, "metrics:read")) return reply.code(403).send({ error: "Missing permission: metrics:read" });
    reply.type("text/plain; version=0.0.4; charset=utf-8");
    return buildOperationalMetrics(database, startedAt);
  });
  app.post("/api/auth/login", { config: { rateLimit: authRateLimit } }, async (request, reply) => {
    const parsed = authSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid login payload", issues: parsed.error.issues });
    const email = parsed.data.email.trim().toLowerCase();
    const user = database.data.users.find((item) => item.email.toLowerCase() === email);
    const lock = activeAuthLock(user);
    if (lock) {
      await dispatchAuthFailureEvent(database, "auth.login_locked", request, { email, user, reason: "account_locked", failedAttempts: lock.failedAttempts, lockedUntil: lock.lockedUntil, lockedReason: lock.reason });
      await database.write();
      return reply.code(423).send({ error: "Account temporarily locked", reason: lock.reason, lockedUntil: lock.lockedUntil, retryAfterSeconds: lock.retryAfterSeconds });
    }
    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      const failure = recordAuthFailureState(user, user ? "invalid_password" : "unknown_user");
      await dispatchAuthFailureEvent(database, "auth.login_failed", request, { email, user, reason: user ? "invalid_password" : "unknown_user", failedAttempts: failure?.failedAttempts, lockedUntil: failure?.lockedUntil });
      if (failure?.locked) {
        await dispatchEvent(database, "auth.account_locked", `${user.email} temporarily locked after authentication failures`, {
          userId: user.id,
          email,
          reason: "invalid_password",
          failedAttempts: failure.failedAttempts,
          lockedUntil: failure.lockedUntil,
          lockMinutes: failure.policy.lockMinutes
        }, { workspaceId: user.workspaceId || DEFAULT_WORKSPACE_ID });
      }
      await database.write();
      if (failure?.locked) return reply.code(423).send({ error: "Account temporarily locked", reason: "invalid_password", lockedUntil: failure.lockedUntil, retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(failure.lockedUntil) - Date.now()) / 1000)) });
      return reply.code(401).send({ error: "Invalid email or password" });
    }
    if (twoFactorStatus(user).enabled) {
      if (!parsed.data.twoFactorCode) return reply.code(409).send({ error: "Two-factor code required", requiresTwoFactor: true });
      const verification = verifyAndConsumeTwoFactorCode(user, parsed.data.twoFactorCode);
      if (!verification.ok) {
        const failure = recordAuthFailureState(user, "invalid_two_factor");
        await dispatchAuthFailureEvent(database, "auth.2fa_failed", request, { email, user, reason: "invalid_two_factor", failedAttempts: failure?.failedAttempts, lockedUntil: failure?.lockedUntil });
        if (failure?.locked) {
          await dispatchEvent(database, "auth.account_locked", `${user.email} temporarily locked after two-factor failures`, {
            userId: user.id,
            email,
            reason: "invalid_two_factor",
            failedAttempts: failure.failedAttempts,
            lockedUntil: failure.lockedUntil,
            lockMinutes: failure.policy.lockMinutes
          }, { workspaceId: user.workspaceId || DEFAULT_WORKSPACE_ID });
        }
        await database.write();
        if (failure?.locked) return reply.code(423).send({ error: "Account temporarily locked", reason: "invalid_two_factor", lockedUntil: failure.lockedUntil, retryAfterSeconds: Math.max(1, Math.ceil((Date.parse(failure.lockedUntil) - Date.now()) / 1000)) });
        return reply.code(401).send({ error: "Invalid two-factor code", requiresTwoFactor: true });
      }
      await dispatchEvent(database, "auth.2fa_verified", `${user.email} completed 2FA`, { userId: user.id, method: verification.method }, { actor: user });
    }
    const token = randomBytes(32).toString("hex");
    const now = new Date().toISOString();
    user.lastSeen = "Now";
    user.updatedAt = now;
    user.workspaceId ||= DEFAULT_WORKSPACE_ID;
    clearAuthFailureState(user);
    const session = createSession({ token, user, workspaceId: user.workspaceId, now: new Date(now) });
    database.data.sessions.push(session);
    await dispatchEvent(database, "auth.login", `${user.email} signed in`, { userId: user.id, sessionId: session.id }, { actor: user, at: now });
    await database.write();
    return { token, user: sanitizeUser(user) };
  });

  app.post("/api/auth/signup", { config: { rateLimit: authRateLimit } }, async (request, reply) => {
    if (!publicSignupEnabled()) {
      return reply.code(403).send({
        error: "Public signup is disabled in production",
        remediation: "Set LAYERPILOT_ENABLE_PUBLIC_SIGNUP=true only when tenant self-service registration is intentionally enabled."
      });
    }
    const parsed = signupSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid signup payload", issues: parsed.error.issues });
    const exists = database.data.users.some((item) => item.email.toLowerCase() === parsed.data.email.toLowerCase());
    if (exists) return reply.code(409).send({ error: "User already exists" });
    const now = new Date().toISOString();
    const workspaceId = `ws-${randomUUID()}`;
    const workspaceName = parsed.data.workspace;
    const workspace = workspaceRecordSchema.parse({
      id: workspaceId,
      name: workspaceName,
      slug: workspaceSlug(workspaceName),
      ownerEmail: parsed.data.email,
      createdAt: now,
      updatedAt: now,
      settings: { ...database.data.workspaceSettings, workspaceId, organizationName: workspaceName }
    });
    const user = {
      id: randomUUID(),
      workspaceId,
      name: parsed.data.name,
      email: parsed.data.email,
      role: "Owner",
      location: parsed.data.workspace,
      lastSeen: "Now",
      passwordHash: createPasswordHash(parsed.data.password),
      updatedAt: now
    };
    const token = randomBytes(32).toString("hex");
    database.data.workspaces ||= [];
    database.data.workspaces.push(workspace);
    database.data.users.push(user);
    database.data.sessions.push(createSession({ token, user, workspaceId, now: new Date(now) }));
    await dispatchEvent(database, "auth.signup", `${user.email} created ${parsed.data.workspace}`, { workspaceId, userId: user.id }, { actor: user, at: now });
    await database.write();
    return reply.code(201).send({ token, user: sanitizeUser(user) });
  });

  app.get("/api/auth/me", async (request, reply) => {
    const { session, user } = userFromRequest(database, request);
    if (!user) return reply.code(401).send({ error: "Authentication required" });
    if (session) session.lastSeenAt = new Date().toISOString();
    if (database.data.__sessionStoreDirty) {
      await database.write();
      clearSessionStoreDirty(database.data);
    }
    return { user: sanitizeUser(user) };
  });

  app.post("/api/auth/2fa/setup", { config: { rateLimit: sensitiveRateLimit } }, async (request, reply) => {
    const { session, user } = userFromRequest(database, request);
    if (!session || !user) return reply.code(401).send({ error: "User session required" });
    const secret = base32Encode(randomBytes(20));
    const issuer = database.data.workspaceSettings?.organizationName || "3DSTU FarmFlow";
    await dispatchEvent(database, "auth.2fa_setup_started", `${user.email} started 2FA setup`, { userId: user.id }, { actor: user });
    await database.write();
    return { secret, otpauthUrl: buildOtpAuthUrl({ secret, user, issuer }), user: sanitizeUser(user) };
  });

  app.post("/api/auth/2fa/enable", { config: { rateLimit: sensitiveRateLimit } }, async (request, reply) => {
    const { session, user } = userFromRequest(database, request);
    if (!session || !user) return reply.code(401).send({ error: "User session required" });
    const parsed = twoFactorEnableSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid 2FA enable payload", issues: parsed.error.issues });
    if (!verifyTotpCode(parsed.data.secret, parsed.data.code)) return reply.code(401).send({ error: "Invalid two-factor code" });
    const recoveryCodes = generateRecoveryCodes();
    user.twoFactorSecret = parsed.data.secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
    user.twoFactorEnabled = true;
    user.twoFactorEnrolledAt = new Date().toISOString();
    user.twoFactorRecoveryCodeHashes = recoveryCodes.map(createPasswordHash);
    user.updatedAt = user.twoFactorEnrolledAt;
    await dispatchEvent(database, "auth.2fa_enabled", `${user.email} enabled 2FA`, { userId: user.id, recoveryCodesIssued: recoveryCodes.length }, { actor: user });
    await database.write();
    return { user: sanitizeUser(user), recoveryCodes };
  });

  app.post("/api/auth/2fa/disable", { config: { rateLimit: sensitiveRateLimit } }, async (request, reply) => {
    const { session, user } = userFromRequest(database, request);
    if (!session || !user) return reply.code(401).send({ error: "User session required" });
    if (productionRequiresAdminTwoFactor(database.data, user)) {
      return reply.code(409).send({
        error: "Two-factor authentication is required for production Owner/Admin accounts",
        requiresTwoFactorEnrollment: true,
        remediation: "Disable the workspace requireAdmin2fa policy before disabling TOTP for Owner/Admin accounts."
      });
    }
    const parsed = twoFactorDisableSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid 2FA disable payload", issues: parsed.error.issues });
    if (!verifyPassword(parsed.data.password, user.passwordHash)) return reply.code(401).send({ error: "Invalid password" });
    if (twoFactorStatus(user).enabled && !verifyAndConsumeTwoFactorCode(user, parsed.data.code || "").ok) return reply.code(401).send({ error: "Invalid two-factor code" });
    delete user.twoFactorSecret;
    user.twoFactorEnabled = false;
    user.twoFactorEnrolledAt = "";
    user.twoFactorRecoveryCodeHashes = [];
    user.updatedAt = new Date().toISOString();
    await dispatchEvent(database, "auth.2fa_disabled", `${user.email} disabled 2FA`, { userId: user.id }, { actor: user });
    await database.write();
    return { user: sanitizeUser(user) };
  });

  app.post("/api/auth/change-password", { config: { rateLimit: authRateLimit } }, async (request, reply) => {
    if (Array.isArray(request.user?.apiScopes)) return reply.code(403).send({ error: "Password changes require a user session" });
    const parsed = passwordChangeSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid password change payload", issues: parsed.error.issues });
    const { token, session, user } = userFromRequest(database, request);
    if (!session || !user) return reply.code(401).send({ error: "Authentication required" });
    const persistedUser = database.data.users.find((item) => item.id === user.id);
    if (!persistedUser || !verifyPassword(parsed.data.currentPassword, persistedUser.passwordHash)) return reply.code(401).send({ error: "Current password is incorrect" });
    if (parsed.data.currentPassword === parsed.data.newPassword) return reply.code(409).send({ error: "New password must be different" });
    const sessionsBeforeChange = (database.data.sessions || []).filter((item) => item.userId === persistedUser.id).length;
    persistedUser.passwordHash = createPasswordHash(parsed.data.newPassword);
    persistedUser.passwordResetRequired = false;
    clearAuthFailureState(persistedUser);
    persistedUser.updatedAt = new Date().toISOString();
    database.data.sessions = (database.data.sessions || []).filter((item) => item.userId !== persistedUser.id || sessionMatchesToken(item, token));
    const sessionsAfterChange = (database.data.sessions || []).filter((item) => item.userId === persistedUser.id).length;
    await dispatchEvent(database, "auth.password_changed", `${persistedUser.email} changed password`, { userId: persistedUser.id, sessionsRevoked: Math.max(0, sessionsBeforeChange - sessionsAfterChange) }, { actor: persistedUser });
    await database.write();
    return { ok: true, user: sanitizeUser(persistedUser) };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const { token, session, user } = userFromRequest(database, request);
    if (!user) return reply.code(401).send({ error: "Authentication required" });
    const sessionsBeforeLogout = database.data.sessions.length;
    database.data.sessions = database.data.sessions.filter((session) => !sessionMatchesToken(session, token));
    await dispatchEvent(database, "auth.logout", `${user.email} signed out`, {
      userId: user.id,
      sessionId: session?.id || "",
      revokedSessions: Math.max(0, sessionsBeforeLogout - database.data.sessions.length)
    }, { actor: user });
    await database.write();
    return { ok: true };
  });

  app.get("/api/state", async (request) => realtimeStateForUser(database.data, request.user));
  app.get("/api/events/stream", async (request, reply) => {
    const { user } = userFromRequest(database, request);
    if (!user) return reply.code(401).send({ error: "Authentication required" });
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });
    const client = {
      id: randomUUID(),
      userId: user.id,
      workspaceId: user.workspaceId || DEFAULT_WORKSPACE_ID,
      raw: reply.raw,
      send: (event, payload) => sendSse(reply.raw, event, payload),
      keepalive: setInterval(() => sendSse(reply.raw, "heartbeat", { at: new Date().toISOString() }), 25000)
    };
    database.realtimeClients.add(client);
    request.raw.on("close", () => {
      clearInterval(client.keepalive);
      database.realtimeClients.delete(client);
    });
    client.send("state", { reason: "stream.open", state: realtimeStateForUser(database.data, user) });
  });
  app.get("/api/events/ws", { websocket: true }, (socket, request) => {
    const { user } = userFromRequest(database, request);
    if (!user) {
      socket.send(JSON.stringify({ event: "error", data: { error: "Authentication required" } }));
      socket.close(1008, "Authentication required");
      return;
    }
    const client = {
      id: randomUUID(),
      userId: user.id,
      workspaceId: user.workspaceId || DEFAULT_WORKSPACE_ID,
      socket,
      send: (event, payload) => socket.send(JSON.stringify({ event, data: payload })),
      keepalive: setInterval(() => socket.send(JSON.stringify({ event: "heartbeat", data: { at: new Date().toISOString() } })), 25000)
    };
    database.realtimeClients.add(client);
    socket.on("close", () => closeRealtimeClient(database, client));
    socket.on("error", () => closeRealtimeClient(database, client));
    client.send("state", { reason: "ws.open", state: realtimeStateForUser(database.data, user) });
  });
  app.get("/api/users", async (request) => scopedWorkspaceData(database.data, request.user.workspaceId).users.map(sanitizeUser));
  app.get("/api/bridges", async (request) => (scopedWorkspaceData(database.data, request.user.workspaceId).bridges || []).map(sanitizeBridge));
  app.get("/api/webhooks", async (request) => (scopedWorkspaceData(database.data, request.user.workspaceId).webhooks || []).map(sanitizeWebhook));
  app.get("/api/webhookDeliveries", async (request) => (scopedWorkspaceData(database.data, request.user.workspaceId).webhookDeliveries || []).map(sanitizeWebhookDelivery));
  app.get("/api/notificationChannels", async (request) => (scopedWorkspaceData(database.data, request.user.workspaceId).notificationChannels || []).map(sanitizeNotificationChannel));
  app.get("/api/notificationDeliveries", async (request) => (scopedWorkspaceData(database.data, request.user.workspaceId).notificationDeliveries || []).map(sanitizeNotificationDelivery));
  app.get("/api/commerceConnectors", async (request) => (scopedWorkspaceData(database.data, request.user.workspaceId).commerceConnectors || []).map(sanitizeCommerceConnector));
  app.get("/api/apiKeys", async (request) => (scopedWorkspaceData(database.data, request.user.workspaceId).apiKeys || []).map(sanitizeApiKey));
  app.get("/api/addons", async (request) => (scopedWorkspaceData(database.data, request.user.workspaceId).addons || []).map(sanitizeAddon));
  app.get("/api/workspaceSettings", async (request) => scopedWorkspaceData(database.data, request.user.workspaceId).workspaceSettings);
  app.get("/api/onboarding", async (request) => buildOnboarding(workspaceScopeForUser(database.data, request.user)));
  app.patch("/api/onboarding/:id", async (request, reply) => {
    if (!hasPermission(request.user, "settings:write")) return reply.code(403).send({ error: "Missing permission: settings:write" });
    const parsed = onboardingStepPatchSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid onboarding step", issues: parsed.error.issues });
    const current = workspaceScopeForUser(database.data, request.user).workspaceSettings || {};
    const onboarding = { ...(current.onboarding || {}) };
    onboarding[request.params.id] = { ...parsed.data, updatedAt: new Date().toISOString(), updatedBy: request.user.email };
    const settings = updateWorkspaceSettings(database.data, request.user.workspaceId, { onboarding });
    await dispatchEvent(database, "onboarding.updated", `${request.params.id} -> ${parsed.data.status}`, { workspaceId: request.user.workspaceId, stepId: request.params.id, status: parsed.data.status }, { actor: request.user });
    await database.write();
    return { settings, onboarding: buildOnboarding(workspaceScopeForUser(database.data, request.user)) };
  });
  app.post("/api/support/snapshot", async (request, reply) => {
    if (!hasPermission(request.user, "admin:export")) return reply.code(403).send({ error: "Missing permission: admin:export" });
    const snapshot = await buildSupportSnapshot(database.data, request.user);
    await dispatchEvent(database, "support.snapshot", `${request.user.email} generated support snapshot`, { workspaceId: request.user.workspaceId, generatedAt: snapshot.generatedAt, onboarding: snapshot.readiness.onboarding }, { actor: request.user });
    await database.write();
    return snapshot;
  });
  app.get("/api/billing", async (request) => buildBillingSummary(workspaceScopeForUser(database.data, request.user), { stripeClient }));
  app.get("/api/costCatalog", async () => database.data.costCatalog);

  for (const collection of COLLECTIONS) {
    if (collection === "bridges" || collection === "webhooks" || collection === "webhookDeliveries" || collection === "notificationChannels" || collection === "notificationDeliveries" || collection === "commerceConnectors" || collection === "apiKeys" || collection === "addons" || collection === "quoteRequests") continue;
    app.get(`/api/${collection}`, async (request) => scopedWorkspaceData(database.data, request.user.workspaceId)[collection] || []);
  }

  app.get("/api/quoteRequests", async (request) => (scopedWorkspaceData(database.data, request.user.workspaceId).quoteRequests || []).map(sanitizeQuoteRequest));

  app.get("/api/todos", async (request) => deriveTodos(scopedWorkspaceData(database.data, request.user.workspaceId)));

  app.post("/api/todos/:id/action", async (request, reply) => {
    if (!hasPermission(request.user, "queue:write")) return reply.code(403).send({ error: "Missing permission: queue:write" });
    const parsed = todoActionSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid todo action", issues: parsed.error.issues });
    const rawTodos = deriveTodos({ ...workspaceScopeForUser(database.data, request.user), todoActions: [] });
    const existing = rawTodos.find((todo) => todo.id === request.params.id);
    if (!existing) return reply.code(404).send({ error: "Todo not found", todoId: request.params.id });
    const now = new Date().toISOString();
    const action = {
      id: randomUUID(),
      workspaceId: request.user.workspaceId,
      todoId: existing.id,
      todoTitle: existing.title,
      todoKind: existing.kind,
      action: parsed.data.action,
      owner: parsed.data.owner || request.user.name || existing.owner,
      note: parsed.data.note || "",
      snoozeUntil: parsed.data.snoozeUntil || "",
      createdBy: request.user.email,
      at: now
    };
    database.data.todoActions ||= [];
    database.data.todoActions.unshift(action);
    await dispatchEvent(database, `todo.${action.action}`, `${existing.title} ${action.action}`, { todoId: existing.id, kind: existing.kind, owner: action.owner, note: action.note, snoozeUntil: action.snoozeUntil });
    await database.write();
    const todos = deriveTodos(workspaceScopeForUser(database.data, request.user));
    broadcastRealtime(database, "state", { reason: "todo.action", state: realtimeState(database.data), action });
    return { action, todo: todos.find((todo) => todo.id === existing.id) || null, todos, todoActions: workspaceScopeForUser(database.data, request.user).todoActions };
  });

  app.post("/api/public/quoteRequests", { config: { rateLimit: { max: 20, timeWindow: "1 minute", groupId: "quote-intake" } } }, async (request, reply) => {
    const incoming = await parsePublicQuoteRequestPayload(request);
    const publicIdempotency = publicIdempotencyContext("POST", "/api/public/quoteRequests");
    if (publicIdempotency && await prepareIdempotentRequest(database, request, reply, { ...publicIdempotency, bodyDigest: publicQuoteIntakeDigest(incoming) })) return;
    const parsed = publicQuoteRequestSchema.safeParse(incoming.payload || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid quote request payload", issues: parsed.error.issues });
    const workspace = workspaceForId(database.data, DEFAULT_WORKSPACE_ID);
    const now = new Date().toISOString();
    const quoteId = `qr-${randomUUID().slice(0, 8)}`;
    const uploaded = incoming.upload ? await createStoredModelFile(database, {
      filename: incoming.upload.filename,
      buffer: incoming.upload.buffer,
      material: parsed.data.material,
      folder: "Customer Quotes",
      folderPurpose: "quote-intake",
      tags: ["quote", "customer-upload", "parsed"],
      source: "Quote request",
      quoteRequestId: quoteId
    }, { workspaceId: workspace.id }) : null;
    const quote = {
      id: quoteId,
      workspaceId: workspace.id,
      customerAccessToken: randomBytes(18).toString("base64url"),
      ...parsed.data,
      fileName: uploaded?.file?.name || parsed.data.fileName,
      fileId: uploaded?.file?.id || "",
      fileType: uploaded?.file?.type || "",
      fileSize: uploaded?.file?.size || "",
      estimatedGrams: uploaded?.file?.estimateGrams || 0,
      estimatedMinutes: uploaded?.file?.estimateMinutes || 0,
      estimatedQuote: uploaded?.file?.quote || 0,
      status: "new",
      priority: "Normal",
      quotedValue: uploaded?.file?.quote || 0,
      internalNote: "",
      createdAt: now,
      updatedAt: now
    };
    database.data.quoteRequests.unshift(quote);
    await dispatchEvent(database, "quote_request.created", `${quote.customer} requested ${quote.project}`, { quoteRequestId: quote.id, fileId: quote.fileId, material: quote.material, quantity: quote.quantity, source: quote.source });
    await database.write();
    return reply.code(201).send({ ok: true, quoteRequest: { ...publicQuoteSummary(quote), fileId: quote.fileId, accessToken: quote.customerAccessToken } });
  });

  app.get("/api/public/quoteRequests/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute", groupId: "quote-portal" } } }, async (request, reply) => {
    const token = request.query?.token;
    const quote = database.data.quoteRequests.find((item) => item.id === request.params.id && itemInWorkspace(item, DEFAULT_WORKSPACE_ID));
    if (!quote || !quoteTokenMatches(quote, token)) return reply.code(404).send({ error: "Quote request not found" });
    return { ok: true, quoteRequest: publicQuoteSummary(quote) };
  });

  app.post("/api/public/quoteRequests/:id/decision", { config: { rateLimit: { max: 20, timeWindow: "1 minute", groupId: "quote-portal-decision" } } }, async (request, reply) => {
    const parsed = publicQuoteDecisionSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid quote decision payload", issues: parsed.error.issues });
    const quote = database.data.quoteRequests.find((item) => item.id === request.params.id && itemInWorkspace(item, DEFAULT_WORKSPACE_ID));
    if (!quote || !quoteTokenMatches(quote, parsed.data.token)) return reply.code(404).send({ error: "Quote request not found" });
    const publicIdempotency = publicIdempotencyContext("POST", `/api/public/quoteRequests/${request.params.id}/decision`);
    if (publicIdempotency && await prepareIdempotentRequest(database, request, reply, { ...publicIdempotency, bodyDigest: requestBodyDigest(parsed.data) })) return;
    if (quote.orderId) return reply.code(409).send({ error: "Quote request already converted", orderId: quote.orderId });
    if (!["quoted", "accepted"].includes(quote.status)) return reply.code(409).send({ error: "Quote request is not ready for a customer decision", status: quote.status });
    if (parsed.data.decision === "accepted" && quoteExpired(quote)) return reply.code(409).send({ error: "Quote request has expired", status: quote.status, validUntil: quote.validUntil });
    const now = new Date().toISOString();
    Object.assign(quote, {
      customerDecision: parsed.data.decision,
      customerDecisionAt: now,
      customerDecisionNote: parsed.data.note,
      updatedAt: now
    });
    if (parsed.data.decision === "rejected") {
      Object.assign(quote, { status: "rejected", rejectedAt: now });
      await dispatchEvent(database, "quote_request.customer_rejected", `${quote.id} rejected by customer`, { workspaceId: quote.workspaceId || DEFAULT_WORKSPACE_ID, quoteRequestId: quote.id });
      await database.write();
      return { ok: true, quoteRequest: publicQuoteSummary(quote) };
    }
    if (parsed.data.decision === "revision") {
      Object.assign(quote, { status: "reviewing", revisionRequestedAt: now, reviewedBy: quote.email });
      await dispatchEvent(database, "quote_request.revision_requested", `${quote.id} revision requested by customer`, { workspaceId: quote.workspaceId || DEFAULT_WORKSPACE_ID, quoteRequestId: quote.id });
      await database.write();
      return { ok: true, quoteRequest: publicQuoteSummary(quote) };
    }
    Object.assign(quote, { status: "accepted", acceptedAt: now });
    await dispatchEvent(database, "quote_request.customer_accepted", `${quote.id} accepted by customer`, { workspaceId: quote.workspaceId || DEFAULT_WORKSPACE_ID, quoteRequestId: quote.id, quotedValue: quote.quotedValue || 0 });
    const result = convertQuoteToProduction(database.data, quote, { workspaceId: quote.workspaceId || DEFAULT_WORKSPACE_ID, due: quote.due, value: quote.quotedValue || quote.budget || 0, createJob: true, reviewedBy: quote.email });
    if (result.error) return reply.code(result.statusCode || 400).send({ error: result.error, orderId: result.orderId });
    await dispatchEvent(database, "quote_request.converted", `${quote.id} converted to ${result.order.id}`, { workspaceId: quote.workspaceId || DEFAULT_WORKSPACE_ID, quoteRequestId: quote.id, orderId: result.order.id, value: result.order.value });
    if (result.job) await dispatchEvent(database, "queue.created", `${result.job.file} queued from quote`, { workspaceId: quote.workspaceId || DEFAULT_WORKSPACE_ID, jobId: result.job.id, fileId: result.job.fileId, orderId: result.order.id, quoteRequestId: quote.id, material: result.job.material });
    await database.write();
    return reply.code(201).send({ ok: true, quoteRequest: publicQuoteSummary(quote), order: { id: result.order.id, status: result.order.status, due: result.order.due, value: result.order.value }, job: result.job ? { id: result.job.id, status: result.job.status, stage: result.job.stage, printer: result.job.printer } : null });
  });

  app.post("/api/telemetry/tick", async (request, reply) => {
    if (!hasPermission(request.user, "printers:control")) return reply.code(403).send({ error: "Missing permission: printers:control" });
    const parsed = z.object({ increment: z.number().positive().max(100).optional() }).safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid telemetry payload", issues: parsed.error.issues });
    return runTelemetryTick(database, { ...parsed.data, workspaceId: request.user.workspaceId });
  });
  app.get("/api/schedule/diagnostics", async (request) => buildScheduleDiagnostics(workspaceScopeForUser(database.data, request.user)));
  app.post("/api/schedule/auto", async (request, reply) => {
    if (!hasPermission(request.user, "queue:write")) return reply.code(403).send({ error: "Missing permission: queue:write" });
    const parsed = autoScheduleSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid auto schedule payload", issues: parsed.error.issues });
    const scoped = workspaceScopeForUser(database.data, request.user);
    const result = autoScheduleQueue(scoped, parsed.data);
    await dispatchEvent(database, "queue.auto_scheduled", `${result.scheduled.length} jobs auto scheduled`, { workspaceId: request.user.workspaceId }, { actor: request.user });
    await database.write();
    return result;
  });
  app.post("/api/schedule/optimize", async (request, reply) => {
    if (!hasPermission(request.user, "queue:write")) return reply.code(403).send({ error: "Missing permission: queue:write" });
    const parsed = optimizeScheduleSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid schedule optimization payload", issues: parsed.error.issues });
    const scoped = workspaceScopeForUser(database.data, request.user);
    const result = optimizeScheduleQueue(scoped, parsed.data);
    await dispatchEvent(database, "queue.optimized", `${result.scheduled.length} jobs optimized by ${result.strategy}`, { workspaceId: request.user.workspaceId, strategy: result.strategy, scheduled: result.scheduled.map((item) => item.jobId), skipped: result.skipped.length }, { actor: request.user });
    await database.write();
    return result;
  });
  app.post("/api/schedule/constraint", async (request, reply) => {
    if (!hasPermission(request.user, "queue:write")) return reply.code(403).send({ error: "Missing permission: queue:write" });
    const parsed = constraintScheduleSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid constraint schedule payload", issues: parsed.error.issues });
    const scoped = workspaceScopeForUser(database.data, request.user);
    const result = constraintScheduleQueue(scoped, parsed.data);
    if (!result.dryRun) {
      await dispatchEvent(database, "queue.constraint_scheduled", `${result.scheduled.length} jobs solved by ${result.solver.engine}`, {
        workspaceId: request.user.workspaceId,
        objective: result.solver.objective,
        feasible: result.solver.feasible,
        cost: result.solver.result,
        scheduled: result.scheduled.map((item) => item.jobId),
        skipped: result.skipped.length
      }, { actor: request.user });
      await database.write();
    }
    return result;
  });

  app.get("/api/analytics", async (request) => buildAnalytics(workspaceScopeForUser(database.data, request.user)));

  app.get("/api/catalog/export", async (request, reply) => {
    if (!hasPermission(request.user, "catalog:write")) return reply.code(403).send({ error: "Missing permission: catalog:write" });
    return buildCatalogExport(database.data);
  });

  app.post("/api/catalog/material-map", async (request, reply) => {
    if (!hasPermission(request.user, "catalog:write")) return reply.code(403).send({ error: "Missing permission: catalog:write" });
    const parsed = materialMapSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid material map payload", issues: parsed.error.issues });
    const scoped = workspaceScopeForUser(database.data, request.user);
    const result = buildMaterialMapping(scoped, parsed.data);
    database.data.materialMappings = [
      ...(database.data.materialMappings || []).filter((item) => !itemInWorkspace(item, request.user.workspaceId)),
      ...result.mappings.map((mapping) => ({ ...mapping, workspaceId: request.user.workspaceId }))
    ];
    database.data.materialMapRuns.unshift({
      id: randomUUID(),
      workspaceId: request.user.workspaceId,
      generatedAt: result.generatedAt,
      applied: result.applied,
      changed: result.changed,
      unmapped: result.unmapped,
      mappings: result.mappings.length
    });
    await dispatchEvent(database, "catalog.material_mapped", `${result.changed} material labels normalized`, { workspaceId: request.user.workspaceId, changed: result.changed, unmapped: result.unmapped, applied: result.applied }, { actor: request.user });
    await database.write();
    const updatedScope = workspaceScopeForUser(database.data, request.user);
    return { ...result, parts: updatedScope.parts, files: updatedScope.files, queue: updatedScope.queue };
  });

  app.get("/api/history", async (request) => buildPrintHistory(workspaceScopeForUser(database.data, request.user)));

  app.get("/api/audit", async (request) => {
    const options = parseAuditQuery(request.query || {});
    const scoped = workspaceScopeForUser(database.data, request.user);
    const page = buildAuditEventPage(scoped, options);
    return {
      generatedAt: new Date().toISOString(),
      ...page
    };
  });

  app.get("/api/audit/export", async (request, reply) => {
    if (!hasPermission(request.user, "admin:export")) return reply.code(403).send({ error: "Missing permission: admin:export" });
    const options = parseAuditQuery(request.query || {});
    const events = buildAuditEvents(workspaceScopeForUser(database.data, request.user), { ...options, limit: request.query?.limit ? options.limit : 1000 });
    const date = new Date().toISOString().slice(0, 10);
    reply.header("content-disposition", `attachment; filename="layerpilot-audit-${date}.csv"`);
    reply.type("text/csv; charset=utf-8");
    return auditEventsToCsv(events);
  });

  app.post("/api/admin/audit-retention/run", { config: { rateLimit: { ...sensitiveRateLimit, groupId: "admin-audit-retention" } } }, async (request, reply) => {
    if (!hasPermission(request.user, "admin:export")) return reply.code(403).send({ error: "Missing permission: admin:export" });
    const retention = applyAuditRetention(database.data, { workspaceId: request.user.workspaceId });
    database.data.dataMeta ||= {};
    database.data.dataMeta.auditRetentionLastRunAt = new Date().toISOString();
    await dispatchEvent(database, "admin.audit_retention_run", `${request.user.email} ran audit retention`, { retention }, { actor: request.user });
    await database.write();
    return { retention, events: database.data.events.length, ranAt: database.data.dataMeta.auditRetentionLastRunAt };
  });

  app.patch("/api/history/:id", async (request, reply) => {
    if (!hasPermission(request.user, "queue:write")) return reply.code(403).send({ error: "Missing permission: queue:write" });
    const parsed = historyPatchSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid history update", issues: parsed.error.issues });
    const job = database.data.queue.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!job) return reply.code(404).send({ error: "History job not found" });
    const inHistory = ["complete", "failed", "cancelled"].includes(job.status) || job.completedAt || job.stage === "post processing";
    if (!inHistory) return reply.code(409).send({ error: "Only completed, failed, cancelled, or post-processing jobs can be annotated" });
    const now = new Date().toISOString();
    if (parsed.data.note !== undefined) job.note = parsed.data.note;
    if (parsed.data.failureReason !== undefined) job.failureReason = parsed.data.failureReason;
    if (parsed.data.failureCategory !== undefined) job.failureCategory = parsed.data.failureCategory;
    if (parsed.data.rootCause !== undefined) job.rootCause = parsed.data.rootCause;
    if (parsed.data.correctiveAction !== undefined) job.correctiveAction = parsed.data.correctiveAction;
    if (parsed.data.wasteGrams !== undefined) {
      job.wasteGrams = Math.round(parsed.data.wasteGrams);
      job.wasteCost = parsed.data.wasteCost !== undefined ? Math.round(parsed.data.wasteCost * 100) / 100 : materialWasteCost(workspaceScopeForUser(database.data, request.user), job.material, job.wasteGrams);
    } else if (parsed.data.wasteCost !== undefined) {
      job.wasteCost = Math.round(parsed.data.wasteCost * 100) / 100;
    }
    if (parsed.data.wasteSpoolId !== undefined) job.wasteSpoolId = parsed.data.wasteSpoolId;
    if (parsed.data.issueTag !== undefined) {
      job.issueTag = parsed.data.issueTag;
      if (parsed.data.issueTag) job.flaggedAt = now;
    }
    if (parsed.data.issueSeverity !== undefined) job.issueSeverity = parsed.data.issueSeverity;
    let wasteInventory = null;
    if (parsed.data.deductWasteFromInventory && Number(job.wasteGrams || 0) > 0 && !job.wasteInventoryDeductedAt) {
      const scoped = workspaceScopeForUser(database.data, request.user);
      const targetSpool = (job.wasteSpoolId || parsed.data.wasteSpoolId)
        ? database.data.spools.find((spool) => spool.id === (job.wasteSpoolId || parsed.data.wasteSpoolId) && itemInWorkspace(spool, request.user.workspaceId))
        : scoped.spools.find((spool) => materialKey(spool.material) === materialKey(job.material));
      if (targetSpool) {
        const before = Number(targetSpool.remaining || 0);
        targetSpool.remaining = Math.max(0, before - Number(job.wasteGrams || 0));
        targetSpool.updatedAt = now;
        job.wasteSpoolId = targetSpool.id;
        job.wasteInventoryDeductedAt = now;
        job.wasteInventoryDeductedGrams = Number(job.wasteGrams || 0);
        wasteInventory = { spoolId: targetSpool.id, before, after: targetSpool.remaining, grams: Number(job.wasteGrams || 0) };
      }
    }
    job.updatedAt = now;
    await dispatchEvent(database, "history.annotated", `${job.file} history updated`, { workspaceId: request.user.workspaceId, jobId: job.id, issueTag: job.issueTag || "", issueSeverity: job.issueSeverity || "", failureCategory: job.failureCategory || "", wasteGrams: Number(job.wasteGrams || 0), wasteCost: Number(job.wasteCost || 0), wasteInventory }, { actor: request.user });
    await database.write();
    const history = buildPrintHistory(workspaceScopeForUser(database.data, request.user));
    const historyRecord = history.find((item) => item.id === job.id);
    return { job, historyRecord, history, analytics: buildAnalytics(workspaceScopeForUser(database.data, request.user)), spools: workspaceScopeForUser(database.data, request.user).spools, wasteInventory };
  });

  app.post("/api/history/:id/reprint", async (request, reply) => {
    if (!hasPermission(request.user, "queue:write")) return reply.code(403).send({ error: "Missing permission: queue:write" });
    const parsed = reprintSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid reprint payload", issues: parsed.error.issues });
    const sourceJob = database.data.queue.find((job) => job.id === request.params.id && itemInWorkspace(job, request.user.workspaceId));
    if (!sourceJob) return reply.code(404).send({ error: "History job not found" });
    const result = createReprintJob(database.data, sourceJob, parsed.data);
    if (result.error) return reply.code(result.statusCode || 400).send({ error: result.error });
    result.job.workspaceId = request.user.workspaceId;
    await dispatchEvent(database, "queue.reprint", `${result.job.file} reprint queued`, { workspaceId: request.user.workspaceId, sourceJobId: sourceJob.id, jobId: result.job.id }, { actor: request.user });
    await database.write();
    return reply.code(201).send({ job: result.job, todos: deriveTodos(workspaceScopeForUser(database.data, request.user)) });
  });

  app.get("/api/admin/export", { config: { rateLimit: { ...sensitiveRateLimit, groupId: "admin-export" } } }, async (request, reply) => {
    if (!hasPermission(request.user, "admin:export")) return reply.code(403).send({ error: "Missing permission: admin:export" });
    const exportedAt = new Date().toISOString();
    const includeFiles = request.query?.includeFiles === "true";
    const allowMissingFiles = request.query?.allowMissingFiles === "true";
    const scoped = workspaceScopeForUser(database.data, request.user);
    let filePayloads = { storage: { included: false, count: 0, bytes: 0, missing: [] } };
    if (includeFiles) {
      const limitBytes = fullBackupMaxBytes(request.query || {});
      const manifest = await buildBackupStorageManifest(scoped, limitBytes);
      if (manifest.missing.length && !allowMissingFiles) {
        await dispatchEvent(database, "admin.export", `${request.user.email} export blocked by missing stored file payloads`, { exportedAt, userId: request.user.id, includeFiles, blocked: true, missingFiles: manifest.missing.length, files: manifest.count, bytes: manifest.bytes }, { actor: request.user });
        await database.write();
        return reply.code(409).send({
          error: "Full backup export is missing stored file payloads",
          storage: manifest,
          remediation: "Restore or re-upload the missing stored files before exporting, restore the production volume/object store separately, or retry with allowMissingFiles=true when a partial JSON backup is intentional."
        });
      }
      if (manifest.oversized) {
        await dispatchEvent(database, "admin.export", `${request.user.email} export blocked by full backup size limit`, { exportedAt, userId: request.user.id, includeFiles, blocked: true, limitBytes, bytes: manifest.bytes, files: manifest.count }, { actor: request.user });
        await database.write();
        return reply.code(413).send({
          error: "Full backup export exceeds the configured byte limit",
          storage: manifest,
          remediation: "Use the verified Ubuntu volume backup or raise LAYERPILOT_FULL_BACKUP_MAX_BYTES for this instance before exporting stored file bytes."
        });
      }
      filePayloads = await buildBackupFilePayloads(scoped, manifest);
    }
    await dispatchEvent(database, "admin.export", `${request.user.email} exported workspace data`, { exportedAt, userId: request.user.id, includeFiles, allowMissingFiles, limitBytes: filePayloads.storage.limitBytes || undefined, bytes: filePayloads.storage.bytes, files: filePayloads.storage.count, missingFiles: filePayloads.storage.missing?.length || 0 }, { actor: request.user });
    await database.write();
    reply.header("content-disposition", `attachment; filename="layerpilot-export-${exportedAt.slice(0, 10)}.json"`);
    return {
      exportedAt,
      service: "3DSTU FarmFlow",
      version: "0.1.0",
      schemaVersion: CURRENT_SCHEMA_VERSION,
      data: publicState(scoped),
      ...filePayloads,
      todos: deriveTodos(scoped),
      analytics: buildAnalytics(scoped),
      history: buildPrintHistory(scoped)
    };
  });

  app.get("/api/admin/integrity", { config: { rateLimit: { ...sensitiveRateLimit, groupId: "admin-integrity" } } }, async (request, reply) => {
    if (!hasPermission(request.user, "admin:export")) return reply.code(403).send({ error: "Missing permission: admin:export" });
    const report = await buildDataIntegrityReport(workspaceScopeForUser(database.data, request.user), { checkStorage: request.query?.checkStorage === "true" });
    database.data.dataMeta ||= {};
    database.data.dataMeta.integrityLastCheckedAt = report.checkedAt;
    await dispatchEvent(database, "admin.integrity_checked", `${request.user.email} checked data integrity`, {
      ok: report.ok,
      errors: report.errors.length,
      warnings: report.warnings.length,
      checkStorage: report.storage.checked,
      storageComplete: report.storage.complete,
      storageExpected: report.storage.expected,
      storagePresent: report.storage.present,
      storageBytes: report.storage.bytes,
      storageMissingFiles: report.storage.missing.length
    }, { actor: request.user });
    await database.write();
    return report;
  });

  app.post("/api/admin/restore", { config: { rateLimit: { ...sensitiveRateLimit, groupId: "admin-restore" } } }, async (request, reply) => {
    if (!hasPermission(request.user, "admin:restore")) return reply.code(403).send({ error: "Missing permission: admin:restore" });
    const parsed = adminRestoreSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid restore payload", issues: parsed.error.issues });
    const commitRequested = parsed.data.dryRun === false;
    if (commitRequested && Array.isArray(request.user?.apiScopes)) return reply.code(403).send({ error: "Restore commit requires a user session" });
    const restoreFilePayloads = commitRequested && parsed.data.confirm === "RESTORE";
    const prepared = await prepareRestoreData(database.data, parsed.data.backup, { preserveStoragePaths: parsed.data.preserveStoragePaths, restoreFilePayloads }, request.user);
    if (prepared.error) return reply.code(400).send({ error: prepared.error });
    if (parsed.data.dryRun !== false) return { dryRun: true, ...prepared.summary };
    if (parsed.data.confirm !== "RESTORE") return reply.code(409).send({ error: "Restore commit requires confirm: RESTORE", dryRun: true, ...prepared.summary });
    database.data = prepared.data;
    await dispatchEvent(database, "admin.restore", `${request.user.email} restored workspace data`, { summary: prepared.summary }, { actor: request.user });
    await ensureAuthData(database, { skipDemoUser: true });
    await database.write();
    broadcastRealtime(database, "state", { reason: "admin.restore", state: realtimeState(database.data), summary: prepared.summary });
    return { dryRun: false, restored: true, ...prepared.summary };
  });

  app.post("/api/webhooks", async (request, reply) => {
    if (!hasPermission(request.user, "webhooks:write")) return reply.code(403).send({ error: "Missing permission: webhooks:write" });
    const parsed = webhookSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid webhook payload", issues: parsed.error.issues });
    const webhook = { id: randomUUID(), workspaceId: request.user.workspaceId, ...parsed.data, lastStatus: "not sent", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    database.data.webhooks.push(webhook);
    await dispatchEvent(database, "webhook.created", `${webhook.name} configured`, { webhookId: webhook.id });
    await database.write();
    return reply.code(201).send(sanitizeWebhook(webhook));
  });

  app.patch("/api/webhooks/:id", async (request, reply) => {
    if (!hasPermission(request.user, "webhooks:write")) return reply.code(403).send({ error: "Missing permission: webhooks:write" });
    const parsed = webhookPatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid webhook update", issues: parsed.error.issues });
    const webhook = database.data.webhooks.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!webhook) return reply.code(404).send({ error: "Webhook not found" });
    Object.assign(webhook, parsed.data, { updatedAt: new Date().toISOString() });
    await dispatchEvent(database, "webhook.updated", `${webhook.name} updated`, { webhookId: webhook.id });
    await database.write();
    return sanitizeWebhook(webhook);
  });

  app.post("/api/webhooks/:id/test", async (request, reply) => {
    if (!hasPermission(request.user, "webhooks:write")) return reply.code(403).send({ error: "Missing permission: webhooks:write" });
    const webhook = database.data.webhooks.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!webhook) return reply.code(404).send({ error: "Webhook not found" });
    const event = { id: randomUUID(), type: "webhook.test", message: `${webhook.name} test delivery`, data: { webhookId: webhook.id }, at: new Date().toISOString() };
    database.data.events.unshift(event);
    const delivery = await deliverWebhook(database, webhook, event);
    await database.write();
    return { event, delivery: sanitizeWebhookDelivery(delivery), webhook: sanitizeWebhook(webhook) };
  });

  app.post("/api/notificationChannels", async (request, reply) => {
    if (!hasPermission(request.user, "notifications:write")) return reply.code(403).send({ error: "Missing permission: notifications:write" });
    const parsed = notificationChannelSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid notification channel payload", issues: parsed.error.issues });
    const channel = { id: randomUUID(), workspaceId: request.user.workspaceId, ...parsed.data, lastStatus: "not sent", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    database.data.notificationChannels.push(channel);
    await dispatchEvent(database, "notification.channel_created", `${channel.name} configured`, { channelId: channel.id });
    await database.write();
    return reply.code(201).send(sanitizeNotificationChannel(channel));
  });

  app.patch("/api/notificationChannels/:id", async (request, reply) => {
    if (!hasPermission(request.user, "notifications:write")) return reply.code(403).send({ error: "Missing permission: notifications:write" });
    const parsed = notificationChannelPatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid notification channel update", issues: parsed.error.issues });
    const channel = database.data.notificationChannels.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!channel) return reply.code(404).send({ error: "Notification channel not found" });
    Object.assign(channel, parsed.data, { updatedAt: new Date().toISOString() });
    await dispatchEvent(database, "notification.channel_updated", `${channel.name} updated`, { channelId: channel.id });
    await database.write();
    return sanitizeNotificationChannel(channel);
  });

  app.post("/api/notificationChannels/:id/test", async (request, reply) => {
    if (!hasPermission(request.user, "notifications:write")) return reply.code(403).send({ error: "Missing permission: notifications:write" });
    const channel = database.data.notificationChannels.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!channel) return reply.code(404).send({ error: "Notification channel not found" });
    const event = { id: randomUUID(), type: "notification.test", message: `${channel.name} test alert`, data: { channelId: channel.id }, at: new Date().toISOString() };
    database.data.events.unshift(event);
    const delivery = await deliverNotification(database, channel, event);
    await database.write();
    const safeDelivery = sanitizeNotificationDelivery(delivery);
    broadcastRealtime(database, "event", { event, notificationDeliveries: [safeDelivery] });
    return { event, delivery: safeDelivery, channel: sanitizeNotificationChannel(channel) };
  });

  app.post("/api/apiKeys", { config: { rateLimit: { ...sensitiveRateLimit, groupId: "api-keys-create" } } }, async (request, reply) => {
    if (request.apiKey) return reply.code(403).send({ error: "API key management requires a user session" });
    if (!hasPermission(request.user, "apiKeys:write")) return reply.code(403).send({ error: "Missing permission: apiKeys:write" });
    const parsed = apiKeySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid API key payload", issues: parsed.error.issues });
    const secret = createApiKeySecret();
    const now = new Date().toISOString();
    const key = {
      id: randomUUID(),
      name: parsed.data.name,
      prefix: apiKeyPrefix(secret),
      secretHash: createPasswordHash(secret),
      scopes: parsed.data.scopes,
      enabled: parsed.data.enabled,
      workspaceId: request.user.workspaceId,
      expiresAt: parsed.data.expiresAt || "",
      createdBy: request.user.id,
      createdAt: now,
      lastUsedAt: ""
    };
    database.data.apiKeys.push(key);
    await dispatchEvent(database, "api_key.created", `${key.name} created`, { workspaceId: request.user.workspaceId, apiKeyId: key.id, scopes: key.scopes }, { actor: request.user });
    await database.write();
    return reply.code(201).send({ apiKey: sanitizeApiKey(key), secret });
  });

  app.patch("/api/apiKeys/:id", async (request, reply) => {
    if (request.apiKey) return reply.code(403).send({ error: "API key management requires a user session" });
    if (!hasPermission(request.user, "apiKeys:write")) return reply.code(403).send({ error: "Missing permission: apiKeys:write" });
    const parsed = apiKeyPatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid API key update", issues: parsed.error.issues });
    const key = database.data.apiKeys.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!key) return reply.code(404).send({ error: "API key not found" });
    Object.assign(key, parsed.data, { updatedAt: new Date().toISOString() });
    await dispatchEvent(database, "api_key.updated", `${key.name} updated`, { workspaceId: request.user.workspaceId, apiKeyId: key.id, enabled: key.enabled, scopes: key.scopes }, { actor: request.user });
    await database.write();
    return sanitizeApiKey(key);
  });

  app.post("/api/users", async (request, reply) => {
    if (!hasPermission(request.user, "users:write")) return reply.code(403).send({ error: "Missing permission: users:write" });
    const parsed = userCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid user payload", issues: parsed.error.issues });
    const exists = database.data.users.some((item) => item.email.toLowerCase() === parsed.data.email.toLowerCase());
    if (exists) return reply.code(409).send({ error: "User already exists" });
    const now = new Date().toISOString();
    const password = parsed.data.password || randomBytes(10).toString("base64url");
    const user = {
      id: randomUUID(),
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      location: parsed.data.location,
      workspaceId: request.user.workspaceId,
      lastSeen: "Invite sent",
      invitedBy: request.user.id,
      invitedAt: now,
      updatedAt: now,
      passwordHash: createPasswordHash(password)
    };
    database.data.users.push(user);
    await dispatchEvent(database, "user.invited", `${user.email} invited as ${user.role}`, { workspaceId: request.user.workspaceId, userId: user.id, role: user.role, location: user.location }, { actor: request.user });
    await database.write();
    return reply.code(201).send({ user: sanitizeUser(user), temporaryPassword: parsed.data.password ? undefined : password });
  });

  app.patch("/api/users/:id", async (request, reply) => {
    if (!hasPermission(request.user, "users:write")) return reply.code(403).send({ error: "Missing permission: users:write" });
    const parsed = userPatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid user update", issues: parsed.error.issues });
    const user = database.data.users.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!user) return reply.code(404).send({ error: "User not found" });
    if (user.role === "Owner" && parsed.data.role && parsed.data.role !== "Owner") {
      const ownerCount = database.data.users.filter((item) => item.role === "Owner" && itemInWorkspace(item, request.user.workspaceId)).length;
      if (ownerCount <= 1) return reply.code(409).send({ error: "At least one Owner is required" });
    }
    Object.assign(user, parsed.data, { updatedAt: new Date().toISOString() });
    await dispatchEvent(database, "user.updated", `${user.email} updated`, { workspaceId: request.user.workspaceId, userId: user.id, role: user.role, location: user.location }, { actor: request.user });
    await database.write();
    return sanitizeUser(user);
  });

  app.post("/api/users/:id/reset-password", { config: { rateLimit: { ...sensitiveRateLimit, groupId: "user-reset-password" } } }, async (request, reply) => {
    if (!hasPermission(request.user, "users:write")) return reply.code(403).send({ error: "Missing permission: users:write" });
    const parsed = passwordResetSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid password reset payload", issues: parsed.error.issues });
    const user = database.data.users.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!user) return reply.code(404).send({ error: "User not found" });
    const password = parsed.data.password || randomBytes(10).toString("base64url");
    user.passwordHash = createPasswordHash(password);
    user.passwordResetRequired = parsed.data.requireChange;
    clearAuthFailureState(user);
    user.updatedAt = new Date().toISOString();
    database.data.sessions = (database.data.sessions || []).filter((session) => session.userId !== user.id);
    await dispatchEvent(database, "user.password_reset", `${user.email} password reset`, { workspaceId: request.user.workspaceId, userId: user.id, resetBy: request.user.email, requireChange: parsed.data.requireChange }, { actor: request.user });
    await database.write();
    return { user: sanitizeUser(user), temporaryPassword: parsed.data.password ? undefined : password };
  });

  app.patch("/api/workspaceSettings", async (request, reply) => {
    if (!hasPermission(request.user, "settings:write")) return reply.code(403).send({ error: "Missing permission: settings:write" });
    const parsed = workspaceSettingsPatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid workspace settings payload", issues: parsed.error.issues });
    const current = workspaceForId(database.data, request.user.workspaceId).settings || database.data.workspaceSettings || {};
    const next = workspaceSettingsSchema.safeParse({ ...current, ...parsed.data, workspaceId: request.user.workspaceId || current.workspaceId || DEFAULT_WORKSPACE_ID });
    if (!next.success) return reply.code(400).send({ error: "Invalid workspace settings payload", issues: next.error.issues });
    const settings = updateWorkspaceSettings(database.data, request.user.workspaceId, next.data);
    await dispatchEvent(database, "settings.updated", `${settings.organizationName} settings updated`, { workspaceId: request.user.workspaceId, settings }, { actor: request.user });
    await database.write();
    return settings;
  });

  app.patch("/api/billing/plan", async (request, reply) => {
    if (!hasPermission(request.user, "settings:write")) return reply.code(403).send({ error: "Missing permission: settings:write" });
    const parsed = billingPlanPatchSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid billing plan payload", issues: parsed.error.issues });
    const plan = billingPlanTiers.find((tier) => tier.id === parsed.data.planId);
    if (!plan) return reply.code(404).send({ error: "Billing plan not found" });
    const scoped = workspaceScopeForUser(database.data, request.user);
    const previousPlan = resolveBillingPlan(scoped.workspaceSettings);
    const settings = updateWorkspaceSettings(database.data, request.user.workspaceId, {
      plan: plan.name,
      storageLimitGb: plan.storageLimitGb
    });
    const invoice = {
      id: `inv-${Date.now()}`,
      workspaceId: request.user.workspaceId,
      planId: plan.id,
      plan: plan.name,
      amount: plan.monthlyPrice,
      currency: plan.currency,
      status: plan.monthlyPrice > 0 ? "open" : "paid",
      note: plan.monthlyPrice > 0 ? "Manual billing record pending payment-provider connection" : "Trial plan",
      at: new Date().toISOString()
    };
    database.data.invoices.unshift(invoice);
    await dispatchEvent(database, "billing.plan_changed", `${previousPlan.name} -> ${plan.name}`, { workspaceId: request.user.workspaceId, previousPlan: previousPlan.id, planId: plan.id, invoiceId: invoice.id }, { actor: request.user });
    await database.write();
    return { settings, billing: await buildBillingSummary(workspaceScopeForUser(database.data, request.user), { stripeClient }), invoice };
  });

  app.post("/api/billing/portal", { config: { rateLimit: { ...sensitiveRateLimit, groupId: "billing-portal" } } }, async (request, reply) => {
    if (!hasPermission(request.user, "settings:write")) return reply.code(403).send({ error: "Missing permission: settings:write" });
    const parsed = billingPortalSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid billing portal payload", issues: parsed.error.issues });
    const session = {
      ...await createBillingSession({ data: workspaceScopeForUser(database.data, request.user), user: request.user, returnUrl: parsed.data.returnUrl, requestedPlanId: parsed.data.planId, stripeClient }),
      workspaceId: request.user.workspaceId
    };
    database.data.billingSessions.unshift(session);
    await dispatchEvent(database, "billing.portal_session", `${request.user.email} opened billing management`, { workspaceId: request.user.workspaceId, sessionId: session.id, mode: session.mode }, { actor: request.user });
    await database.write();
    return { session, billing: await buildBillingSummary(workspaceScopeForUser(database.data, request.user), { stripeClient }) };
  });

  app.post("/api/billing/webhook/stripe", { config: { rateLimit: { ...sensitiveRateLimit, groupId: "billing-webhook" } } }, async (request, reply) => {
    const expectedSecret = process.env.LAYERPILOT_STRIPE_WEBHOOK_SECRET || "";
    if (!expectedSecret && process.env.NODE_ENV === "production") return reply.code(503).send({ error: "Stripe webhook secret is required in production" });
    const verified = stripeWebhookPayloadFromRequest(request, expectedSecret);
    if (!verified.ok) return reply.code(verified.statusCode).send({ error: verified.error });
    if (!verified.verified && expectedSecret && request.headers["x-layerpilot-billing-webhook-secret"] !== expectedSecret) return reply.code(401).send({ error: "Invalid billing webhook secret" });
    const parsed = stripeWebhookSchema.safeParse(verified.payload || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid Stripe webhook payload", issues: parsed.error.issues });
    const result = applyStripeBillingEvent(database.data, parsed.data);
    await dispatchEvent(database, "billing.stripe_webhook", `Stripe ${parsed.data.type}`, { eventId: parsed.data.id, eventType: parsed.data.type, planId: result.plan?.id, invoiceId: result.invoice?.id });
    await database.write();
    return { received: true, eventType: parsed.data.type, plan: result.plan || null, invoice: result.invoice || null, billing: await buildBillingSummary(database.data, { stripeClient }) };
  });

  app.patch("/api/costCatalog", async (request, reply) => {
    if (!hasPermission(request.user, "catalog:write")) return reply.code(403).send({ error: "Missing permission: catalog:write" });
    const parsed = costCatalogPatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid cost catalog", issues: parsed.error.issues });
    database.data.costCatalog = costCatalogSchema.parse({
      ...database.data.costCatalog,
      ...parsed.data,
      materialRates: { ...database.data.costCatalog.materialRates, ...(parsed.data.materialRates || {}) }
    });
    await dispatchEvent(database, "cost_catalog.updated", "Cost catalog updated", { workspaceId: request.user.workspaceId, costCatalog: database.data.costCatalog }, { actor: request.user });
    await database.write();
    return database.data.costCatalog;
  });

  app.patch("/api/addons/:id", async (request, reply) => {
    if (!hasPermission(request.user, "settings:write")) return reply.code(403).send({ error: "Missing permission: settings:write" });
    const parsed = addonPatchSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid add-on update", issues: parsed.error.issues });
    const addon = database.data.addons.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!addon) return reply.code(404).send({ error: "Add-on not found" });
    const previousStatus = addon.status;
    const nextStatus = parsed.data.status || (parsed.data.enabled !== undefined ? parsed.data.enabled ? "enabled" : "disabled" : previousStatus);
    addon.status = normalizeAddonStatus(nextStatus);
    addon.enabled = addon.status === "enabled";
    if (parsed.data.config) addon.config = { ...(addon.config || {}), ...parsed.data.config };
    addon.updatedAt = new Date().toISOString();
    addon.updatedBy = request.user.email;
    await dispatchEvent(database, "addon.updated", `${addon.name} ${previousStatus} -> ${addon.status}`, {
      workspaceId: request.user.workspaceId,
      addonId: addon.id,
      name: addon.name,
      previousStatus,
      status: addon.status,
      note: parsed.data.note || ""
    }, { actor: request.user });
    await database.write();
    broadcastRealtime(database, "state", { reason: "addon.updated", state: realtimeState(database.data), addon: sanitizeAddon(addon) });
    return { addon: sanitizeAddon(addon), addons: workspaceScopeForUser(database.data, request.user).addons.map(sanitizeAddon) };
  });

  app.post("/api/quotes", async (request, reply) => {
    const parsed = quoteRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid quote request", issues: parsed.error.issues });
    return calculateQuote(database.data.costCatalog, parsed.data);
  });

  app.post("/api/printers", async (request, reply) => {
    if (!hasPermission(request.user, "printers:control")) return reply.code(403).send({ error: "Missing permission: printers:control" });
    const parsed = printerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid printer payload", issues: parsed.error.issues });
    const exists = database.data.printers.some((item) => item.name.toLowerCase() === parsed.data.name.toLowerCase());
    if (exists) return reply.code(409).send({ error: "Printer name already exists" });
    const printer = {
      id: randomUUID(),
      workspaceId: request.user.workspaceId,
      ...parsed.data,
      job: undefined,
      progress: 0,
      uptime: 100,
      utilization: 0,
      queue: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    database.data.printers.push(printer);
    await dispatchEvent(database, "printer.created", `${printer.name} added`, { printerId: printer.id, connection: printer.connection, buildVolume: printer.buildVolume });
    await database.write();
    return reply.code(201).send(printer);
  });

  app.patch("/api/printers/:id", async (request, reply) => {
    if (!hasPermission(request.user, "printers:control")) return reply.code(403).send({ error: "Missing permission: printers:control" });
    const parsed = printerPatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid printer update", issues: parsed.error.issues });
    const printer = database.data.printers.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!printer) return reply.code(404).send({ error: "Printer not found" });
    if (parsed.data.name && database.data.printers.some((item) => item.id !== printer.id && item.name.toLowerCase() === parsed.data.name.toLowerCase())) {
      return reply.code(409).send({ error: "Printer name already exists" });
    }
    Object.assign(printer, parsed.data, { updatedAt: new Date().toISOString() });
    await dispatchEvent(database, "printer.updated", `${printer.name} updated`, { printerId: printer.id, connection: printer.connection, buildVolume: printer.buildVolume });
    await database.write();
    return printer;
  });

  app.post("/api/commerceConnectors", async (request, reply) => {
    if (!hasPermission(request.user, "commerce:write")) return reply.code(403).send({ error: "Missing permission: commerce:write" });
    const parsed = commerceConnectorSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid commerce connector payload", issues: parsed.error.issues });
    const connector = { id: randomUUID(), workspaceId: request.user.workspaceId, ...parsed.data, lastStatus: "not synced", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    database.data.commerceConnectors.push(connector);
    await dispatchEvent(database, "commerce.connector_created", `${connector.name} configured`, { connectorId: connector.id, source: connector.source });
    await database.write();
    return reply.code(201).send(sanitizeCommerceConnector(connector));
  });

  app.patch("/api/commerceConnectors/:id", async (request, reply) => {
    if (!hasPermission(request.user, "commerce:write")) return reply.code(403).send({ error: "Missing permission: commerce:write" });
    const parsed = commerceConnectorPatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid commerce connector update", issues: parsed.error.issues });
    const connector = database.data.commerceConnectors.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!connector) return reply.code(404).send({ error: "Commerce connector not found" });
    Object.assign(connector, parsed.data, { updatedAt: new Date().toISOString() });
    await dispatchEvent(database, "commerce.connector_updated", `${connector.name} updated`, { connectorId: connector.id, source: connector.source });
    await database.write();
    return sanitizeCommerceConnector(connector);
  });

  app.post("/api/commerceConnectors/:id/test", async (request, reply) => {
    if (!hasPermission(request.user, "commerce:write")) return reply.code(403).send({ error: "Missing permission: commerce:write" });
    const connector = database.data.commerceConnectors.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!connector) return reply.code(404).send({ error: "Commerce connector not found" });
    try {
      const response = await globalThis.fetch(connector.url, {
        method: "GET",
        headers: {
          accept: "application/json,text/csv,text/plain",
          ...(connector.token ? { authorization: `Bearer ${connector.token}` } : {})
        }
      });
      connector.lastStatus = response.ok ? "connected" : "failed";
      connector.lastStatusCode = response.status;
      connector.lastSyncAt = new Date().toISOString();
      await database.write();
      return { connector: sanitizeCommerceConnector(connector), statusCode: response.status, ok: response.ok };
    } catch (error) {
      connector.lastStatus = "failed";
      connector.lastError = error instanceof Error ? error.message : "Connector test failed";
      connector.lastSyncAt = new Date().toISOString();
      await database.write();
      return reply.code(502).send({ error: connector.lastError, connector: sanitizeCommerceConnector(connector) });
    }
  });

  app.post("/api/commerceConnectors/:id/import", async (request, reply) => {
    if (!hasPermission(request.user, "commerce:write") || !hasPermission(request.user, "orders:write")) return reply.code(403).send({ error: "Missing permission: commerce:write and orders:write" });
    const connector = database.data.commerceConnectors.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!connector) return reply.code(404).send({ error: "Commerce connector not found" });
    if (!connector.enabled) return reply.code(409).send({ error: "Commerce connector is disabled" });
    try {
      const response = await globalThis.fetch(connector.url, {
        method: "GET",
        headers: {
          accept: "application/json,text/csv,text/plain",
          ...(connector.token ? { authorization: `Bearer ${connector.token}` } : {})
        }
      });
      const text = await response.text();
      if (!response.ok) {
        connector.lastStatus = "failed";
        connector.lastStatusCode = response.status;
        connector.lastError = text.slice(0, 180);
        connector.lastSyncAt = new Date().toISOString();
        await database.write();
        return reply.code(502).send({ error: "Connector feed request failed", statusCode: response.status, connector: sanitizeCommerceConnector(connector) });
      }
      let records = [];
      try {
        const parsedJson = JSON.parse(text);
        records = Array.isArray(parsedJson) ? parsedJson : Array.isArray(parsedJson.orders) ? parsedJson.orders : [];
      } catch {
        records = parseCsvText(text);
      }
      const result = await importCommerceOrders(database, { records, source: connector.source, connectorId: connector.id, connectorName: connector.name, workspaceId: request.user.workspaceId });
      connector.lastStatus = "imported";
      connector.lastStatusCode = response.status;
      connector.lastError = "";
      connector.lastSyncAt = new Date().toISOString();
      await database.write();
      return { ...result, connector: sanitizeCommerceConnector(connector) };
    } catch (error) {
      connector.lastStatus = "failed";
      connector.lastError = error instanceof Error ? error.message : "Connector import failed";
      connector.lastSyncAt = new Date().toISOString();
      await database.write();
      return reply.code(502).send({ error: connector.lastError, connector: sanitizeCommerceConnector(connector) });
    }
  });

  app.post("/api/commerce/import-csv", async (request, reply) => {
    if (!hasPermission(request.user, "commerce:write") || !hasPermission(request.user, "orders:write")) return reply.code(403).send({ error: "Missing permission: commerce:write and orders:write" });
    const parsed = commerceCsvImportSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid commerce CSV import", issues: parsed.error.issues });
    const records = parseCsvText(parsed.data.csv);
    const result = await importCommerceOrders(database, { records, source: parsed.data.source, connectorName: "CSV import", workspaceId: request.user.workspaceId });
    await database.write();
    return result;
  });

  app.post("/api/file-folders", async (request, reply) => {
    if (!hasPermission(request.user, "files:write")) return reply.code(403).send({ error: "Missing permission: files:write" });
    const parsed = fileFolderSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid file folder payload", issues: parsed.error.issues });
    const result = ensureFileFolder(database.data, { ...parsed.data, workspaceId: request.user.workspaceId });
    await dispatchEvent(database, result.created ? "file_folder.created" : "file_folder.reused", `${result.folder.name} folder ${result.created ? "created" : "reused"}`, { folderId: result.folder.id, name: result.folder.name });
    await database.write();
    return reply.code(result.created ? 201 : 200).send({ ...result, folders: database.data.fileFolders });
  });

  app.post("/api/files", async (request, reply) => {
    if (!hasPermission(request.user, "files:write")) return reply.code(403).send({ error: "Missing permission: files:write" });
    const parsed = fileSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid file payload", issues: parsed.error.issues });
    const minutes = parsed.data.estimateMinutes || 60;
    const hours = Math.floor(minutes / 60);
    const remainder = String(minutes % 60).padStart(2, "0");
    const quote = calculateQuote(database.data.costCatalog, { material: parsed.data.material, grams: parsed.data.estimateGrams, minutes });
    const file = {
      id: randomUUID(),
      workspaceId: request.user.workspaceId,
      ...parsed.data,
      sliced: parsed.data.type === "GCODE",
      status: parsed.data.type === "GCODE" ? "sliced" : "uploaded",
      version: 1,
      thumbnail: parsed.data.thumbnail || parsed.data.name,
      printTime: `${hours}h ${remainder}m`,
      cost: parsed.data.quote || quote.total,
      usage: parsed.data.estimateGrams,
      quote: parsed.data.quote || quote.total,
      quoteBreakdown: quote
    };
    database.data.files.push(file);
    database.data.events.unshift({ id: randomUUID(), type: "file.created", message: file.name, at: new Date().toISOString() });
    await database.write();
    return reply.code(201).send(file);
  });

  app.post("/api/files/sample", async (request, reply) => {
    if (!hasPermission(request.user, "files:write")) return reply.code(403).send({ error: "Missing permission: files:write" });
    const parsed = sampleFileSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid sample file payload", issues: parsed.error.issues });
    const result = await createSampleFile(database, parsed.data, { workspaceId: request.user.workspaceId });
    await dispatchEvent(database, "file.sample_generated", `${result.file.name} sample STL generated`, { fileId: result.file.id, folderId: result.folder.id, stlBytes: result.stlBytes });
    await database.write();
    return reply.code(201).send({ ...result, files: database.data.files, folders: database.data.fileFolders });
  });

  app.post("/api/hot-drop", async (request, reply) => {
    if (!hasPermission(request.user, "files:write")) return reply.code(403).send({ error: "Missing permission: files:write" });
    const parsed = hotDropRequestSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid hot drop payload", issues: parsed.error.issues });
    const scoped = workspaceScopeForUser(database.data, request.user);
    const mode = parsed.data.mode || scoped.workspaceSettings?.hotDropMode || "Direct Print";
    if (mode !== "Upload Only" && !hasPermission(request.user, "queue:write")) return reply.code(403).send({ error: "Missing permission: queue:write" });
    const printer = mode === "Upload Only"
      ? null
      : database.data.printers.find((item) => itemInWorkspace(item, request.user.workspaceId) && !["offline", "maintenance"].includes(item.status)) || scoped.printers[0];
    if (mode !== "Upload Only" && !printer) return reply.code(404).send({ error: "Printer not found" });

    const result = await createSampleFile(database, { name: parsed.data.name, material: parsed.data.material, folder: parsed.data.folder }, { workspaceId: request.user.workspaceId });
    result.file.tags = Array.from(new Set([...(result.file.tags || []), "hot-drop", mode.toLowerCase().replace(" ", "-")]));
    await dispatchEvent(database, "file.sample_generated", `${result.file.name} generated from Hot Drop`, { fileId: result.file.id, folderId: result.folder.id, stlBytes: result.stlBytes, mode });

    let job = null;
    let match = null;
    if (mode !== "Upload Only" && printer) {
      const printable = result.file.sliced || result.file.type === "GCODE";
      job = {
        id: randomUUID(),
        workspaceId: request.user.workspaceId,
        fileId: result.file.id,
        file: result.file.name,
        printerId: printer.id,
        printer: printer.name,
        status: "queued",
        priority: "Normal",
        stage: printable ? "needs scheduling" : "needs slicing",
        material: result.file.material,
        color: (result.file.tags || []).includes("resin") ? "Gray" : "Any",
        due: "Tomorrow 17:00",
        dimensions: result.file.dimensions,
        assignee: printable ? "Scheduler" : "Slicer",
        time: result.file.printTime,
        cost: result.file.cost,
        added: "Hot Drop"
      };
      job.scheduleWarnings = getScheduleWarnings(database.data, job, printer);
      database.data.queue.push(job);
      await dispatchEvent(database, "queue.created", `${job.file} queued from Hot Drop`, { jobId: job.id, fileId: job.fileId, printerId: job.printerId, material: job.material, mode });
      if (mode === "Direct Print" && printable) {
        match = matchQueueNow(workspaceScopeForUser(database.data, request.user), { dryRun: false, maxActiveSlots: 3, respectMaterial: true, respectBuildVolume: true });
        await dispatchEvent(database, "queue.matched", `${match.matches.length} Hot Drop jobs started`, { matches: match.matches.map((item) => ({ jobId: item.jobId, printerId: item.printerId })), skipped: match.skipped.length, mode });
      }
    }

    await dispatchEvent(database, "hot_drop.handled", `Hot Drop handled as ${mode}`, { mode, fileId: result.file.id, jobId: job?.id || "", directMatched: Boolean(match?.matches?.length) });
    await database.write();
    return reply.code(201).send({
      mode,
      file: result.file,
      folder: result.folder,
      stlBytes: result.stlBytes,
      job,
      match,
      files: database.data.files,
      folders: database.data.fileFolders,
      queue: database.data.queue,
      printers: database.data.printers,
      todos: deriveTodos(workspaceScopeForUser(database.data, request.user))
    });
  });

  app.post("/api/files/upload", async (request, reply) => {
    if (!hasPermission(request.user, "files:write")) return reply.code(403).send({ error: "Missing permission: files:write" });
    const part = await request.file();
    if (!part) return reply.code(400).send({ error: "No file uploaded" });
    const filename = path.basename(part.filename || "model.stl");
    const material = typeof part.fields?.material?.value === "string" ? part.fields.material.value : "PLA";
    const folder = typeof part.fields?.folder?.value === "string" ? part.fields.folder.value : "Uploads";
    const buffer = await part.toBuffer();
    const workspaceId = request.user.workspaceId || DEFAULT_WORKSPACE_ID;
    const actorId = idempotencyActorForRequest(request);
    const bodyDigest = uploadRequestBodyDigest({ filename, material, folder, buffer });
    if (await prepareIdempotentRequest(database, request, reply, { workspaceId, actorId, bodyDigest })) return;
    const { file } = await createStoredModelFile(database, { filename, buffer, material, folder, tags: ["uploaded", "parsed"], source: "Operator upload" }, { workspaceId: request.user.workspaceId });
    await dispatchEvent(database, "file.uploaded", `${filename} parsed and stored`, { fileId: file.id, filename, material, folder: file.folder, bytes: buffer.length }, { actor: request.user });
    await database.write();
    return reply.code(201).send(file);
  });

  app.post("/api/parametric/nameplate", async (request, reply) => {
    if (!hasPermission(request.user, "files:write") || !hasPermission(request.user, "catalog:write")) return reply.code(403).send({ error: "Missing permission: files:write and catalog:write" });
    const parsed = parametricNameplateSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid parametric nameplate payload", issues: parsed.error.issues });
    const result = await createParametricNameplate(database, parsed.data, { workspaceId: request.user.workspaceId });
    await dispatchEvent(database, "parametric.generated", `${result.file.name} generated`, { fileId: result.file.id, partId: result.part?.id || "", generator: result.file.parametric.generator, estimates: result.estimates });
    await database.write();
    return reply.code(201).send({ ...result, files: database.data.files, parts: database.data.parts });
  });

  app.get("/api/files/:id/download", async (request, reply) => {
    const file = database.data.files.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!file) return reply.code(404).send({ error: "File not found" });
    const filename = path.basename(file.name || file.storageKey || file.storagePath || `${file.id}.json`);
    if (file.storagePath) {
      try {
        const bytes = await readStoredObject(file);
        reply.header("content-disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
        reply.type(file.type === "GCODE" ? "text/x-gcode" : "application/octet-stream");
        return bytes;
      } catch {
        // Fall back to a metadata manifest below when stored bytes are not available.
      }
    }
    reply.header("content-disposition", `attachment; filename="${path.basename(file.name, path.extname(file.name)) || file.id}.layerpilot.json"`);
    reply.type("application/json");
    return JSON.stringify({ exportedAt: new Date().toISOString(), file }, null, 2);
  });

  app.get("/api/files/:id/preview", async (request, reply) => {
    const file = database.data.files.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!file) return reply.code(404).send({ error: "File not found" });
    let buffer = null;
    if (file.storagePath || file.storageKey) {
      try {
        buffer = await readStoredObject(file);
      } catch {
        buffer = null;
      }
    }
    return buildFilePreview(file, buffer, workspaceScopeForUser(database.data, request.user));
  });

  app.delete("/api/files/:id", async (request, reply) => {
    if (!hasPermission(request.user, "files:write")) return reply.code(403).send({ error: "Missing permission: files:write" });
    const file = database.data.files.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!file) return reply.code(404).send({ error: "File not found" });
    const force = request.query?.force === "true" || request.query?.force === true;
    const references = fileReferences(database.data, file.id);
    if (!force && hasReferences(references)) {
      return reply.code(409).send({ error: "File is still referenced", references });
    }
    const removedStorage = await removeStoredFile(file);
    database.data.files = database.data.files.filter((item) => item.id !== file.id);
    database.data.queue = (database.data.queue || []).filter((job) => job.fileId !== file.id || ["complete", "failed", "cancelled"].includes(job.status));
    await dispatchEvent(database, "file.deleted", `${file.name} deleted`, { fileId: file.id, removedStorage, force, references });
    await database.write();
    return { ok: true, file, removedStorage, references };
  });

  app.post("/api/spools", async (request, reply) => {
    if (!hasPermission(request.user, "inventory:write")) return reply.code(403).send({ error: "Missing permission: inventory:write" });
    const parsed = spoolSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid spool payload", issues: parsed.error.issues });
    const spool = { id: randomUUID(), workspaceId: request.user.workspaceId, ...parsed.data, updatedAt: new Date().toISOString() };
    database.data.spools.push(spool);
    database.data.events.unshift({ id: randomUUID(), type: "spool.created", message: `${spool.material} ${spool.brand} added`, at: spool.updatedAt });
    await database.write();
    return reply.code(201).send(spool);
  });

  app.post("/api/spools/labels", async (request, reply) => {
    if (!hasPermission(request.user, "inventory:write")) return reply.code(403).send({ error: "Missing permission: inventory:write" });
    const parsed = spoolLabelsSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid label payload", issues: parsed.error.issues });
    const selectedIds = new Set(parsed.data.ids);
    const selected = (database.data.spools || [])
      .filter((spool) => itemInWorkspace(spool, request.user.workspaceId) && (!selectedIds.size || selectedIds.has(spool.id)) && (parsed.data.includeEmpty || Number(spool.remaining ?? 0) > 0));
    const exportPayload = buildSpoolLabelExport(selected);
    await dispatchEvent(database, "spool.labels_generated", `${exportPayload.count} spool labels generated`, { count: exportPayload.count, spoolIds: selected.map((spool) => spool.id) });
    await database.write();
    return exportPayload;
  });

  app.get("/api/spools/scan", async (request, reply) => {
    const code = String(request.query?.code || "").trim();
    if (!code) return reply.code(400).send({ error: "Missing scan code" });
    const spool = findSpoolByCode(scopedWorkspaceData(database.data, request.user.workspaceId).spools, code);
    if (!spool) return reply.code(404).send({ error: "Spool not found", code });
    return { spool, matchedBy: spool.nfc === code ? "nfc" : spool.id === code ? "id" : "label", usageLogged: 0, warnings: Number(spool.remaining || 0) < 150 ? ["Low stock"] : [] };
  });

  app.post("/api/spools/scan", async (request, reply) => {
    if (!hasPermission(request.user, "inventory:write")) return reply.code(403).send({ error: "Missing permission: inventory:write" });
    const parsed = spoolScanSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid scan payload", issues: parsed.error.issues });
    const spool = findSpoolByCode(scopedWorkspaceData(database.data, request.user.workspaceId).spools, parsed.data.code);
    if (!spool) return reply.code(404).send({ error: "Spool not found", code: parsed.data.code });
    const previousRemaining = Number(spool.remaining || 0);
    if (parsed.data.location) spool.location = parsed.data.location;
    if (parsed.data.grams) spool.remaining = Math.max(0, previousRemaining - parsed.data.grams);
    spool.updatedAt = new Date().toISOString();
    const warnings = [];
    if (spool.remaining <= 0) warnings.push("Spool empty");
    else if (spool.remaining < 150) warnings.push("Low stock");
    await dispatchEvent(database, parsed.data.grams ? "spool.scanned_usage" : "spool.scanned", parsed.data.grams ? `${parsed.data.grams}g scanned for ${spool.material}` : `${spool.material} spool scanned`, {
      spoolId: spool.id,
      code: parsed.data.code,
      location: spool.location,
      previousRemaining,
      remaining: spool.remaining,
      grams: parsed.data.grams || 0,
      warnings
    });
    await database.write();
    return { spool, matchedBy: spool.nfc === parsed.data.code ? "nfc" : spool.id === parsed.data.code ? "id" : "label", usageLogged: parsed.data.grams || 0, warnings, spools: database.data.spools };
  });

  app.patch("/api/spools/:id", async (request, reply) => {
    if (!hasPermission(request.user, "inventory:write")) return reply.code(403).send({ error: "Missing permission: inventory:write" });
    const parsed = spoolPatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid spool update", issues: parsed.error.issues });
    const spool = database.data.spools.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!spool) return reply.code(404).send({ error: "Spool not found" });
    Object.assign(spool, parsed.data, { remaining: Math.min(parsed.data.remaining ?? spool.remaining, parsed.data.weight ?? spool.weight), updatedAt: new Date().toISOString() });
    database.data.events.unshift({ id: randomUUID(), type: "spool.updated", message: `${spool.material} ${spool.brand} updated`, at: spool.updatedAt });
    await database.write();
    return spool;
  });

  app.patch("/api/spools/:id/usage", async (request, reply) => {
    if (!hasPermission(request.user, "inventory:write")) return reply.code(403).send({ error: "Missing permission: inventory:write" });
    const parsed = spoolUsageSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid usage payload", issues: parsed.error.issues });
    const spool = database.data.spools.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!spool) return reply.code(404).send({ error: "Spool not found" });
    spool.remaining = Math.max(0, Number(spool.remaining || 0) - parsed.data.grams);
    spool.updatedAt = new Date().toISOString();
    await dispatchEvent(database, "spool.usage", `${parsed.data.grams}g logged for ${spool.material}`, { spoolId: spool.id, material: spool.material, remaining: spool.remaining, grams: parsed.data.grams });
    await database.write();
    return spool;
  });

  app.post("/api/purchaseRequests", async (request, reply) => {
    if (!hasPermission(request.user, "inventory:write")) return reply.code(403).send({ error: "Missing permission: inventory:write" });
    const parsed = purchaseRequestSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid purchase request payload", issues: parsed.error.issues });
    if (parsed.data.spoolId && !database.data.spools.some((spool) => spool.id === parsed.data.spoolId && itemInWorkspace(spool, request.user.workspaceId))) return reply.code(404).send({ error: "Linked spool not found" });
    const now = new Date().toISOString();
    const purchaseRequest = { id: randomUUID(), workspaceId: request.user.workspaceId, ...parsed.data, createdAt: now, updatedAt: now };
    database.data.purchaseRequests.unshift(purchaseRequest);
    await dispatchEvent(database, "purchase_request.created", `${purchaseRequest.material} reorder request created`, { purchaseRequestId: purchaseRequest.id, material: purchaseRequest.material, quantity: purchaseRequest.quantity });
    await database.write();
    return reply.code(201).send(purchaseRequest);
  });

  app.post("/api/purchaseRequests/reorderPlan", async (request, reply) => {
    if (!hasPermission(request.user, "inventory:write")) return reply.code(403).send({ error: "Missing permission: inventory:write" });
    const parsed = purchaseReorderPlanSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid reorder plan payload", issues: parsed.error.issues });
    const result = createReorderPlan(database.data, request.user.workspaceId, parsed.data);
    await dispatchEvent(database, "purchase_request.reorder_plan", `${result.created.length} reorder requests created`, { created: result.created.map((item) => item.id), skipped: result.skipped.length, thresholdGrams: result.thresholdGrams });
    await database.write();
    return result;
  });

  app.patch("/api/purchaseRequests/:id", async (request, reply) => {
    if (!hasPermission(request.user, "inventory:write")) return reply.code(403).send({ error: "Missing permission: inventory:write" });
    const parsed = purchaseRequestPatchSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid purchase request update", issues: parsed.error.issues });
    if (parsed.data.spoolId && !database.data.spools.some((spool) => spool.id === parsed.data.spoolId && itemInWorkspace(spool, request.user.workspaceId))) return reply.code(404).send({ error: "Linked spool not found" });
    const purchaseRequest = database.data.purchaseRequests.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!purchaseRequest) return reply.code(404).send({ error: "Purchase request not found" });
    const rawPatch = request.body && typeof request.body === "object" ? request.body : {};
    const patch = Object.fromEntries(Object.entries(parsed.data).filter(([key]) => Object.prototype.hasOwnProperty.call(rawPatch, key)));
    Object.assign(purchaseRequest, patch, { updatedAt: new Date().toISOString() });
    await dispatchEvent(database, "purchase_request.updated", `${purchaseRequest.material} reorder request ${purchaseRequest.status}`, { purchaseRequestId: purchaseRequest.id, status: purchaseRequest.status });
    await database.write();
    return purchaseRequest;
  });

  app.post("/api/purchaseRequests/:id/receive", async (request, reply) => {
    if (!hasPermission(request.user, "inventory:write")) return reply.code(403).send({ error: "Missing permission: inventory:write" });
    const parsed = purchaseReceiveSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid receive payload", issues: parsed.error.issues });
    const result = receivePurchaseRequest(database.data, request.params.id, request.user.workspaceId, parsed.data);
    if (result.error) return reply.code(result.statusCode || 400).send({ error: result.error });
    await dispatchEvent(database, "purchase_request.received", `${result.spools.length} ${result.request.material} spools received`, { purchaseRequestId: result.request.id, spoolIds: result.spools.map((spool) => spool.id) });
    await database.write();
    return result;
  });

  app.post("/api/maintenance", async (request, reply) => {
    if (!hasPermission(request.user, "maintenance:write")) return reply.code(403).send({ error: "Missing permission: maintenance:write" });
    const parsed = maintenanceSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid maintenance payload", issues: parsed.error.issues });
    const job = { id: randomUUID(), workspaceId: request.user.workspaceId, ...parsed.data, updatedAt: new Date().toISOString() };
    database.data.maintenance.push(job);
    database.data.events.unshift({ id: randomUUID(), type: "maintenance.created", message: `${job.title} for ${job.printer}`, at: job.updatedAt });
    await database.write();
    return reply.code(201).send(job);
  });

  app.patch("/api/maintenance/:id", async (request, reply) => {
    if (!hasPermission(request.user, "maintenance:write")) return reply.code(403).send({ error: "Missing permission: maintenance:write" });
    const parsed = maintenancePatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid maintenance update", issues: parsed.error.issues });
    const job = database.data.maintenance.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!job) return reply.code(404).send({ error: "Maintenance job not found" });
    Object.assign(job, parsed.data, { updatedAt: new Date().toISOString() });
    database.data.events.unshift({ id: randomUUID(), type: "maintenance.updated", message: `${job.title} -> ${job.status}`, at: job.updatedAt });
    await database.write();
    return job;
  });

  app.post("/api/maintenance/templates", async (request, reply) => {
    if (!hasPermission(request.user, "maintenance:write")) return reply.code(403).send({ error: "Missing permission: maintenance:write" });
    const parsed = maintenanceTemplateSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid maintenance template payload", issues: parsed.error.issues });
    const existing = (database.data.maintenanceTemplates || []).find((template) => itemInWorkspace(template, request.user.workspaceId) && template.title.toLowerCase() === parsed.data.title.toLowerCase() && template.printerModel.toLowerCase() === parsed.data.printerModel.toLowerCase());
    if (existing) {
      Object.assign(existing, parsed.data, { updatedAt: new Date().toISOString() });
      await dispatchEvent(database, "maintenance_template.updated", `${existing.title} template updated`, { templateId: existing.id });
      await database.write();
      return { template: existing, templates: database.data.maintenanceTemplates, created: false };
    }
    const template = { id: randomUUID(), workspaceId: request.user.workspaceId, ...parsed.data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    database.data.maintenanceTemplates.unshift(template);
    await dispatchEvent(database, "maintenance_template.created", `${template.title} template saved`, { templateId: template.id, intervalDays: template.intervalDays });
    await database.write();
    return reply.code(201).send({ template, templates: database.data.maintenanceTemplates, created: true });
  });

  app.post("/api/maintenance/reports", async (request, reply) => {
    if (!hasPermission(request.user, "maintenance:write")) return reply.code(403).send({ error: "Missing permission: maintenance:write" });
    const parsed = maintenanceReportSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid maintenance report payload", issues: parsed.error.issues });
    const now = new Date().toISOString();
    const report = { id: randomUUID(), workspaceId: request.user.workspaceId, ...parsed.data, status: "open", createdAt: now, updatedAt: now, createdBy: request.user.email };
    database.data.maintenanceReports.unshift(report);
    let job = null;
    if (parsed.data.createJob) {
      job = {
        id: randomUUID(),
        workspaceId: request.user.workspaceId,
        title: parsed.data.title,
        printer: parsed.data.printer,
        status: "scheduled",
        due: "Today",
        progress: "0/4",
        severity: parsed.data.severity,
        reportId: report.id,
        updatedAt: now
      };
      database.data.maintenance.push(job);
      report.linkedJobId = job.id;
    }
    await dispatchEvent(database, "maintenance_report.created", `${report.title} reported for ${report.printer}`, { reportId: report.id, jobId: job?.id || "", severity: report.severity });
    await database.write();
    return reply.code(201).send({ report, job, reports: database.data.maintenanceReports, maintenance: database.data.maintenance });
  });

  app.post("/api/orders", async (request, reply) => {
    if (!hasPermission(request.user, "orders:write")) return reply.code(403).send({ error: "Missing permission: orders:write" });
    const parsed = orderSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid order payload", issues: parsed.error.issues });
    const order = { id: `ord-${1000 + database.data.orders.length + 1}`, workspaceId: request.user.workspaceId, ...parsed.data, updatedAt: new Date().toISOString() };
    database.data.orders.push(order);
    await dispatchEvent(database, "order.created", `${order.id} from ${order.source}`, { orderId: order.id, source: order.source, customer: order.customer }, { actor: request.user, at: order.updatedAt });
    await database.write();
    return reply.code(201).send(order);
  });

  app.patch("/api/quoteRequests/:id", async (request, reply) => {
    if (!hasPermission(request.user, "orders:write")) return reply.code(403).send({ error: "Missing permission: orders:write" });
    const parsed = quoteRequestPatchSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid quote request update", issues: parsed.error.issues });
    const quote = database.data.quoteRequests.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!quote) return reply.code(404).send({ error: "Quote request not found" });
    Object.assign(quote, parsed.data, { updatedAt: new Date().toISOString(), reviewedBy: request.user.email });
    await dispatchEvent(database, "quote_request.updated", `${quote.id} -> ${quote.status}`, { quoteRequestId: quote.id, status: quote.status, quotedValue: quote.quotedValue || 0 });
    await database.write();
    return quote;
  });

  app.post("/api/quoteRequests/:id/customer-link", async (request, reply) => {
    if (!hasPermission(request.user, "orders:write")) return reply.code(403).send({ error: "Missing permission: orders:write" });
    const parsed = quoteCustomerLinkSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid quote customer link payload", issues: parsed.error.issues });
    const quote = database.data.quoteRequests.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!quote) return reply.code(404).send({ error: "Quote request not found" });
    if (parsed.data.rotate || !quote.customerAccessToken) quote.customerAccessToken = randomBytes(18).toString("base64url");
    quote.portalLinkGeneratedAt = new Date().toISOString();
    quote.portalLinkGeneratedBy = request.user.email;
    quote.updatedAt = quote.portalLinkGeneratedAt;
    const url = publicQuoteUrl(request, quote);
    await dispatchEvent(database, parsed.data.rotate ? "quote_request.portal_link_rotated" : "quote_request.portal_link_generated", `${quote.id} customer portal link ${parsed.data.rotate ? "rotated" : "generated"}`, { workspaceId: request.user.workspaceId, quoteRequestId: quote.id });
    await database.write();
    return { quoteRequest: quote, url, accessToken: quote.customerAccessToken };
  });

  app.post("/api/quoteRequests/:id/convert-order", async (request, reply) => {
    if (!hasPermission(request.user, "orders:write")) return reply.code(403).send({ error: "Missing permission: orders:write" });
    const parsed = quoteConvertSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid quote conversion payload", issues: parsed.error.issues });
    const quote = database.data.quoteRequests.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!quote) return reply.code(404).send({ error: "Quote request not found" });
    if (quote.orderId) return reply.code(409).send({ error: "Quote request already converted", orderId: quote.orderId });
    const result = convertQuoteToProduction(database.data, quote, { workspaceId: request.user.workspaceId, due: parsed.data.due, value: parsed.data.value, createJob: parsed.data.createJob, reviewedBy: request.user.email });
    if (result.error) return reply.code(result.statusCode || 400).send({ error: result.error, orderId: result.orderId });
    await dispatchEvent(database, "quote_request.converted", `${quote.id} converted to ${result.order.id}`, { workspaceId: request.user.workspaceId, quoteRequestId: quote.id, orderId: result.order.id, value: result.order.value });
    if (result.job) await dispatchEvent(database, "queue.created", `${result.job.file} queued from quote`, { workspaceId: request.user.workspaceId, jobId: result.job.id, fileId: result.job.fileId, orderId: result.order.id, quoteRequestId: quote.id, material: result.job.material });
    await database.write();
    return reply.code(201).send(result);
  });

  app.patch("/api/orders/:id/status", async (request, reply) => {
    if (!hasPermission(request.user, "orders:write")) return reply.code(403).send({ error: "Missing permission: orders:write" });
    const parsed = z.object({ status: orderStatusSchema }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid order status", issues: parsed.error.issues });
    const order = database.data.orders.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!order) return reply.code(404).send({ error: "Order not found" });
    const result = applyOrderStatusChange(database.data, order, parsed.data.status);
    await dispatchEvent(database, "order.status", `${order.id} -> ${order.status}`, { workspaceId: request.user.workspaceId, orderId: order.id, status: order.status, jobs: result.jobs.map((job) => job.id), materialChanges: result.materialChanges });
    await database.write();
    return { ...result.order, order: result.order, jobs: result.jobs, materialChanges: result.materialChanges, spools: result.spools, todos: result.todos };
  });

  app.post("/api/parts", async (request, reply) => {
    if (!hasPermission(request.user, "catalog:write")) return reply.code(403).send({ error: "Missing permission: catalog:write" });
    const parsed = partSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid part payload", issues: parsed.error.issues });
    if (!database.data.files.some((file) => file.id === parsed.data.fileId && itemInWorkspace(file, request.user.workspaceId))) return reply.code(404).send({ error: "Linked file not found" });
    const part = { id: randomUUID(), workspaceId: request.user.workspaceId, ...parsed.data, updatedAt: new Date().toISOString() };
    database.data.parts.push(part);
    await dispatchEvent(database, "part.created", part.name, { partId: part.id, fileId: part.fileId, material: part.material }, { actor: request.user, at: part.updatedAt });
    await database.write();
    return reply.code(201).send(part);
  });

  app.patch("/api/parts/:id", async (request, reply) => {
    if (!hasPermission(request.user, "catalog:write")) return reply.code(403).send({ error: "Missing permission: catalog:write" });
    const parsed = partPatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid part update", issues: parsed.error.issues });
    if (parsed.data.fileId && !database.data.files.some((file) => file.id === parsed.data.fileId && itemInWorkspace(file, request.user.workspaceId))) return reply.code(404).send({ error: "Linked file not found" });
    const part = database.data.parts.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!part) return reply.code(404).send({ error: "Part not found" });
    Object.assign(part, parsed.data, { updatedAt: new Date().toISOString() });
    await dispatchEvent(database, "part.updated", part.name, { partId: part.id, fileId: part.fileId, material: part.material }, { actor: request.user, at: part.updatedAt });
    await database.write();
    return part;
  });

  app.post("/api/productionTemplates", async (request, reply) => {
    if (!hasPermission(request.user, "catalog:write")) return reply.code(403).send({ error: "Missing permission: catalog:write" });
    const parsed = productionTemplateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid production template payload", issues: parsed.error.issues });
    const file = database.data.files.find((item) => item.id === parsed.data.fileId && itemInWorkspace(item, request.user.workspaceId));
    if (!file) return reply.code(404).send({ error: "Linked file not found" });
    if (parsed.data.printerId && !database.data.printers.some((item) => item.id === parsed.data.printerId && itemInWorkspace(item, request.user.workspaceId))) return reply.code(404).send({ error: "Printer not found" });
    const duplicate = database.data.productionTemplates.some((item) => itemInWorkspace(item, request.user.workspaceId) && item.name.toLowerCase() === parsed.data.name.toLowerCase());
    if (duplicate) return reply.code(409).send({ error: "Production template already exists" });
    const template = { id: randomUUID(), workspaceId: request.user.workspaceId, ...parsed.data, runCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    database.data.productionTemplates.unshift(template);
    await dispatchEvent(database, "production_template.created", `${template.name} template saved`, { templateId: template.id, fileId: template.fileId, sku: template.sku });
    await database.write();
    return reply.code(201).send(template);
  });

  app.patch("/api/productionTemplates/:id", async (request, reply) => {
    if (!hasPermission(request.user, "catalog:write")) return reply.code(403).send({ error: "Missing permission: catalog:write" });
    const parsed = productionTemplatePatchSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid production template update", issues: parsed.error.issues });
    if (parsed.data.fileId && !database.data.files.some((item) => item.id === parsed.data.fileId && itemInWorkspace(item, request.user.workspaceId))) return reply.code(404).send({ error: "Linked file not found" });
    if (parsed.data.printerId && !database.data.printers.some((item) => item.id === parsed.data.printerId && itemInWorkspace(item, request.user.workspaceId))) return reply.code(404).send({ error: "Printer not found" });
    const template = database.data.productionTemplates.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!template) return reply.code(404).send({ error: "Production template not found" });
    Object.assign(template, parsed.data, { updatedAt: new Date().toISOString() });
    await dispatchEvent(database, "production_template.updated", `${template.name} template updated`, { templateId: template.id });
    await database.write();
    return template;
  });

  app.post("/api/productionTemplates/:id/run", async (request, reply) => {
    if (!hasPermission(request.user, "catalog:write") || !hasPermission(request.user, "queue:write")) return reply.code(403).send({ error: "Missing permission: catalog:write and queue:write" });
    const parsed = productionTemplateRunSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid production template run payload", issues: parsed.error.issues });
    const result = createJobsFromProductionTemplate(database.data, request.params.id, { ...parsed.data, workspaceId: request.user.workspaceId });
    if (result.error) return reply.code(result.statusCode || 400).send({ error: result.error });
    if (!result.dryRun) {
      await dispatchEvent(database, "production_template.run", `${result.jobs.length} jobs created from ${result.template.name}`, { templateId: result.template.id, jobs: result.jobs.map((job) => job.id) });
      await database.write();
    }
    return result;
  });

  app.post("/api/profiles", async (request, reply) => {
    if (!hasPermission(request.user, "catalog:write")) return reply.code(403).send({ error: "Missing permission: catalog:write" });
    const parsed = profileSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid profile payload", issues: parsed.error.issues });
    const exists = database.data.profiles.some((profile) => itemInWorkspace(profile, request.user.workspaceId) && profile.name.toLowerCase() === parsed.data.name.toLowerCase() && profile.kind === parsed.data.kind);
    if (exists) return reply.code(409).send({ error: "Profile already exists" });
    const profile = { id: randomUUID(), workspaceId: request.user.workspaceId, ...parsed.data, updated: "Just now", updatedAt: new Date().toISOString() };
    database.data.profiles.push(profile);
    await dispatchEvent(database, "profile.created", `${profile.name} profile created`, { profileId: profile.id, kind: profile.kind, source: profile.source });
    await database.write();
    return reply.code(201).send(profile);
  });

  app.post("/api/profiles/import", async (request, reply) => {
    if (!hasPermission(request.user, "catalog:write")) return reply.code(403).send({ error: "Missing permission: catalog:write" });
    const parsed = profileImportSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid profile import payload", issues: parsed.error.issues });
    const drafts = parseProfileImportPayload(parsed.data);
    if (!drafts.length) return reply.code(400).send({ error: "No profiles could be parsed" });
    const imported = [];
    const skipped = [];
    for (const draft of drafts) {
      const duplicate = database.data.profiles.find((profile) => itemInWorkspace(profile, request.user.workspaceId) && profile.name.toLowerCase() === draft.name.toLowerCase() && profile.kind === draft.kind);
      if (duplicate) {
        skipped.push({ name: draft.name, kind: draft.kind, reason: "Duplicate profile", profileId: duplicate.id });
        continue;
      }
      const profile = { id: randomUUID(), workspaceId: request.user.workspaceId, ...draft, updated: "Just now", updatedAt: new Date().toISOString() };
      database.data.profiles.push(profile);
      imported.push(profile);
    }
    await dispatchEvent(database, "profile.imported", `${imported.length} profiles imported from ${parsed.data.source}`, { source: parsed.data.source, imported: imported.map((profile) => profile.id), skipped });
    await database.write();
    return { imported, skipped, profiles: database.data.profiles };
  });

  app.patch("/api/profiles/:id", async (request, reply) => {
    if (!hasPermission(request.user, "catalog:write")) return reply.code(403).send({ error: "Missing permission: catalog:write" });
    const parsed = profilePatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid profile update", issues: parsed.error.issues });
    const profile = database.data.profiles.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!profile) return reply.code(404).send({ error: "Profile not found" });
    Object.assign(profile, parsed.data, { updated: "Just now", updatedAt: new Date().toISOString() });
    await dispatchEvent(database, "profile.updated", `${profile.name} profile updated`, { profileId: profile.id, kind: profile.kind });
    await database.write();
    return profile;
  });

  app.patch("/api/profiles/:id/default", async (request, reply) => {
    if (!hasPermission(request.user, "catalog:write")) return reply.code(403).send({ error: "Missing permission: catalog:write" });
    const profile = database.data.profiles.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!profile) return reply.code(404).send({ error: "Profile not found" });
    database.data.profileDefaults ||= {};
    database.data.profileDefaults[profile.kind] = profile.id;
    profile.default = true;
    profile.updated = "Just now";
    profile.updatedAt = new Date().toISOString();
    await dispatchEvent(database, "profile.default_set", `${profile.name} set as default ${profile.kind} profile`, { profileId: profile.id, kind: profile.kind, defaults: database.data.profileDefaults });
    await database.write();
    return { profile, profileDefaults: database.data.profileDefaults, profiles: database.data.profiles };
  });

  app.patch("/api/profile-policy", async (request, reply) => {
    if (!hasPermission(request.user, "catalog:write")) return reply.code(403).send({ error: "Missing permission: catalog:write" });
    const parsed = profileMatchingPolicyPatchSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid profile matching policy", issues: parsed.error.issues });
    database.data.profileMatchingPolicy = profileMatchingPolicySchema.parse({ ...(database.data.profileMatchingPolicy || {}), ...parsed.data, updatedAt: new Date().toISOString(), updatedBy: request.user.email });
    await dispatchEvent(database, "profile.policy_updated", "Profile matching policy updated", { policy: database.data.profileMatchingPolicy });
    await database.write();
    return database.data.profileMatchingPolicy;
  });

  app.delete("/api/profiles/:id", async (request, reply) => {
    if (!hasPermission(request.user, "catalog:write")) return reply.code(403).send({ error: "Missing permission: catalog:write" });
    const profile = database.data.profiles.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!profile) return reply.code(404).send({ error: "Profile not found" });
    if (database.data.profileDefaults?.[profile.kind] === profile.id) database.data.profileDefaults[profile.kind] = "";
    database.data.profiles = database.data.profiles.filter((item) => item.id !== profile.id);
    await dispatchEvent(database, "profile.archived", `${profile.name} profile archived`, { profileId: profile.id, kind: profile.kind });
    await database.write();
    return { ok: true, profile };
  });

  app.post("/api/skus", async (request, reply) => {
    if (!hasPermission(request.user, "catalog:write")) return reply.code(403).send({ error: "Missing permission: catalog:write" });
    const parsed = skuSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid SKU payload", issues: parsed.error.issues });
    const missingParts = parsed.data.parts.filter((name) => !database.data.parts.some((part) => itemInWorkspace(part, request.user.workspaceId) && part.name.toLowerCase() === name.toLowerCase()));
    if (missingParts.length) return reply.code(400).send({ error: "SKU references missing parts", missingParts });
    const exists = database.data.skus.some((item) => itemInWorkspace(item, request.user.workspaceId) && item.sku.toLowerCase() === parsed.data.sku.toLowerCase());
    if (exists) return reply.code(409).send({ error: "SKU already exists" });
    const sku = { id: randomUUID(), workspaceId: request.user.workspaceId, ...parsed.data, updatedAt: new Date().toISOString() };
    database.data.skus.push(sku);
    await dispatchEvent(database, "sku.created", sku.sku, { skuId: sku.id, sku: sku.sku, parts: sku.parts }, { actor: request.user, at: sku.updatedAt });
    await database.write();
    return reply.code(201).send(sku);
  });

  app.patch("/api/skus/:id", async (request, reply) => {
    if (!hasPermission(request.user, "catalog:write")) return reply.code(403).send({ error: "Missing permission: catalog:write" });
    const parsed = skuPatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid SKU update", issues: parsed.error.issues });
    if (parsed.data.parts) {
      const missingParts = parsed.data.parts.filter((name) => !database.data.parts.some((part) => itemInWorkspace(part, request.user.workspaceId) && part.name.toLowerCase() === name.toLowerCase()));
      if (missingParts.length) return reply.code(400).send({ error: "SKU references missing parts", missingParts });
    }
    const sku = database.data.skus.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!sku) return reply.code(404).send({ error: "SKU not found" });
    Object.assign(sku, parsed.data, { updatedAt: new Date().toISOString() });
    await dispatchEvent(database, "sku.updated", sku.sku, { skuId: sku.id, sku: sku.sku, parts: sku.parts }, { actor: request.user, at: sku.updatedAt });
    await database.write();
    return sku;
  });

  app.post("/api/orders/:id/generate-jobs", async (request, reply) => {
    if (!hasPermission(request.user, "orders:write") || !hasPermission(request.user, "queue:write")) return reply.code(403).send({ error: "Missing permission: orders:write and queue:write" });
    const parsed = orderJobGenerationSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid order job generation payload", issues: parsed.error.issues });
    const result = generateJobsForOrder(database.data, request.params.id, parsed.data);
    if (result.error) return reply.code(result.statusCode || 400).send({ error: result.error });
    if (!result.dryRun && !result.duplicateBlocked) {
      await dispatchEvent(database, "order.jobs_generated", `${result.jobs.length} jobs generated for ${result.order.id}`, { orderId: result.order.id, jobs: result.jobs.map((job) => job.id), missing: result.missing, stockChanges: result.stockChanges }, { actor: request.user });
      await database.write();
    }
    return result;
  });

  app.post("/api/queue", async (request, reply) => {
    if (!hasPermission(request.user, "queue:write")) return reply.code(403).send({ error: "Missing permission: queue:write" });
    const parsed = queueCreateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid queue payload", issues: parsed.error.issues });
    const scoped = workspaceScopeForUser(database.data, request.user);
    const printer = parsed.data.printerId
      ? database.data.printers.find((item) => item.id === parsed.data.printerId && itemInWorkspace(item, request.user.workspaceId))
      : scoped.printers.find((item) => item.status !== "offline" && item.status !== "maintenance") || scoped.printers[0];
    if (!printer) return reply.code(404).send({ error: "Printer not found" });
    const job = {
      id: randomUUID(),
      workspaceId: request.user.workspaceId,
      ...parsed.data,
      printerId: printer.id,
      printer: printer.name,
      scheduleWarnings: getScheduleWarnings(scoped, { ...parsed.data, id: "draft", workspaceId: request.user.workspaceId, printerId: printer.id, printer: printer.name }, printer, parsed.data.scheduledStart)
    };
    database.data.queue.push(job);
    await dispatchEvent(database, "queue.created", `${job.file} queued`, { workspaceId: request.user.workspaceId, jobId: job.id, fileId: job.fileId, printerId: job.printerId, material: job.material }, { actor: request.user });
    await database.write();
    return reply.code(201).send({ job, todos: deriveTodos(workspaceScopeForUser(database.data, request.user)) });
  });

  app.post("/api/queue/match", async (request, reply) => {
    if (!hasPermission(request.user, "queue:write")) return reply.code(403).send({ error: "Missing permission: queue:write" });
    const parsed = queueMatchSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid queue match payload", issues: parsed.error.issues });
    const result = matchQueueNow(workspaceScopeForUser(database.data, request.user), parsed.data);
    if (!result.dryRun) {
      await dispatchEvent(database, "queue.matched", `${result.matches.length} queued jobs started`, { workspaceId: request.user.workspaceId, matches: result.matches.map((match) => ({ jobId: match.jobId, printerId: match.printerId })), skipped: result.skipped.length }, { actor: request.user });
      await database.write();
    }
    return result;
  });

  app.post("/api/bridges", async (request, reply) => {
    if (!hasPermission(request.user, "printers:control")) return reply.code(403).send({ error: "Missing permission: printers:control" });
    const parsed = bridgeSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid bridge payload", issues: parsed.error.issues });
    const printer = database.data.printers.find((item) => item.id === parsed.data.printerId && itemInWorkspace(item, request.user.workspaceId));
    if (!printer) return reply.code(404).send({ error: "Printer not found" });
    const existing = database.data.bridges.find((item) => item.printerId === parsed.data.printerId && itemInWorkspace(item, request.user.workspaceId));
    const bridge = existing || { id: randomUUID(), workspaceId: request.user.workspaceId, lastStatus: "not tested" };
    Object.assign(bridge, parsed.data, { updatedAt: new Date().toISOString() });
    if (!existing) database.data.bridges.push(bridge);
    printer.connection = parsed.data.kind === "octoprint" ? "OctoPrint" : parsed.data.kind === "moonraker" ? "Klipper / Moonraker" : parsed.data.kind === "prusalink" ? "PrusaLink" : "Manual bridge";
    await dispatchEvent(database, "bridge.saved", `${bridge.name} saved for ${printer.name}`, { workspaceId: request.user.workspaceId, bridgeId: bridge.id, printerId: printer.id, kind: bridge.kind }, { actor: request.user });
    await database.write();
    return reply.code(existing ? 200 : 201).send(sanitizeBridge(bridge));
  });

  app.post("/api/bridges/sync", async (request, reply) => {
    if (!hasPermission(request.user, "printers:control")) return reply.code(403).send({ error: "Missing permission: printers:control" });
    const result = await runBridgePollingTick(database, { workspaceId: request.user.workspaceId });
    const scoped = workspaceScopeForUser(database.data, request.user);
    return { ...result, bridges: (scoped.bridges || []).map(sanitizeBridge), printers: scoped.printers };
  });

  app.post("/api/bridges/:id/test", async (request, reply) => {
    if (!hasPermission(request.user, "printers:control")) return reply.code(403).send({ error: "Missing permission: printers:control" });
    const bridge = database.data.bridges.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!bridge) return reply.code(404).send({ error: "Bridge not found" });
    const printer = database.data.printers.find((item) => item.id === bridge.printerId && itemInWorkspace(item, request.user.workspaceId));
    if (!printer) return reply.code(404).send({ error: "Printer not found" });
    const diagnostic = await diagnoseBridge(bridge);
    bridge.lastDiagnostics = diagnostic;
    bridge.lastSyncAt = diagnostic.generatedAt;
    if (diagnostic.ok) {
      if (diagnostic.status) applyBridgeStatus(printer, diagnostic.status);
      bridge.lastStatus = "connected";
      bridge.lastError = "";
      await dispatchEvent(database, "bridge.connected", `${bridge.name} connected`, { workspaceId: request.user.workspaceId, bridgeId: bridge.id, printerId: printer.id, diagnostic: { ok: true, latencyMs: diagnostic.latencyMs } }, { actor: request.user, at: bridge.lastSyncAt });
    } else {
      bridge.lastStatus = "error";
      bridge.lastError = diagnostic.summary || "Bridge test failed";
      printer.status = "offline";
      await dispatchEvent(database, "bridge.diagnostic_failed", `${bridge.name} diagnostic failed`, { workspaceId: request.user.workspaceId, bridgeId: bridge.id, printerId: printer.id, diagnostic: { ok: false, latencyMs: diagnostic.latencyMs, recommendation: diagnostic.recommendation } }, { actor: request.user, at: bridge.lastSyncAt });
    }
    await database.write();
    return { ok: diagnostic.ok, bridge: sanitizeBridge(bridge), printer, status: diagnostic.status, diagnostic: sanitizeBridgeDiagnostic(diagnostic) };
  });

  app.post("/api/printers/:id/sync", async (request, reply) => {
    if (!hasPermission(request.user, "printers:control")) return reply.code(403).send({ error: "Missing permission: printers:control" });
    const printer = database.data.printers.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!printer) return reply.code(404).send({ error: "Printer not found" });
    const bridge = database.data.bridges.find((item) => item.printerId === printer.id && item.enabled && itemInWorkspace(item, request.user.workspaceId));
    if (!bridge) return reply.code(404).send({ error: "No enabled bridge for printer" });
    const status = await fetchBridgeStatus(bridge);
    applyBridgeStatus(printer, status);
    bridge.lastStatus = "connected";
    bridge.lastSyncAt = new Date().toISOString();
    await database.write();
    return { printer, bridge: sanitizeBridge(bridge), status };
  });

  app.patch("/api/printers/:id/status", async (request, reply) => {
    if (!hasPermission(request.user, "printers:control")) return reply.code(403).send({ error: "Missing permission: printers:control" });
    const parsed = z.object({
      status: printerStatusSchema,
      job: z.string().optional().nullable(),
      progress: z.number().min(0).max(100).optional(),
      targetNozzle: z.number().nonnegative().optional(),
      targetBed: z.number().nonnegative().optional()
    }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid printer status", issues: parsed.error.issues });
    const printer = database.data.printers.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!printer) return reply.code(404).send({ error: "Printer not found" });
    printer.status = parsed.data.status;
    if ("job" in parsed.data) printer.job = parsed.data.job || undefined;
    if (parsed.data.progress !== undefined) printer.progress = parsed.data.progress;
    if (parsed.data.targetNozzle !== undefined) printer.targetNozzle = parsed.data.targetNozzle;
    if (parsed.data.targetBed !== undefined) printer.targetBed = parsed.data.targetBed;
    await dispatchEvent(database, "printer.status", `${printer.name} -> ${printer.status}`, { workspaceId: request.user.workspaceId, printerId: printer.id, status: printer.status }, { actor: request.user });
    await database.write();
    return printer;
  });

  app.patch("/api/queue/:id/schedule", async (request, reply) => {
    if (!hasPermission(request.user, "queue:write")) return reply.code(403).send({ error: "Missing permission: queue:write" });
    const parsed = scheduleSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid schedule payload", issues: parsed.error.issues });
    const job = database.data.queue.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!job) return reply.code(404).send({ error: "Queue job not found" });
    const printer = database.data.printers.find((item) => item.id === parsed.data.printerId && itemInWorkspace(item, request.user.workspaceId));
    if (!printer) return reply.code(404).send({ error: "Printer not found" });
    const scoped = workspaceScopeForUser(database.data, request.user);
    job.printerId = printer.id;
    job.printer = printer.name;
    job.scheduledStart = parsed.data.scheduledStart;
    if (job.stage !== "needs slicing") job.stage = "scheduled";
    const materialReservation = reserveJobMaterial(scoped, job);
    job.scheduleWarnings = getScheduleWarnings(scoped, job, printer, parsed.data.scheduledStart);
    await dispatchEvent(database, "queue.scheduled", `${job.file} on ${printer.name}`, { workspaceId: request.user.workspaceId, jobId: job.id, printerId: printer.id, materialReservation }, { actor: request.user });
    await database.write();
    return { job, warnings: job.scheduleWarnings, materialReservation, spools: scoped.spools, todos: deriveTodos(workspaceScopeForUser(database.data, request.user)) };
  });

  app.patch("/api/queue/:id/status", async (request, reply) => {
    if (!hasPermission(request.user, "queue:write")) return reply.code(403).send({ error: "Missing permission: queue:write" });
    const parsed = z.object({ status: jobStatusSchema }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid queue status", issues: parsed.error.issues });
    const job = database.data.queue.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!job) return reply.code(404).send({ error: "Queue job not found" });
    const scoped = workspaceScopeForUser(database.data, request.user);
    job.status = parsed.data.status;
    if (parsed.data.status === "printing") job.stage = "printing";
    if (parsed.data.status === "complete") job.stage = "post processing";
    if (parsed.data.status === "failed") job.stage = "blocked";
    const materialChange = parsed.data.status === "complete"
      ? consumeJobMaterialReservation(scoped, job)
      : ["failed", "cancelled"].includes(parsed.data.status)
        ? releaseJobMaterialReservation(scoped, job)
        : null;
    await dispatchEvent(database, "queue.status", `${job.file} -> ${job.status}`, { workspaceId: request.user.workspaceId, jobId: job.id, status: job.status, stage: job.stage, materialChange }, { actor: request.user });
    await database.write();
    return { job, materialChange, spools: scoped.spools, todos: deriveTodos(workspaceScopeForUser(database.data, request.user)) };
  });

  app.patch("/api/queue/:id/priority", async (request, reply) => {
    if (!hasPermission(request.user, "queue:write")) return reply.code(403).send({ error: "Missing permission: queue:write" });
    const parsed = z.object({ priority: prioritySchema }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid queue priority", issues: parsed.error.issues });
    const job = database.data.queue.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!job) return reply.code(404).send({ error: "Queue job not found" });
    job.priority = parsed.data.priority;
    await dispatchEvent(database, "queue.priority", `${job.file} -> ${job.priority}`, { workspaceId: request.user.workspaceId, jobId: job.id, priority: job.priority }, { actor: request.user });
    await database.write();
    return { job, todos: deriveTodos(workspaceScopeForUser(database.data, request.user)) };
  });

  app.patch("/api/files/:id/version", async (request, reply) => {
    if (!hasPermission(request.user, "files:write")) return reply.code(403).send({ error: "Missing permission: files:write" });
    const file = database.data.files.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!file) return reply.code(404).send({ error: "File not found" });
    file.version += 1;
    file.status = "needs review";
    await dispatchEvent(database, "file.versioned", `${file.name} v${file.version}`, { workspaceId: request.user.workspaceId, fileId: file.id, version: file.version }, { actor: request.user });
    await database.write();
    return file;
  });

  app.get("/api/slicer/jobs", async (request) => workspaceScopeForUser(database.data, request.user).slicerJobs || []);

  app.post("/api/slicer/jobs", async (request, reply) => {
    if (!hasPermission(request.user, "files:write")) return reply.code(403).send({ error: "Missing permission: files:write" });
    const parsed = slicerJobSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid slicer job payload", issues: parsed.error.issues });
    const result = await runSlicerJob(database, { ...parsed.data, workspaceId: request.user.workspaceId });
    if (result.error) return reply.code(result.statusCode || 400).send({ error: result.error });
    await dispatchEvent(database, result.job.status === "complete" ? "slicer.completed" : "slicer.failed", `${result.job.sourceFile} -> ${result.job.status}`, { workspaceId: request.user.workspaceId, slicerJobId: result.job.id, fileId: result.file.id, status: result.job.status });
    await database.write();
    const code = result.job.status === "complete" ? 201 : 502;
    return reply.code(code).send({ ...result, slicerJobs: workspaceScopeForUser(database.data, request.user).slicerJobs });
  });

  app.patch("/api/files/:id/slice", async (request, reply) => {
    if (!hasPermission(request.user, "files:write")) return reply.code(403).send({ error: "Missing permission: files:write" });
    const file = database.data.files.find((item) => item.id === request.params.id && itemInWorkspace(item, request.user.workspaceId));
    if (!file) return reply.code(404).send({ error: "File not found" });
    const scoped = workspaceScopeForUser(database.data, request.user);
    const printer = scoped.printers.find((item) => item.status !== "offline" && item.status !== "maintenance") || scoped.printers[0];
    if (!printer) return reply.code(404).send({ error: "Printer not found" });
    const result = await runSlicerJob(database, {
      fileId: file.id,
      printerId: printer.id,
      workspaceId: request.user.workspaceId,
      material: file.material || "PLA",
      layerHeight: file.layerHeight || "0.20",
      infill: 18,
      supports: true
    });
    if (result.error) return reply.code(result.statusCode || 400).send({ error: result.error });
    await dispatchEvent(database, result.job.status === "complete" ? "file.sliced" : "slicer.failed", `${file.name} -> ${result.job.status}`, { workspaceId: request.user.workspaceId, slicerJobId: result.job.id, fileId: file.id, status: result.job.status });
    await database.write();
    if (result.job.status !== "complete") return reply.code(502).send(result);
    return result.file;
  });

  app.post("/api/actions", async (request, reply) => {
    if (!hasPermission(request.user, "actions:write")) return reply.code(403).send({ error: "Missing permission: actions:write" });
    const actionPayload = typeof request.body === "object" && request.body ? request.body : {};
    const parsedAction = printerActionSchema.safeParse(actionPayload);
    if (!parsedAction.success) return reply.code(400).send({ error: "Invalid printer action payload", issues: parsedAction.error.issues });
    const printer = database.data.printers.find((item) => item.id === parsedAction.data.printerId && itemInWorkspace(item, request.user.workspaceId));
    if (!printer) return reply.code(404).send({ error: "Printer not found" });
    const bridge = database.data.bridges.find((item) => item.printerId === parsedAction.data.printerId && item.enabled && itemInWorkspace(item, request.user.workspaceId));
    if (bridge) {
      try {
        await sendBridgeCommand(bridge, parsedAction.data.action);
        bridge.lastStatus = "command sent";
        bridge.lastError = "";
        bridge.lastSyncAt = new Date().toISOString();
      } catch (error) {
        bridge.lastStatus = "error";
        bridge.lastError = error instanceof Error ? error.message : "Bridge command failed";
        printer.status = "offline";
        await database.write();
        return reply.code(502).send({ error: bridge.lastError, bridge: sanitizeBridge(bridge), printer });
      }
    }
    const result = applyPrinterAction(workspaceScopeForUser(database.data, request.user), parsedAction.data);
    if (result.error) return reply.code(result.statusCode || 400).send({ error: result.error });
    const { event } = await dispatchEvent(database, "printer.action", result.message, {
      printerId: result.printer.id,
      workspaceId: request.user.workspaceId,
      action: result.action,
      jobId: result.job?.id || "",
      previous: result.previous,
      bridgeId: bridge?.id || ""
    });
    await database.write();
    return { ok: true, accepted: true, action: result.action, printer: result.printer, job: result.job || null, bridge: sanitizeBridge(bridge), event, todos: deriveTodos(workspaceScopeForUser(database.data, request.user)) };
  });

  if (serveStatic) {
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "Route not found" });
      return reply.sendFile("index.html");
    });
  }

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const enableInternalTelemetry = envFlag("LAYERPILOT_ENABLE_INTERNAL_TELEMETRY", true);
  const enableInternalBridgePolling = envFlag("LAYERPILOT_ENABLE_INTERNAL_BRIDGE_POLLING", true);
  const server = await buildServer({ enableTelemetry: enableInternalTelemetry, enableBridgePolling: enableInternalBridgePolling, serveStatic: process.env.NODE_ENV === "production" || process.env.LAYERPILOT_SERVE_STATIC === "true" });
  const port = Number(process.env.LAYERPILOT_API_PORT || 8797);
  const host = process.env.LAYERPILOT_HOST || "127.0.0.1";
  await server.listen({ host, port });
  console.log(`3DSTU FarmFlow running at http://${host}:${port}`);
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`3DSTU FarmFlow received ${signal}; closing server...`);
    try {
      await server.close();
      process.exit(0);
    } catch (error) {
      console.error("3DSTU FarmFlow shutdown failed", error);
      process.exit(1);
    }
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}
