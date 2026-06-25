/// <reference types="vite/client" />
import type * as React from "react";
import packageJson from "../package.json";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Archive,
  Bell,
  Box,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  ClipboardList,
  Cloud,
  Code2,
  Database,
  Download,
  FileCode2,
  FilePlus2,
  Filter,
  Gauge,
  HardDrive,
  Home,
  KeyRound,
  Layers,
  ListChecks,
  LogOut,
  Menu,
  Pause,
  Play,
  Plus,
  Package,
  RefreshCw,
  Save,
  Search,
  Settings,
  Shield,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Store,
  Tag,
  Thermometer,
  Trash2,
  Upload,
  Users,
  Wand2,
  X
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { idempotencyFingerprint, idempotencyHeadersForAttempt, idempotencyKeyForAttempt, type IdempotencyAttempt } from "./idempotency";

const APP_VERSION = packageJson.version;

type View =
  | "dashboard"
  | "printers"
  | "products"
  | "orders"
  | "files"
  | "queue"
  | "scheduler"
  | "todos"
  | "slicer"
  | "filament"
  | "profiles"
  | "analytics"
  | "history"
  | "maintenance"
  | "team"
  | "integrations"
  | "addons"
  | "notifications"
  | "settings";

type PrinterStatus = "idle" | "printing" | "paused" | "offline" | "error" | "maintenance";
type JobStatus = "queued" | "printing" | "paused" | "complete" | "failed" | "cancelled";
type TaskStage = "needs slicing" | "needs scheduling" | "scheduled" | "printing" | "post processing" | "done" | "blocked";
type FileStatus = "uploaded" | "needs review" | "sliced" | "approved" | "archived";
type Role = "Owner" | "Admin" | "Operator" | "Viewer" | "Student";

type Printer = {
  id: string;
  name: string;
  model: string;
  location: string;
  status: PrinterStatus;
  connection: string;
  job?: string;
  progress: number;
  nozzle: number;
  bed: number;
  targetNozzle: number;
  targetBed: number;
  filament: string;
  compatibleMaterials: string[];
  buildVolume: [number, number, number];
  uptime: number;
  utilization: number;
  queue: number;
  camera: string;
};

type PrintFile = {
  id: string;
  name: string;
  type: "GCODE" | "STL" | "3MF" | "OBJ";
  folder: string;
  size: string;
  material: string;
  tags: string[];
  sliced: boolean;
  status: FileStatus;
  version: number;
  dimensions: [number, number, number];
  thumbnail: string;
  printTime: string;
  cost: number;
  layerHeight: string;
  usage: number;
};
type FileFolder = { id: string; name: string; parent?: string; purpose: "inbox" | "production" | "review" | "archive" | "sample"; fileCount?: number; createdAt?: string; updatedAt?: string };
type FilePreview = {
  fileId: string;
  generatedAt: string;
  name: string;
  type: string;
  material: string;
  summary: { dimensions: [number, number, number]; size: string; estimateGrams: number; estimateMinutes: number; printTime: string; quote: number; sliced: boolean; status: string };
  buildPlate: { width: number; depth: number; height: number; occupancyPercent: number; fit: string };
  visualization: {
    kind: "toolpath" | "bounding-box";
    lineCount?: number;
    motionCommands?: number;
    extrusionMoves?: number;
    travelMoves?: number;
    totalExtrusion?: number;
    layers?: Array<{ z: number; moves: number; extrusion: number }>;
    sample?: Array<{ x: number; y: number; z: number; extrusion?: number }>;
    extents: { min: number[]; max: number[] };
  };
  compatiblePrinters: Array<{ id: string; name: string; status: string; buildVolume: [number, number, number] }>;
  warnings: string[];
};

type QueueItem = {
  id: string;
  fileId: string;
  file: string;
  printerId: string;
  printer: string;
  status: JobStatus;
  priority: "Rush" | "High" | "Normal" | "Low";
  stage: TaskStage;
  material: string;
  color: string;
  due: string;
  dimensions: [number, number, number];
  assignee: string;
  scheduledStart?: string;
  scheduleWarnings?: string[];
  reservedSpoolId?: string;
  reservedGrams?: number;
  materialReservation?: Record<string, string | number | boolean | undefined>;
  time: string;
  cost: number;
  added: string;
};

type Spool = {
  id: string;
  material: string;
  color: string;
  brand: string;
  remaining: number;
  weight: number;
  reserved?: number;
  reservations?: Array<{ jobId: string; file?: string; grams: number; material?: string; scheduledStart?: string }>;
  location: string;
  dry: boolean;
  nfc: string;
};
type SpoolLabelExport = { generatedAt: string; count: number; rows: Array<Record<string, string | number>>; csv: string; html: string };
type SpoolScanResult = { spool: Spool; matchedBy: string; usageLogged: number; warnings: string[]; spools?: Spool[] };
type Severity = "Low" | "Medium" | "High" | "Urgent";
type PurchaseRequest = { id: string; spoolId?: string; material: string; color: string; brand: string; quantity: number; targetGrams: number; supplier: string; priority: Severity; status: "open" | "ordered" | "received" | "cancelled"; due: string; note?: string; receivedAt?: string; receivedSpoolIds?: string[]; createdAt?: string; updatedAt?: string };
type ReorderPlanResult = { created: PurchaseRequest[]; skipped: Array<{ spoolId: string; material: string; reason: string }>; thresholdGrams: number; purchaseRequests: PurchaseRequest[] };
type PurchaseReceiveResult = { request: PurchaseRequest; spools: Spool[]; purchaseRequests: PurchaseRequest[]; inventory: Spool[] };

type MaintenanceJob = {
  id: string;
  title: string;
  printer: string;
  status: "scheduled" | "in progress" | "done" | "blocked";
  due: string;
  progress: string;
  severity: Severity;
};
type MaintenanceTemplate = { id: string; title: string; printerModel: string; intervalDays: number; tasks: string[]; severity: MaintenanceJob["severity"]; createdAt?: string; updatedAt?: string };
type MaintenanceReport = { id: string; title: string; printer: string; description: string; severity: MaintenanceJob["severity"]; status: "open" | "triaged" | "closed"; linkedJobId?: string; createdAt?: string; updatedAt?: string; createdBy?: string };

type User = { id: string; name: string; email: string; role: Role; location: string; lastSeen: string; passwordResetRequired?: boolean; twoFactorEnabled?: boolean; twoFactor?: { enabled: boolean; enrolledAt?: string; recoveryCodesRemaining?: number } };
type TwoFactorSetup = { secret: string; otpauthUrl: string; user: User };
type ApiKey = { id: string; name: string; prefix: string; scopes: string[]; enabled: boolean; createdAt?: string; created?: string; lastUsedAt?: string; expiresAt?: string };
type Webhook = { id: string; name: string; url: string; events: string[]; enabled: boolean; lastStatus?: string; lastStatusCode?: number; lastSentAt?: string };
type WebhookDelivery = { id: string; webhookId: string; webhookName: string; eventId: string; eventType: string; url: string; status: string; statusCode: number; at: string; error?: string };
type NotificationChannel = { id: string; name: string; type: "slack" | "discord" | "custom" | "email"; url: string; events: string[]; enabled: boolean; recipients: string[]; hasToken?: boolean; lastStatus?: string; lastStatusCode?: number; lastSentAt?: string };
type NotificationDelivery = { id: string; channelId: string; channelName: string; channelType: string; eventId: string; eventType: string; url: string; status: string; statusCode: number; at: string; error?: string };
type BridgeDiagnosticCheck = { name: string; status: "passed" | "warning" | "failed"; detail: string; recommendation?: string };
type BridgeDiagnostic = { ok: boolean; generatedAt: string; kind: Bridge["kind"]; baseUrl: string; latencyMs: number; status?: Partial<Printer> | null; checks: BridgeDiagnosticCheck[]; summary: string; recommendation: string };
type Bridge = { id: string; printerId: string; kind: "octoprint" | "moonraker" | "prusalink" | "manual"; name: string; baseUrl: string; enabled: boolean; hasApiKey?: boolean; lastStatus?: string; lastError?: string; lastSyncAt?: string; lastDiagnostics?: BridgeDiagnostic };
type Toast = { id: string; message: string; type: "success" | "info" | "warning" };
type Part = { id: string; name: string; fileId: string; material: string; process: string; plates: number; variants: string[]; status: "ready" | "needs profile" | "draft" };
type SKU = { id: string; sku: string; title: string; parts: string[]; variants: string[]; price: number; stock: number; channel: string };
type ProductionTemplate = { id: string; name: string; sku?: string; fileId: string; material: string; color: string; priority: QueueItem["priority"]; stage: TaskStage; printerId?: string; process: string; dueOffsetDays: number; quantity: number; time: string; cost: number; notes?: string; runCount?: number; lastRunAt?: string; createdAt?: string; updatedAt?: string };
type ProductionTemplateRunResult = { template: ProductionTemplate; jobs: QueueItem[]; dryRun: boolean; queue: QueueItem[]; todos: Todo[] };
type OrderStatus = "received" | "queued" | "printing" | "on_hold" | "packed" | "shipped" | "completed" | "cancelled";
type Order = { id: string; source: "Shopify" | "Etsy" | "Manual" | "eBay"; externalId?: string; customer: string; items: string[]; status: OrderStatus; due: string; value: number };
type OrderStatusUpdateResult = Order & { order?: Order; jobs?: QueueItem[]; materialChanges?: Array<{ spoolId: string; grams: number; material: string }>; spools?: Spool[]; todos?: Todo[] };
type QuoteRequest = { id: string; customer: string; email: string; company?: string; project: string; material: string; quantity: number; due: string; budget: number; notes?: string; fileName?: string; fileId?: string; fileType?: string; fileSize?: string; estimatedGrams?: number; estimatedMinutes?: number; estimatedQuote?: number; source: string; status: "new" | "reviewing" | "quoted" | "accepted" | "converted" | "rejected"; priority: QueueItem["priority"]; quotedValue?: number; validUntil?: string; internalNote?: string; orderId?: string; customerDecision?: string; customerDecisionNote?: string; customerAccessToken?: string; portalLinkGeneratedAt?: string; createdAt?: string; updatedAt?: string };
type PublicQuoteStatus = Pick<QuoteRequest, "id" | "status" | "project" | "material" | "quantity" | "due" | "budget" | "quotedValue" | "validUntil" | "fileName" | "fileType" | "fileSize" | "estimatedGrams" | "estimatedMinutes" | "estimatedQuote" | "orderId" | "createdAt" | "updatedAt"> & { customerDecision?: string; customerDecisionAt?: string; customerDecisionNote?: string };
type OrderJobGenerationResult = { order: Order; jobs: QueueItem[]; existingJobs?: QueueItem[]; missing?: Array<{ item: string; reason: string }>; skus?: SKU[]; todos?: Todo[]; dryRun?: boolean; duplicateBlocked?: boolean; stockChanges?: Array<{ sku: string; before: number; after: number; quantity: number }> };
type CommerceConnector = { id: string; name: string; source: Order["source"] | "Generic"; url: string; enabled: boolean; hasToken?: boolean; lastStatus?: string; lastStatusCode?: number; lastError?: string; lastSyncAt?: string };
type CommerceImport = { id: string; source: string; connectorId?: string; connectorName?: string; status: string; created: number; skipped: number; at: string; error?: string };
type HotDropMode = "Upload Only" | "Direct Print" | "Auto-Queue";
type OnboardingStep = { id: string; title: string; description: string; status: "pending" | "complete" | "skipped"; autoComplete: boolean; note?: string; updatedAt?: string; updatedBy?: string };
type OnboardingStatus = { generatedAt: string; workspace: { id: string; name: string; plan: string }; progress: { complete: number; total: number; percent: number }; steps: OnboardingStep[] };
type SupportSnapshot = { service: string; generatedAt: string; generatedBy: string; workspace: { id: string; name: string; plan: string }; counts: Record<string, number>; readiness: { onboarding: OnboardingStatus["progress"]; integrityWarnings: number; storageLimitGb: number }; onboarding: OnboardingStatus; analytics: Partial<AnalyticsSummary> };
type WorkspaceSettings = { organizationName: string; defaultLocation: string; units: "metric" | "imperial"; currency: string; timezone: string; theme: "system" | "light" | "dark"; requireAdmin2fa: boolean; auditLogRetention: boolean; auditLogRetentionDays: number; restrictApiByIp: boolean; allowedApiIps: string[]; storageLimitGb: number; hotDropMode: HotDropMode; plan: string; onboarding?: Record<string, { status: "pending" | "complete" | "skipped"; note?: string; updatedAt?: string; updatedBy?: string }> };
type BillingTier = { id: string; name: string; storageLimitGb: number; monthlyPrice: number; currency: string; features: string[]; isCustom?: boolean };
type BillingSummary = { status: string; plan: BillingTier; tiers: BillingTier[]; storage: { usedBytes: number; used: string; usedGb: number; limitGb: number; percent: number; files: number; storedFiles: number }; portalMode: "internal" | "external" | "stripe"; invoices: Array<{ id: string; provider?: string; plan: string; amount: number; currency: string; status: string; at: string; note?: string }>; sessions: Array<{ id: string; mode: string; provider?: string; status: string; url: string; createdAt: string; expiresAt: string }> };
type RestoreSummary = { dryRun: boolean; restored?: boolean; collectionCounts: Record<string, number>; users: number; printers: number; queue: number; files: number; storagePathsStripped: number; filePayloadsRestored?: number; warnings: string[] };
type CostCatalog = { currency: string; materialRates: Record<string, number>; machineHourlyRate: number; laborPerOrder: number; failureReservePercent: number; minimumQuote: number; overheadPercent: number };
type Profile = { id: string; name: string; kind: "Machine" | "Process" | "Filament"; target: string; source: "Bambu sync" | "Orca import" | "Manual"; updated: string; settings?: Record<string, string | number | boolean | string[]> };
type ProfileDefaults = Partial<Record<Profile["kind"], string>>;
type ProfileMatchingPolicy = { materialCompatibility: boolean; processFallback: boolean; commercialPriority: boolean; warnBeforeFallback: boolean; dueWindowHours: number; updatedAt?: string; updatedBy?: string };
type AddonStatus = "enabled" | "disabled" | "beta" | "available";
type Addon = { id: string; name: string; description: string; category: string; status: AddonStatus; enabled?: boolean; config?: Record<string, string | number | boolean | string[]>; createdAt?: string; updatedAt?: string; updatedBy?: string };
type Language = "en" | "zh-TW" | "zh-CN";
type Todo = { id: string; title: string; owner: string; source: string; severity: "Low" | "Medium" | "High" | "Urgent"; due: string; kind: "slicing" | "scheduling" | "material" | "size" | "post" | "exception"; status?: "open" | "claimed" | "snoozed"; actionNote?: string; claimedBy?: string; snoozeUntil?: string };
type TodoAction = { id: string; todoId: string; todoTitle: string; todoKind: Todo["kind"]; action: "claim" | "complete" | "snooze" | "reopen"; owner: string; note?: string; snoozeUntil?: string; createdBy?: string; at: string };
type AnalyticsSummary = { jobs: number; active: number; queued: number; completed: number; failed: number; successRate: number; utilization: number; cost: number; printHours: number; wasteGrams?: number; wasteCost?: number; failureCategories?: Record<string, number>; rootCauses?: Array<{ label: string; count: number }>; printerReliability?: Array<{ printerId: string; printer: string; finished: number; failed: number; successRate: number; wasteGrams: number; wasteCost: number }>; materialMix: Record<string, number>; daily: Array<{ day: string; jobs: number; hours: number; success: number }> };
type HistoryRecord = { id: string; fileId?: string; file: string; printerId?: string; printer: string; status: JobStatus; duration: string; material: string; cost: number; date: string; note: string; issueTag?: string; issueSeverity?: string; flaggedAt?: string; failureReason?: string; failureCategory?: string; rootCause?: string; correctiveAction?: string; wasteGrams?: number; wasteCost?: number; wasteSpoolId?: string; wasteInventoryDeductedAt?: string; sourceOrderId?: string };
type SlicerJob = { id: string; fileId: string; sourceFile: string; printerId: string; printer: string; profileId?: string; profile?: string; status: "running" | "complete" | "failed"; engine: "internal" | "external"; settings: { material: string; layerHeight: string; infill: number; supports: boolean }; outputName?: string; outputSize?: string; outputPath?: string; warning?: string; error?: string; createdAt: string; completedAt?: string };
type AuditEvent = { id: string; type: string; message: string; at: string; data?: Record<string, unknown> };
type AuditResponse = { total: number; matched: number; returned: number; limit: number; offset: number; hasMore: boolean; events: AuditEvent[] };
type AutoScheduleResult = {
  strategy?: "material-color" | "load-balance" | "due-priority" | "constraint-balanced-cost" | "constraint-due-risk" | "constraint-changeover-min";
  dryRun?: boolean;
  solver?: { engine: string; objective: "balanced-cost" | "due-risk" | "changeover-min"; feasible: boolean; bounded: boolean; result: number; variables: number };
  scheduled: Array<{ jobId: string; file: string; printerId: string; printer: string; scheduledStart: string; durationMinutes: number; changeCost: number; score: number; warnings: string[]; slot?: number; objective?: string; materialReservation?: QueueItem["materialReservation"] | null }>;
  skipped: Array<{ jobId: string; file: string; reason: string }>;
  jobs: QueueItem[];
  spools?: Spool[];
};
type OptimizeScheduleStrategy = "material-color" | "load-balance" | "due-priority";
type ConstraintObjective = "balanced-cost" | "due-risk" | "changeover-min";
type QueueMatchResult = { dryRun: boolean; maxActiveSlots: number; activeSlots: number; openSlots: number; matches: Array<{ jobId: string; file: string; printerId: string; printer: string; scheduledStart?: string; priority: QueueItem["priority"]; material: string; warnings: string[]; score: number }>; skipped: Array<{ jobId: string; file: string; reason: string }>; jobs: QueueItem[]; printers: Printer[]; spools?: Spool[]; todos: Todo[] };
type HotDropResult = { mode: HotDropMode; file: Partial<PrintFile>; folder: FileFolder; stlBytes: number; job?: QueueItem | null; match?: QueueMatchResult | null; files: Partial<PrintFile>[]; folders: FileFolder[]; queue: QueueItem[]; printers: Printer[]; todos: Todo[] };
type ParametricNameplateDraft = { text: string; width: number; height: number; thickness: number; material: string; feature: "keyholes" | "magnet pockets" | "plain plate"; createPart: boolean };
type ParametricNameplateResult = { file: PrintFile; part?: Part | null; estimates: { grams: number; minutes: number; quote: { total: number } }; stlBytes: number; files?: PrintFile[]; parts?: Part[] };
type CatalogExportResult = { exportedAt: string; rows: Array<Record<string, string | number>>; csv: string };
type MaterialMapResult = { generatedAt: string; applied: boolean; changed: number; unmapped: number; mappings: Array<{ alias: string; canonical: string; confidence: number; status: string; occurrences: number }>; items: Array<{ collection: string; id: string; name: string; material: string; canonical: string; confidence: number; status: string; changed: boolean }>; parts?: Part[]; files?: PrintFile[]; queue?: QueueItem[] };

const zhTwTranslations: Record<string, string> = {
  "Sign in": "登入",
  "Create account": "建立帳號",
  "Welcome back": "歡迎回來",
  "Start a workspace": "建立工作區",
  "Email": "電子郵件",
  "Password": "密碼",
  "Workspace name": "工作區名稱",
  "Demo Login": "Demo 登入",
  "Create demo workspace": "建立 Demo 工作區",
  "Profile": "個人資料",
  "Workspace": "工作區",
  "Mock printer": "模擬打印機",
  "No audit events match the current filters": "沒有符合目前篩選條件的稽核事件",
  "Done": "完成",
  "Language": "語言",
  "Logout": "登出",
  "Backend Live": "後端連線",
  "Local Demo": "本機 Demo",
  "Run a smarter print lab from one cockpit.": "用一個控制台管理更聰明的 3D 打印工作室。",
  "Original cloud management for printers, jobs, materials, teams, and automations.": "原創的打印機、任務、材料、團隊與自動化雲端管理系統。",
  "Professional setup and technical support:": "專業安裝設定與技術支援：",
  "Production admin access requires two-factor authentication. Set up 2FA to unlock protected workspace APIs.": "正式環境管理員存取需要雙因素驗證。請設定 2FA 以解鎖受保護的工作區 API。",
  "Dashboard": "儀表板",
  "Production cockpit": "生產控制台",
  "Printers": "打印機",
  "Products": "產品",
  "Orders": "訂單",
  "Files": "檔案",
  "Print Queue": "打印佇列",
  "Cloud Slicer": "雲端切片",
  "Filament": "線材",
  "Profiles": "設定檔",
  "Analytics": "分析",
  "History": "歷史",
  "Maintenance": "維護",
  "Team": "團隊",
  "Integrations": "整合",
  "Add-ons": "擴充功能",
  "Notifications": "通知",
  "Settings": "設定",
  "Set up two-factor authentication to unlock production admin access.": "請設定雙因素驗證以解鎖正式環境管理員存取。",
  "Hot Drop": "快速投放",
  "Go-live readiness": "上線準備度",
  "Drop demo files here": "投放 Demo 檔案",
  "Run hot drop": "執行快速投放",
  "Print Farm Trial": "打印農場試用",
  "14 days left in mock billing.": "模擬方案剩餘 14 天。",
  "Open navigation": "開啟導覽",
  "Search printers, files, spools, jobs": "搜尋打印機、檔案、線材捲、任務",
  "Today tasks": "今日任務",
  "Due risk": "交期風險",
  "Idle printers": "閒置設備",
  "Printer issues": "設備異常",
  "Human todos": "人員待辦",
  "Device status": "設備狀態",
  "Tasks near due": "接近交期任務",
  "Auto-generated todos": "自動生成待辦",
  "Production progress": "生產進度",
  "Add printer": "新增打印機",
  "Upload file": "上傳檔案",
  "Open scheduler": "開啟排單",
  "Review todos": "查看待辦",
  "All printers": "所有打印機",
  "Schedule": "排程",
  "Open todos": "開啟待辦",
  "Control, monitor, and route jobs": "控制、監看與分派任務",
  "Cards": "卡片",
  "Table": "表格",
  "Name": "名稱",
  "Model": "機型",
  "Status": "狀態",
  "Temp": "溫度",
  "Job": "任務",
  "Actions": "操作",
  "Open": "開啟",
  "Pause": "暫停",
  "Start": "開始",
  "Parts": "零件",
  "Part": "零件",
  "SKUs": "SKU",
  "Parametric builder": "參數化建模",
  "Create part": "建立零件",
  "Map materials": "映射材料",
  "Material": "材料",
  "Process profile": "製程設定檔",
  "Plates": "盤數",
  "Variants": "變體",
  "New SKU": "新增 SKU",
  "Export catalog": "匯出型錄",
  "Product": "產品",
  "Linked parts": "綁定零件",
  "Channel": "渠道",
  "Stock": "庫存",
  "Price": "價格",
  "Received": "已接單",
  "Queued": "已排隊",
  "Printing": "打印中",
  "Revenue": "營收",
  "Order": "訂單",
  "Source": "來源",
  "Customer": "客戶",
  "Items": "品項",
  "Due": "交期",
  "Value": "金額",
  "Generate jobs": "生成任務",
  "Ship": "出貨",
  "Cloud files": "雲端檔案",
  "Search file library": "搜尋檔案庫",
  "Upload model": "上傳模型",
  "Create folder": "建立資料夾",
  "File": "檔案",
  "Folder": "資料夾",
  "Version": "版本",
  "Dimensions": "尺寸",
  "Estimate": "估算",
  "Queue": "加入佇列",
  "Slice": "切片",
  "New version": "新版本",
  "Print queue": "打印佇列",
  "Production slots": "生產席位",
  "Queued normal": "一般排隊",
  "Low priority": "低優先",
  "Auto matching": "自動匹配",
  "In Progress": "進行中",
  "Completed": "已完成",
  "Cancelled": "已取消",
  "Errored": "錯誤",
  "Priority": "優先級",
  "Resume": "繼續",
  "Cancel": "取消",
  "Scheduler": "排單工具",
  "Task pool, printer capability matching, and production timeline": "任務池、設備能力匹配與生產時間軸",
  "Auto schedule": "自動排單",
  "Merge material/color": "合併材料/顏色",
  "Balance load": "平衡負載",
  "Auto schedule result": "自動排單結果",
  "Unscheduled tasks": "待排任務",
  "Timeline": "時間軸",
  "Selected task": "選取任務",
  "Duration": "時長",
  "Model size": "模型尺寸",
  "Owner": "負責人",
  "Material conflict": "材料衝突",
  "Size mismatch": "尺寸不匹配",
  "Due date risk": "交期風險",
  "Printer offline": "設備離線",
  "Printer error": "設備錯誤",
  "In maintenance": "維護中",
  "Printer busy": "設備忙碌",
  "Ready": "可排程",
  "Compatible": "相容",
  "No active scheduling warnings": "目前沒有排程警示",
  "Auto Todos": "自動待辦",
  "Generated todos": "生成待辦",
  "Need slicing": "待切片",
  "Material changes": "換料待辦",
  "Size conflicts": "尺寸衝突",
  "Exceptions": "異常",
  "Automation rules": "自動化規則",
  "Cloud slicer": "雲端切片",
  "Slicing setup": "切片設定",
  "Model file": "模型檔案",
  "Printer profile": "打印機設定檔",
  "Layer height": "層高",
  "Generate supports": "生成支撐",
  "Slice model": "模型切片",
  "Filament inventory": "線材庫存",
  "Add spool": "新增線材捲",
  "Low stock": "低庫存",
  "Low available stock": "可用庫存偏低",
  "Reserved": "已預留",
  "Available": "可用",
  "Dry storage": "乾燥儲存",
  "Machine profiles": "機器設定檔",
  "Process presets": "製程預設",
  "Filament presets": "線材預設",
  "Import Orca profile": "匯入 Orca 設定檔",
  "Sync Bambu profiles": "同步 Bambu 設定檔",
  "Export": "匯出",
  "Hold": "暫停",
  "Complete": "完成",
  "Progress": "進度",
  "Severity": "嚴重度",
  "Role": "角色",
  "Location": "地點",
  "Last seen": "最後上線",
  "Webhooks": "Webhooks",
  "URL": "URL",
  "Events": "事件",
  "Enabled": "啟用",
  "Enable": "啟用",
  "Disable": "停用",
  "Save": "儲存",
  "Back": "返回",
  "Continue": "繼續",
  "Connect printer": "連接打印機",
  "idle": "閒置",
  "printing": "打印中",
  "paused": "暫停",
  "offline": "離線",
  "error": "錯誤",
  "maintenance": "維護",
  "queued": "排隊中",
  "complete": "完成",
  "failed": "失敗",
  "cancelled": "已取消",
  "ready": "就緒",
  "draft": "草稿",
  "received": "已接單",
  "on_hold": "暫停中",
  "packed": "已包裝",
  "shipped": "已出貨",
  "completed": "已完成",
  "matched": "已匹配",
  "waiting": "等待中",
  "Rush": "急件",
  "High": "高",
  "Normal": "一般",
  "Low": "低",
  "API key creation failed. Check role or API status.": "API 金鑰建立失敗，請檢查角色或 API 狀態。",
  "API key or access token": "API 金鑰或存取權杖",
  "API key update failed. Reverting on next refresh.": "API 金鑰更新失敗，重新整理後會還原。",
  "API keys": "API 金鑰",
  "Access token": "存取權杖",
  "Account password": "帳號密碼",
  "Active schedules": "啟用中的排程",
  "Add sample order": "新增範例訂單",
  "All": "全部",
  "All events": "所有事件",
  "All materials": "所有材料",
  "All production SKUs": "所有生產 SKU",
  "Allow closest process fallback": "允許使用最接近的製程備援",
  "Allowed API key IPs / CIDR": "允許 API 金鑰使用的 IP / CIDR",
  "Analytics CSV exported": "分析 CSV 已匯出",
  "Archive": "封存",
  "Audit CSV downloaded": "稽核 CSV 已下載",
  "Audit CSV exported from visible records": "已從可見紀錄匯出稽核 CSV",
  "Audit log retention": "稽核紀錄保留",
  "Audit retention days": "稽核保留天數",
  "Audit timeline": "稽核時間軸",
  "Auth": "驗證",
  "Authenticator code": "驗證器代碼",
  "Authenticator secret": "驗證器密鑰",
  "Auto checked": "已自動檢查",
  "Auto-Queue": "自動排入佇列",
  "Automatic Queue Matching": "自動佇列匹配",
  "Automatic matching policy": "自動匹配規則",
  "Automation key name": "自動化金鑰名稱",
  "Backup export requires admin access and live API": "備份匯出需要管理員權限與可用 API。",
  "Backup restore": "備份還原",
  "Billing session could not be created": "無法建立帳務工作階段。",
  "Bridge name": "橋接名稱",
  "Bridge save failed. Check URL, role, or API status.": "橋接儲存失敗，請檢查 URL、角色或 API 狀態。",
  "Bridge sync failed. Check API status and bridge credentials.": "橋接同步失敗，請檢查 API 狀態與橋接憑證。",
  "Build plate preview": "建構板預覽",
  "Build volume mismatch": "建構尺寸不符",
  "CSV import failed. Check headers or API status.": "CSV 匯入失敗，請檢查欄位標題或 API 狀態。",
  "CSV intake": "CSV 匯入",
  "Change password": "變更密碼",
  "Channel name": "通道名稱",
  "Check SKU mapping rules before committing production": "送出生產前請檢查 SKU 對應規則",
  "Choose a file and settings, then create a backend slicer job.": "選擇檔案與設定後，建立後端切片任務。",
  "Claim": "領取",
  "Clean match": "匹配正常",
  "Clear selection": "清除選取",
  "Commerce": "電商",
  "Commerce connector": "電商連接器",
  "Commerce feeds": "電商資料來源",
  "Commercial due-date priority": "商業交期優先",
  "Commercial priority": "商業優先級",
  "Commit restore": "確認還原",
  "Compatible materials": "相容材料",
  "Configure": "設定",
  "Confirm new password": "確認新密碼",
  "Connector save failed. Check URL, role, or API status.": "連接器儲存失敗，請檢查 URL、角色或 API 狀態。",
  "Creating": "建立中",
  "Constraint solve": "限制式求解",
  "Controls": "控制",
  "Converting": "轉換中",
  "Cooldown": "冷卻",
  "Copy this key now. It will only be shown once.": "請立即複製此金鑰，它只會顯示一次。",
  "Cost catalog": "成本目錄",
  "Could not generate spool labels": "無法產生線材標籤",
  "Create key": "建立金鑰",
  "Create linked production part": "建立連結的生產零件",
  "Currency": "幣別",
  "Current password": "目前密碼",
  "Custom range": "自訂範圍",
  "Custom webhook": "自訂 Webhook",
  "Default location": "預設地點",
  "Delivery channel": "通知通道",
  "Depth mm": "深度 mm",
  "Direct Print": "直接打印",
  "Disable 2FA": "停用 2FA",
  "Discord": "Discord",
  "Down": "下移",
  "Dry run": "試算",
  "Due window hours": "交期視窗小時數",
  "Due-risk solve": "交期風險求解",
  "Checking": "檢查中",
  "Create jobs": "建立任務",
  "Creating reorders": "建立補貨中",
  "Duplicate generation blocked": "已阻擋重複生成",
  "Dynamic model parameters": "動態模型參數",
  "Email provider webhook": "Email 服務 Webhook",
  "Enable 2FA": "啟用 2FA",
  "Enabled for imports": "啟用匯入",
  "Enforce material compatibility": "強制材料相容",
  "English": "英文",
  "Engraved text": "雕刻文字",
  "Enter a spool code first": "請先輸入線材捲代碼",
  "Every generated quote": "每筆自動報價",
  "Export CSV": "匯出 CSV",
  "Export backup": "匯出備份",
  "Export full backup": "匯出完整備份",
  "FDM, resin, quotes": "FDM、樹脂、報價",
  "Failure reserve": "失敗預備金",
  "Feature toggles": "功能開關",
  "Feed URL": "資料來源 URL",
  "Flag": "標記",
  "Forge A1": "Forge A1",
  "Generated preview": "已產生預覽",
  "Generate reorder plan": "生成補貨計畫",
  "Handling labor": "處理人力",
  "Height mm": "高度 mm",
  "Home axes": "歸零軸向",
  "Hot Drop mode saved locally while API is unavailable": "API 無法使用，快速投放模式已暫存於本機。",
  "Import": "匯入",
  "Import history": "匯入歷史",
  "Integrations and API": "整合與 API",
  "Invite teammate": "邀請隊友",
  "Invite user": "邀請使用者",
  "Loading go-live checklist": "正在載入上線檢查清單",
  "Workspace readiness will appear here": "工作區準備狀態會顯示在這裡",
  "Jobs and print hours": "任務與打印時數",
  "History jobs": "歷史任務",
  "Print jobs": "打印任務",
  "Success rate": "成功率",
  "Utilization": "稼動率",
  "Cost": "成本",
  "Waste": "耗損",
  "Waste cost": "耗損成本",
  "Failure intelligence": "失敗智慧",
  "Waste by printer": "各設備耗損",
  "No failure records yet": "尚無失敗紀錄",
  "Flag failed prints from history": "從歷史紀錄標記失敗打印",
  "Flagged": "已標記",
  "Root cause": "根因",
  "Jobs that still need slicing or already have a slot are left untouched.": "仍需切片或已有時段的任務會保持不變。",
  "Keep production moving": "保持生產運作",
  "Keyholes": "鑰匙孔",
  "3DSTU FarmFlow": "3DSTU FarmFlow",
  "Add a spool before creating a purchase request": "建立採購請求前請先新增線材捲",
  "Loaded filament": "已載入線材",
  "Log 20g usage": "記錄使用 20g",
  "Log 20g usage on scan": "掃描時記錄使用 20g",
  "Low Priority Queue": "低優先佇列",
  "MQTT event stream": "MQTT 事件串流",
  "Machine": "機器",
  "Machine time": "機器時間",
  "Magnet pockets": "磁鐵槽",
  "Maintenance job created": "維護任務已建立",
  "Manage plan": "管理方案",
  "Manual": "手動",
  "Manual profile": "手動設定檔",
  "Mark rush": "標記急件",
  "Mark quoted": "標記已報價",
  "Match queue now": "立即匹配佇列",
  "Matching inspector": "匹配檢查器",
  "Material compatibility": "材料相容性",
  "Material mismatch": "材料不符",
  "Material mix": "材料組合",
  "Min changeovers": "最少換料",
  "Minimum quote": "最低報價",
  "Moonraker": "Moonraker",
  "Move to location": "移動到地點",
  "Needs scheduling": "需要排單",
  "Needs slicing": "需要切片",
  "New job": "新增任務",
  "New password": "新密碼",
  "New passwords do not match": "新密碼不一致",
  "No billing records yet.": "尚無帳務紀錄。",
  "No commerce feeds yet. Save one above or use CSV intake.": "尚無電商資料來源，請先在上方儲存或使用 CSV 匯入。",
  "No commerce imports yet": "尚無電商匯入紀錄",
  "No jobs generated": "尚未生成任務",
  "No jobs in this state": "此狀態沒有任務",
  "No matched jobs": "沒有匹配任務",
  "No notification deliveries yet": "尚無通知送達紀錄",
  "No open problem reports": "尚無未結問題回報",
  "No printer available for reprint": "沒有可用打印機可重新打印",
  "No restore preview loaded.": "尚未載入還原預覽。",
  "No saved templates yet": "尚無已儲存範本",
  "No schedulable jobs": "沒有可排程任務",
  "No slicer jobs yet": "尚無切片任務",
  "No urgent due risk right now": "目前沒有緊急交期風險",
  "No webhook deliveries yet": "尚無 Webhook 送達紀錄",
  "Notification center": "通知中心",
  "Notification channel save failed. Check URL, role, or API status.": "通知通道儲存失敗，請檢查 URL、角色或 API 狀態。",
  "Notification channels": "通知通道",
  "Notification delivery log": "通知送達紀錄",
  "Notification test failed. Check URL, role, or API status.": "通知測試失敗，請檢查 URL、角色或 API 狀態。",
  "Notification toggle saved locally only": "通知開關僅已暫存於本機",
  "OctoPrint": "OctoPrint",
  "Open problem reports": "未結問題回報",
  "Optional bearer token": "選填 Bearer 權杖",
  "Optional rack/bin": "選填層架/料箱",
  "Organization": "組織",
  "Overhead": "營運成本",
  "Part created from file library": "已從檔案庫建立零件",
  "Password change failed. Check your current password.": "密碼變更失敗，請檢查目前密碼。",
  "Password changed": "密碼已變更",
  "Password reset required": "需要重設密碼",
  "Past 7 days": "過去 7 天",
  "Past month": "過去一個月",
  "Pause / resume": "暫停 / 繼續",
  "Permission matrix": "權限矩陣",
  "Plain plate": "純平板",
  "Plan": "方案",
  "Plan and storage": "方案與儲存空間",
  "Plan change requires owner/admin access and live API": "方案變更需要擁有者/管理員權限與可用 API。",
  "Plan jobs": "規劃任務",
  "Preheat": "預熱",
  "Print Farm": "打印農場",
  "Print estimates": "打印估算",
  "Print history": "打印歷史",
  "Printer bridges": "打印機橋接",
  "Printer name": "打印機名稱",
  "Process": "製程",
  "Process fallback": "製程備援",
  "Publishes matching production events to": "發布符合條件的生產事件到",
  "QoS": "QoS",
  "Queue order updated": "佇列順序已更新",
  "Queue records stay available for audit and reporting after archiving.": "封存後佇列紀錄仍可用於稽核與報表。",
  "Refresh": "重新整理",
  "Reprint": "重新打印",
  "Reopen": "重新開啟",
  "Reprint added locally": "重新打印已暫存於本機",
  "Reprint added to queue": "重新打印已加入佇列",
  "Require 2FA for admins": "管理員必須使用 2FA",
  "Reset password": "重設密碼",
  "Restore JSON": "還原 JSON",
  "Restore commit requires admin restore access": "確認還原需要管理員還原權限。",
  "Restore preview ready": "還原預覽已就緒",
  "Restore preview requires a valid backup and admin access": "還原預覽需要有效備份與管理員權限。",
  "Restrict API keys by IP": "依 IP 限制 API 金鑰",
  "Retain messages": "保留訊息",
  "Run the first slice job": "執行第一個切片任務",
  "Rush jobs due today create exception todos before they are late.": "今日到期的急件會在逾期前建立異常待辦。",
  "SKU assembled from linked parts": "已從連結零件組成 SKU",
  "SKU mapping rules": "SKU 對應規則",
  "Sample order added": "範例訂單已新增",
  "Save MQTT": "儲存 MQTT",
  "Save bridge": "儲存橋接",
  "Save channel": "儲存通道",
  "Save formula": "儲存公式",
  "Save policy": "儲存政策",
  "Save these recovery codes now:": "請立即儲存這些復原碼：",
  "Save webhook": "儲存 Webhook",
  "Scan code": "掃描碼",
  "Search audit": "搜尋稽核",
  "Security": "安全性",
  "Selected jobs marked rush": "已將選取任務標記為急件",
  "Send a test or trigger a production event": "傳送測試或觸發生產事件",
  "Send test alert": "傳送測試警報",
  "Set up 2FA": "設定 2FA",
  "Shopify, Etsy, Manual": "Shopify、Etsy、手動",
  "Slack": "Slack",
  "Slicer job completed": "切片任務已完成",
  "Slicer job failed": "切片任務失敗",
  "Snooze": "延後",
  "Spool added": "線材捲已新增",
  "Spool scan did not match inventory": "線材捲掃描未匹配庫存",
  "Spool scanner": "線材捲掃描器",
  "Support snapshot generated": "支援快照已產生",
  "Support snapshot failed. Owner/admin export access is required.": "支援快照失敗，需要擁有者/管理員匯出權限。",
  "Success trend": "成功率趨勢",
  "Sync all": "全部同步",
  "Team and permissions": "團隊與權限",
  "Temporary password for this invite:": "此邀請的臨時密碼：",
  "Test": "測試",
  "Test notification created": "測試通知已建立",
  "Test send": "測試傳送",
  "Test sync": "測試同步",
  "Theme": "主題",
  "Thickness mm": "厚度 mm",
  "This printer will be available for scheduler matching after it is added.": "新增後，此打印機可用於排單匹配。",
  "Timezone": "時區",
  "Two-factor authentication": "雙因素驗證",
  "Two-factor authentication disabled": "雙因素驗證已停用",
  "Two-factor authentication enabled": "雙因素驗證已啟用",
  "Two-factor code": "雙因素代碼",
  "Two-factor code could not be verified": "無法驗證雙因素代碼",
  "Two-factor disable failed. Check password and code.": "停用雙因素驗證失敗，請檢查密碼與代碼。",
  "Two-factor setup requires a live signed-in session": "雙因素設定需要有效登入工作階段。",
  "Two-factor setup started": "雙因素設定已開始",
  "Units": "單位",
  "Units and locale": "單位與地區",
  "Upload Only": "僅上傳",
  "Use a feed or CSV to create the first batch": "使用資料來源或 CSV 建立第一批訂單",
  "Use closest layer-height process when an exact profile is missing.": "缺少精確設定檔時，使用最接近層高的製程。",
  "Username": "使用者名稱",
  "Warn before fallback starts": "備援開始前警告",
  "Webhook event log": "Webhook 事件紀錄",
  "Webhook name": "Webhook 名稱",
  "Webhook saved locally. Check URL, role, or API status.": "Webhook 已暫存於本機，請檢查 URL、角色或 API 狀態。",
  "Webhook test failed. Check URL, role, or API status.": "Webhook 測試失敗，請檢查 URL、角色或 API 狀態。",
  "Webhook toggle saved locally only": "Webhook 開關僅已暫存於本機",
  "When a task enters needs slicing, assign it to the slicing owner.": "任務進入需要切片時，指派給切片負責人。",
  "When a task is ready but unscheduled, notify the scheduler.": "任務已就緒但尚未排單時，通知排單人員。",
  "When the model exceeds a printer volume, create a scheduler todo before production starts.": "模型超出打印機成形尺寸時，在生產前建立排單待辦。",
  "When the selected printer cannot run the material, create a change-material todo.": "選取的打印機無法使用該材料時，建立換料待辦。",
  "Width mm": "寬度 mm",
  "Workspace restored. Reloading state.": "工作區已還原，正在重新載入狀態。",
  "Workspace-wide": "整個工作區",
  "email recipients, optional": "email 收件人，選填"
  ,
  "Default": "預設",
  "Set default": "設為預設",
  "Saving": "儲存中",
  "Save rules": "儲存規則",
  "Only match jobs to printers with compatible nozzle, bed, chamber, and loaded spool profile.": "只將任務匹配到噴嘴、熱床、腔體與已載入線材設定相容的打印機。",
  "Required for auto-queue": "自動佇列必須符合",
  "Operator warning only": "僅提醒操作員",
  "Fallback enabled": "已啟用備援",
  "Exact profile required": "必須使用精確設定檔",
  "Paid orders can override classroom and low-priority queues when due dates are close.": "付費訂單在交期接近時可優先於教室與低優先佇列。",
  "hour due window": "小時交期視窗",
  "3D printing farm operating system": "3D 打印農場作業系統",
  "Plan every printer, file, material, and operator from one production control layer.": "從同一個生產控制層規劃每台打印機、檔案、材料與操作員。",
  "Open App": "開啟系統",
  "Contact 3DSTU": "聯絡 3DSTU",
  "Live production signals": "即時生產訊號",
  "Active queue": "進行中佇列",
  "Automated todos": "自動待辦",
  "Printer states": "打印機狀態",
  "Built for real print-farm operations": "為真實打印農場營運打造",
  "One system for the work between orders and machines.": "用一套系統串起訂單與機器之間的所有工作。",
  "Order to production": "訂單到生產",
  "Turn commerce or manual jobs into structured queue items.": "將電商或手動任務轉成結構化佇列項目。",
  "Scheduling intelligence": "智慧排單",
  "Match material, size, due date, and printer state before production starts.": "在生產開始前匹配材料、尺寸、交期與打印機狀態。",
  "Human exception handling": "人工例外處理",
  "Generate todos for slicing, material changes, post-processing, and late work.": "自動產生切片、換料、後處理與逾期工作的待辦。",
  "Operational backbone": "營運骨幹",
  "Keep files, versions, maintenance, roles, audit logs, and backups together.": "集中管理檔案、版本、維護、角色、稽核紀錄與備份。",
  "Deployment ready": "可部署上線",
  "Docker, Ubuntu, Nginx, HTTPS, backups, and health checks are part of the repo.": "Docker、Ubuntu、Nginx、HTTPS、備份與健康檢查都已納入倉庫。",
  "Professional setup available": "提供專業建置服務",
  "3DSTU support snapshot": "3DSTU 支援快照",
  "Creates a redacted operational snapshot for support without passwords, tokens, API key hashes, or billing secrets.": "建立遮蔽敏感資訊的營運支援快照，不包含密碼、Token、API key hash 或付款機密。",
  "G-code toolpath": "G-code 路徑",
  "Compatible printers": "相容打印機",
  "No matching printer": "沒有相符打印機",
  "Check material and build volume": "檢查材料與成型尺寸",
  "Generate": "產生",
  "Generating": "產生中",
  "Go-live checklist update failed. Check role or API status.": "上線檢查清單更新失敗，請檢查角色或 API 狀態。",
  "Need installation, training, or technical support?": "需要安裝、訓練或技術支援嗎？",
  "Website sections": "網站段落",
  "Platform": "平台",
  "Workflow": "流程",
  "Operations": "營運",
  "Support": "支援",
  "Today's queue": "今日佇列",
  "jobs structured by status, material, and due risk": "依狀態、材料與交期風險結構化的任務",
  "Operator todos": "操作員待辦",
  "generated from production state instead of manual reminders": "由生產狀態自動產生，而非手動提醒",
  "Deployment track": "部署軌道",
  "Docker, HTTPS, backups, health checks, and audit logs": "Docker、HTTPS、備份、健康檢查與稽核紀錄",
  "Production control for serious 3D printing teams.": "為專業 3D 打印團隊打造的生產控制系統。",
  "3DSTU FarmFlow connects orders, files, materials, printers, operators, alerts, and backups into one deployable SaaS platform for real print-farm operations.": "3DSTU FarmFlow 將訂單、檔案、材料、打印機、操作員、警報與備份整合成一套可部署的 SaaS 平台，服務真實打印農場營運。",
  "Talk to 3DSTU": "聯絡 3DSTU",
  "Built for": "適用於",
  "Print farms": "打印農場",
  "Service bureaus": "代工服務商",
  "Makerspaces": "創客空間",
  "School labs": "學校實驗室",
  "Factory prototyping teams": "工廠打樣團隊",
  "Why it exists": "為什麼需要它",
  "A print farm does not need another task list. It needs an operating layer.": "打印農場不需要另一個任務清單，而是需要一個作業控制層。",
  "From order chaos to machine-ready work": "把混亂訂單變成可上機工作",
  "Every job carries the production facts that matter: model file, material, color, nozzle, build volume, due date, slicing state, operator owner, printer match, and exception history.": "每個任務都帶著真正影響生產的資料：模型檔、材料、顏色、噴嘴、成形尺寸、交期、切片狀態、負責操作員、打印機匹配與異常歷史。",
  "Humans handle exceptions, not repetitive tracking": "人處理例外，不處理重複追蹤",
  "Todos are generated when state changes: slicing needed, scheduling needed, material mismatch, maintenance risk, completion pickup, post-processing, or late-work escalation.": "狀態變更時自動產生待辦：需要切片、需要排單、材料不符、維護風險、完成取件、後處理或逾期升級。",
  "Deployment is part of the product": "部署就是產品的一部分",
  "The repo includes Docker deployment, Nginx and HTTPS guidance, health checks, backups, restore preview, audit trails, and support paths for customer farms.": "倉庫包含 Docker 部署、Nginx 與 HTTPS 指引、健康檢查、備份、還原預覽、稽核軌跡，以及客戶農場的支援路徑。",
  "Operating workflow": "作業流程",
  "One flow from intake to completed print.": "從接單到完成打印的一條流程。",
  "FarmFlow is designed around the production decisions that cost time when they live in chat, spreadsheets, slicer notes, and memory.": "FarmFlow 圍繞那些散落在聊天、試算表、切片備註和人腦記憶中、最耗時間的生產決策而設計。",
  "Intake": "接單",
  "Bring in manual, CSV, webhook, or commerce orders and turn them into structured production jobs.": "匯入手動、CSV、Webhook 或電商訂單，轉成結構化生產任務。",
  "Validate": "驗證",
  "Check model files, material needs, print volume, slicing state, and quote assumptions before the job reaches a machine.": "在任務上機前檢查模型檔、材料需求、打印尺寸、切片狀態與報價假設。",
  "Drag jobs onto printers or run automated matching with material, color, nozzle, capacity, and due-date constraints.": "將任務拖到打印機，或依材料、顏色、噴嘴、產能與交期限制進行自動匹配。",
  "Produce": "生產",
  "Track printer state, operator actions, file versions, maintenance, alerts, and exception todos in one control layer.": "在同一控制層追蹤打印機狀態、操作員動作、檔案版本、維護、警報與例外待辦。",
  "Close the loop": "閉環",
  "Archive job history, reprint from previous work, export reports, restore backups, and keep customer operations traceable.": "封存任務歷史、從舊任務重印、匯出報表、還原備份，並保持客戶營運可追溯。",
  "Platform depth": "平台深度",
  "Built around the real constraints of printers, people, files, and delivery promises.": "圍繞打印機、人員、檔案與交付承諾的真實限制打造。",
  "Queue intelligence": "佇列智慧",
  "Status-driven jobs, rush flags, due windows, commerce imports, CSV intake, SKU mapping, and reprint history.": "狀態驅動任務、急件標記、交期視窗、電商匯入、CSV 接單、SKU 對應與重印歷史。",
  "Scheduling engine": "排單引擎",
  "Drag-and-drop planning, dry-run matching, material conflicts, volume checks, due-risk warnings, and load balancing.": "拖曳排程、試算匹配、材料衝突、尺寸檢查、交期風險警告與負載平衡。",
  "File operations": "檔案作業",
  "STL, 3MF, and G-code uploads, model metadata, generated thumbnails, stored versions, slicer profiles, and G-code outputs.": "STL、3MF 與 G-code 上傳、模型資料、縮圖生成、版本儲存、切片設定檔與 G-code 輸出。",
  "Fleet control": "設備控制",
  "Printer states, bridge configs, OctoPrint/Moonraker-style sync, API actions, telemetry, and maintenance workflows.": "打印機狀態、橋接設定、OctoPrint/Moonraker 類型同步、API 動作、遙測與維護流程。",
  "Team execution": "團隊執行",
  "Role permissions, automatic todos, 2FA, audit logs, notifications, webhooks, Slack, Discord, and email channels.": "角色權限、自動待辦、2FA、稽核紀錄、通知、Webhook、Slack、Discord 與 Email 通道。",
  "Business layer": "商業層",
  "Cost catalog, storage usage, billing hooks, quote assumptions, backups, restore previews, and customer-ready deployment.": "成本目錄、儲存用量、帳務掛鉤、報價假設、備份、還原預覽與客戶可用部署。",
  "See the work that needs attention before it becomes expensive.": "在問題變昂貴前，看見需要注意的工作。",
  "Which jobs are due today, late, blocked, or waiting for slicing.": "哪些任務今日到期、逾期、被阻擋或等待切片。",
  "Which printers are idle, printing, paused, offline, in error, or under maintenance.": "哪些打印機閒置、打印中、暫停、離線、異常或維護中。",
  "Which material changes, build-volume conflicts, or due-date risks need a person.": "哪些換料、成形尺寸衝突或交期風險需要人工處理。",
  "Which operators have actionable work generated from the production state.": "哪些操作員有由生產狀態產生的可執行工作。",
  "3D printing production scheduling workspace": "3D 打印生產排程工作區",
  "3DSTU customer model": "3DSTU 客戶模式",
  "Free for 3DSTU farm customers, source-available with commercial-use boundaries.": "免費提供給 3DSTU 農場客戶使用，原始碼可見並設有商業使用邊界。",
  "Use it to run your farm": "用它營運你的農場",
  "Customers can self-host, operate production, and earn from their own printing services.": "客戶可以自架、營運生產，並從自己的打印服務中獲利。",
  "Protect the platform": "保護平台",
  "The license does not allow selling the script, modified source, clones, or hosted resale services.": "授權不允許販售腳本、修改後原始碼、複製品或託管轉售服務。",
  "Get expert setup": "取得專家建置",
  "Professional installation, technical setup, and training are available from 3DSTU.": "3DSTU 可提供專業安裝、技術設定與訓練。",
  "Need installation, training, custom integration, or technical support?": "需要安裝、訓練、自訂整合或技術支援嗎？",
  "Contact the 3DSTU team for deployment support, farm onboarding, connector planning, and production workflow design.": "聯絡 3DSTU 團隊取得部署支援、農場導入、連接器規劃與生產流程設計。",
  "Designed for": "適用於",
  "Docs": "文檔",
  "GitHub": "GitHub",
  "Install": "安裝",
  "Roadmap": "路線圖",
  "Project home": "專案首頁",
  "PrusaLink": "PrusaLink",
  "Connect Prusa printers through the local PrusaLink HTTP API.": "透過本機 PrusaLink HTTP API 連接 Prusa 打印機。",
  "GitHub repository": "GitHub 倉庫",
  "Source, releases, deployment scripts, issue tracking, and project documentation live in the public repository.": "原始碼、版本、部署腳本、問題追蹤與專案文檔都放在公開倉庫。",
  "Open GitHub": "開啟 GitHub",
  "Current version": "目前版本",
  "System version": "系統版本",
  "Manual recipe": "手動配方",
  "Mark ordered": "標記已下單",
  "Material purchasing": "材料採購",
  "No production templates yet": "尚無生產範本",
  "No purchase requests yet. Generate a reorder plan from low-stock spools.": "尚無採購請求，請從低庫存線材生成補貨計畫。",
  "No quote requests yet. Website submissions will appear here.": "尚無詢價請求，網站提交會顯示在這裡。",
  "No quote expiry": "未設定報價有效期",
  "Download model": "下載模型",
  "Open reorders": "待處理補貨",
  "Copy portal link": "複製入口連結",
  "Rotate link": "輪換連結",
  "Rotating": "輪換中",
  "Customer portal link copied": "客戶入口連結已複製",
  "Customer portal link ready": "客戶入口連結已建立",
  "Customer portal link could not be created. Check API status.": "無法建立客戶入口連結，請檢查 API 狀態。",
  "Customer quote intake": "客戶詢價入口",
  "Send print requirements into the production pipeline.": "將打印需求送入生產流程。",
  "Company": "公司",
  "Project": "專案",
  "Budget": "預算",
  "Due date": "交期",
  "File name": "檔案名稱",
  "Quantity": "數量",
  "Notes": "備註",
  "Request quote": "送出詢價",
  "Quote": "報價",
  "model.stl / model.3mf": "model.stl / model.3mf",
  "qr-...": "qr-...",
  "Quote intake": "詢價入口",
  "Quote requests": "詢價請求",
  "Quote request ID": "詢價單 ID",
  "Quote status lookup": "詢價狀態查詢",
  "Quote valid until": "報價有效至",
  "Requesting quote changes...": "正在送出修改要求...",
  "Tracking token": "追蹤權杖",
  "Check status": "查詢狀態",
  "Approve quote": "接受報價",
  "Reject quote": "拒絕報價",
  "Request changes": "要求修改",
  "Save the returned tracking token to check quote status after the operator reviews it.": "請保存回傳的追蹤權杖，操作員審核後可查詢詢價狀態。",
  "Quoting": "報價中",
  "Accept / order": "接受 / 轉訂單",
  "New quotes": "新詢價",
  "Purchase request": "採購請求",
  "Qty": "數量",
  "Receive": "收貨",
  "Receiving": "收貨中",
  "Save template": "儲存範本",
  "Save a reusable recipe from the file library, then run it into the print queue whenever a customer or stock batch repeats.": "從檔案庫儲存可重複使用的配方，當客戶訂單或庫存批次重複時即可送入打印佇列。",
  "Saving template": "儲存範本中",
  "Templates": "範本",
  "Upload a model file before saving a template": "儲存範本前請先上傳模型檔",
  "Public deployment": "公開部署",
  "Production domain": "正式網域",
  "Documentation and install path": "文檔與安裝路徑",
  "Run it locally, deploy it with Docker, or operate it behind Nginx and HTTPS on Ubuntu.": "可以本機執行、使用 Docker 部署，或在 Ubuntu 上搭配 Nginx 與 HTTPS 營運。",
  "Clone": "複製",
  "Deploy": "部署",
  "Verify": "驗證",
  "git clone the repository and copy .env.example to .env.": "git clone 倉庫，並將 .env.example 複製成 .env。",
  "Set admin credentials, public URL, worker token, metrics token, and production security flags.": "設定管理員帳密、公開 URL、worker token、metrics token 與正式環境安全開關。",
  "Start Docker Compose or run the Ubuntu deployment scripts for Nginx, HTTPS, backups, and ops checks.": "啟動 Docker Compose，或執行 Ubuntu 部署腳本設定 Nginx、HTTPS、備份與營運檢查。",
  "Run QC, readiness, smoke checks, backup drills, and then push the versioned release to GitHub.": "執行 QC、readiness、smoke check、備份演練，然後將版本化 release 推到 GitHub。",
  "View install guide": "查看安裝指南",
  "View operations runbook": "查看營運手冊",
  "Competitive roadmap": "競品吸收路線圖",
  "What we are absorbing from the print-farm ecosystem.": "我們正在吸收 3D 打印農場生態系的優點。",
  "FDM Monster": "FDM Monster",
  "Multi-protocol printer connectors, batch printing, grid-based printer layout, backups, and thumbnails.": "多協議打印機連接、批量打印、網格化設備佈局、備份與縮圖。",
  "OctoFarm": "OctoFarm",
  "Single-pane monitoring for many OctoPrint instances and websocket-driven farm status.": "多個 OctoPrint 實例的單一面板監控與 WebSocket 農場狀態。",
  "Spoolman": "Spoolman",
  "Filament inventory, spool usage tracking, and automatic weight deduction through Klipper/Moonraker-style integrations.": "線材庫存、線材捲用量追蹤，以及透過 Klipper/Moonraker 類整合自動扣重。",
  "Obico and PrintWatch": "Obico 與 PrintWatch",
  "AI failure detection, camera-driven monitoring, anomaly alerts, and remote printer visibility.": "AI 失敗偵測、攝影機監控、異常警報與遠端設備可視化。",
  "FilaOps, LayerlyOS, Daedalus, runsodin, PrintStream": "FilaOps、LayerlyOS、Daedalus、runsodin、PrintStream",
  "ERP/MRP depth, no-cloud MES/SCADA positioning, profitability analytics, PWA, shared libraries, and plugin systems.": "ERP/MRP 深度、無雲端 MES/SCADA 定位、盈利分析、PWA、共享檔案庫與插件系統。",
  "Next build priorities": "下一階段開發重點",
  "Printer bridge hardening": "打印機橋接強化",
  "Connector test harnesses for OctoPrint, Moonraker/Klipper, PrusaLink, Bambu LAN, Creality, and Snapmaker-style devices.": "為 OctoPrint、Moonraker/Klipper、PrusaLink、Bambu LAN、Creality 與 Snapmaker 類設備建立連接器測試框架。",
  "Material automation": "材料自動化",
  "Reserve spools for scheduled work, deduct usage from completed prints, and warn before a job runs out of material.": "為已排程任務預留線材，完成打印後扣除用量，並在材料不足前警告。",
  "Failure and waste intelligence": "失敗與耗損智慧",
  "Track failed prints, wasted filament, root causes, reprint cost, and printer-specific reliability trends.": "追蹤失敗打印、浪費線材、根因、重印成本與各設備可靠度趨勢。",
  "File and preview depth": "檔案與預覽深度",
  "Add richer STL/3MF previews, G-code visualization, slicing presets, and reusable production templates.": "加入更完整的 STL/3MF 預覽、G-code 視覺化、切片預設與可重用生產範本。",
  "Docs in repository": "倉庫文檔",
  "Installation guide": "安裝指南",
  "Operations runbook": "營運手冊",
  "Roadmap document": "路線圖文檔",
  "From MVP shell toward production-grade operations.": "? MVP ????????????"
};

const traditionalToSimplifiedPairs = [
  ["雲端", "云端"], ["列印", "打印"], ["打印", "打印"], ["檔案", "文件"], ["資料", "数据"],
  ["狀態", "状态"], ["佇列", "队列"], ["優先", "优先"], ["級", "级"], ["儀表板", "仪表盘"],
  ["維護", "维护"], ["團隊", "团队"], ["擴充", "扩展"], ["設定", "设置"], ["匯入", "导入"],
  ["匯出", "导出"], ["啟用", "启用"], ["停用", "停用"], ["儲存", "保存"], ["建立", "创建"],
  ["新增", "新增"], ["刪除", "删除"], ["顯示", "显示"], ["資訊", "信息"], ["應用", "应用"],
  ["異常", "异常"], ["錯誤", "错误"], ["離線", "离线"], ["閒置", "空闲"], ["線材", "耗材"],
  ["線材捲", "料卷"], ["材料", "材料"], ["相容", "兼容"], ["衝突", "冲突"], ["尺寸", "尺寸"],
  ["不匹配", "不匹配"], ["風險", "风险"], ["交期", "交期"], ["待辦", "待办"], ["專業", "专业"],
  ["技術", "技术"], ["支援", "支持"], ["安裝", "安装"], ["負責", "负责"],
  ["負載", "负载"], ["排單", "排产"], ["排程", "排程"], ["範例", "示例"], ["範本", "模板"],
  ["組織", "组织"], ["權限", "权限"], ["驗證", "验证"], ["密鑰", "密钥"], ["金鑰", "密钥"],
  ["帳號", "账号"], ["密碼", "密码"], ["暫停", "暂停"], ["繼續", "继续"], ["開啟", "打开"],
  ["關閉", "关闭"], ["瀏覽", "浏览"], ["搜尋", "搜索"], ["選取", "选择"], ["選填", "选填"],
  ["規則", "规则"], ["計畫", "计划"], ["預設", "默认"], ["預熱", "预热"], ["復原", "恢复"],
  ["還原", "还原"], ["備份", "备份"], ["稽核", "审计"], ["紀錄", "记录"], ["歷史", "历史"],
  ["營收", "营收"], ["幣別", "币种"], ["金額", "金额"], ["價格", "价格"], ["帳務", "账务"],
  ["通知", "通知"], ["橋接", "桥接"], ["整合", "集成"], ["工作區", "工作区"], ["本機", "本机"],
  ["生產", "生产"], ["製程", "工艺"], ["製作", "制作"], ["機器", "机器"], ["打印機", "打印机"],
  ["打印農場", "打印农场"], ["打印工作室", "打印工作室"], ["雲", "云"], ["與", "与"], ["於", "于"],
  ["為", "为"], ["會", "会"], ["後", "后"], ["將", "将"], ["這", "这"], ["個", "个"],
  ["請", "请"], ["無", "无"], ["當", "当"], ["並", "并"], ["進", "进"], ["達", "达"],
  ["檢查", "检查"], ["連接", "连接"], ["連線", "连接"], ["導覽", "导航"], ["產生", "生成"],
  ["產線", "产线"], ["雜湊", "哈希"], ["標記", "标记"], ["標籤", "标签"], ["標題", "标题"],
  ["類型", "类型"], ["數量", "数量"], ["數據", "数据"], ["轉換", "转换"], ["訊息", "消息"],
  ["支撐", "支撑"], ["雕刻", "雕刻"], ["厚度", "厚度"], ["寬度", "宽度"], ["高度", "高度"],
  ["分鐘", "分钟"], ["小時", "小时"], ["過去", "过去"], ["目前", "当前"], ["臨時", "临时"],
  ["擁有者", "所有者"], ["管理員", "管理员"], ["使用者", "用户"], ["電子郵件", "电子邮件"],
  ["英文", "英文"], ["繁體中文", "繁体中文"], ["簡體中文", "简体中文"], ["語言", "语言"]
] as const;

function toSimplifiedChinese(value: string) {
  return traditionalToSimplifiedPairs.reduce((text, [traditional, simplified]) => text.split(traditional).join(simplified), value);
}

const zhCnTranslations: Record<string, string> = Object.fromEntries(
  Object.entries(zhTwTranslations).map(([en, zh]) => [en, toSimplifiedChinese(zh)])
);

const enTranslations: Record<string, string> = {};
Object.entries(zhTwTranslations).forEach(([en, zh]) => {
  enTranslations[zh] ??= en;
  enTranslations[zhCnTranslations[en]] ??= en;
});

function localizeText(value: string, language: Language) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const translated = language === "zh-TW" ? zhTwTranslations[trimmed] : language === "zh-CN" ? zhCnTranslations[trimmed] : enTranslations[trimmed];
  if (!translated) return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

function applyLanguage(language: Language) {
  document.documentElement.lang = language;
  const ignored = new Set(["SCRIPT", "STYLE", "SVG", "PATH", "CODE", "SELECT", "OPTION", "TEXTAREA"]);
  const root = document.querySelector(".marketing-site, .auth-page, .app-shell") || document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  nodes.forEach((node) => {
    const parent = node.parentElement;
    if (!parent || parent.closest("[data-i18n-ignore]")) return;
    if (ignored.has(parent.tagName) || parent.closest("code, select, option, textarea")) return;
    const next = localizeText(node.nodeValue ?? "", language);
    if (next !== node.nodeValue) node.nodeValue = next;
  });
  root.querySelectorAll<HTMLElement>("[placeholder], [title], [aria-label]").forEach((element) => {
    if (element.closest("[data-i18n-ignore]")) return;
    ["placeholder", "title", "aria-label"].forEach((attribute) => {
      const value = element.getAttribute(attribute);
      if (!value) return;
      const next = localizeText(value, language);
      if (next !== value) element.setAttribute(attribute, next);
    });
  });
}

function useLocalizedDom(language: Language) {
  useEffect(() => {
    applyLanguage(language);
    const observer = new MutationObserver(() => applyLanguage(language));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [language]);
}

const initialPrinters: Printer[] = [
  {
    id: "p1",
    name: "Forge A1",
    model: "CoreXY Pro 300",
    location: "Studio North",
    status: "printing",
    connection: "Klipper / Moonraker",
    job: "Aero duct v3.gcode",
    progress: 62,
    nozzle: 211,
    bed: 58,
    targetNozzle: 215,
    targetBed: 60,
    filament: "PLA Matte Black",
    compatibleMaterials: ["PLA", "PETG", "TPU"],
    buildVolume: [300, 300, 300],
    uptime: 94,
    utilization: 71,
    queue: 4,
    camera: "Layer preview"
  },
  {
    id: "p2",
    name: "Resin Bay",
    model: "MSLA Ultra 8K",
    location: "Clean Room",
    status: "idle",
    connection: "Manual mock bridge",
    progress: 0,
    nozzle: 0,
    bed: 0,
    targetNozzle: 0,
    targetBed: 0,
    filament: "Tough Resin Gray",
    compatibleMaterials: ["Resin"],
    buildVolume: [220, 130, 250],
    uptime: 82,
    utilization: 44,
    queue: 1,
    camera: "Vat view"
  },
  {
    id: "p3",
    name: "Campus MK4",
    model: "Prusa MK4",
    location: "School Lab",
    status: "paused",
    connection: "OctoPrint",
    job: "Physics gear set.gcode",
    progress: 36,
    nozzle: 198,
    bed: 54,
    targetNozzle: 205,
    targetBed: 55,
    filament: "PETG Signal Orange",
    compatibleMaterials: ["PLA", "PETG"],
    buildVolume: [250, 210, 220],
    uptime: 76,
    utilization: 58,
    queue: 6,
    camera: "Lab camera"
  },
  {
    id: "p4",
    name: "Farm Loop 07",
    model: "Bambu-style bridge",
    location: "Print Farm",
    status: "error",
    connection: "Cloud bridge",
    job: "Bracket batch.gcode",
    progress: 12,
    nozzle: 189,
    bed: 45,
    targetNozzle: 220,
    targetBed: 65,
    filament: "ASA White",
    compatibleMaterials: ["PLA", "PETG", "ASA"],
    buildVolume: [256, 256, 256],
    uptime: 63,
    utilization: 89,
    queue: 11,
    camera: "Bed check"
  },
  {
    id: "p5",
    name: "Archive Mini",
    model: "Ender 3 V3",
    location: "Workshop",
    status: "offline",
    connection: "OctoPrint",
    progress: 0,
    nozzle: 24,
    bed: 23,
    targetNozzle: 0,
    targetBed: 0,
    filament: "PLA Silk Blue",
    compatibleMaterials: ["PLA", "PETG"],
    buildVolume: [220, 220, 250],
    uptime: 40,
    utilization: 18,
    queue: 0,
    camera: "Offline"
  },
  {
    id: "p6",
    name: "Service Prusa",
    model: "Prusa XL",
    location: "Maintenance Bay",
    status: "maintenance",
    connection: "OctoPrint",
    progress: 0,
    nozzle: 24,
    bed: 22,
    targetNozzle: 0,
    targetBed: 0,
    filament: "PLA White",
    compatibleMaterials: ["PLA", "PETG", "TPU"],
    buildVolume: [360, 360, 360],
    uptime: 51,
    utilization: 32,
    queue: 0,
    camera: "Service mode"
  }
];

const initialFiles: PrintFile[] = [
  { id: "f1", name: "Aero duct v3.gcode", type: "GCODE", folder: "Production", size: "28 MB", material: "PLA", tags: ["airflow", "verified"], sliced: true, status: "approved", version: 4, dimensions: [126, 88, 42], thumbnail: "duct", printTime: "3h 18m", cost: 72, layerHeight: "0.20", usage: 84 },
  { id: "f2", name: "Camera mount.3mf", type: "3MF", folder: "Fixtures", size: "12 MB", material: "PETG", tags: ["mount"], sliced: false, status: "needs review", version: 2, dimensions: [92, 68, 56], thumbnail: "mount", printTime: "1h 42m", cost: 38, layerHeight: "0.16", usage: 42 },
  { id: "f3", name: "Student badge tray.stl", type: "STL", folder: "Education", size: "6 MB", material: "PLA", tags: ["school", "batch"], sliced: false, status: "uploaded", version: 1, dimensions: [235, 180, 16], thumbnail: "tray", printTime: "2h 04m", cost: 44, layerHeight: "0.20", usage: 50 },
  { id: "f4", name: "ASA enclosure hinge.gcode", type: "GCODE", folder: "Production", size: "44 MB", material: "ASA", tags: ["high-temp"], sliced: true, status: "sliced", version: 3, dimensions: [178, 42, 36], thumbnail: "hinge", printTime: "5h 55m", cost: 156, layerHeight: "0.24", usage: 133 },
  { id: "f5", name: "Miniature terrain.obj", type: "OBJ", folder: "Archive", size: "31 MB", material: "Resin", tags: ["resin"], sliced: false, status: "needs review", version: 5, dimensions: [118, 118, 96], thumbnail: "terrain", printTime: "4h 12m", cost: 122, layerHeight: "0.05", usage: 71 }
];

const initialQueue: QueueItem[] = [
  { id: "q1", fileId: "f1", file: "Aero duct v3.gcode", printerId: "p1", printer: "Forge A1", status: "printing", priority: "High", stage: "printing", material: "PLA", color: "Black", due: "Today 16:00", dimensions: [126, 88, 42], assignee: "Noah", scheduledStart: "09:00", time: "3h 18m", cost: 72, added: "Today 09:18" },
  { id: "q2", fileId: "f4", file: "ASA enclosure hinge.gcode", printerId: "p4", printer: "Farm Loop 07", status: "paused", priority: "Rush", stage: "blocked", material: "ASA", color: "White", due: "Today 14:30", dimensions: [178, 42, 36], assignee: "Maya", scheduledStart: "10:30", time: "5h 55m", cost: 156, added: "Today 10:42" },
  { id: "q3", fileId: "f2", file: "Camera mount.3mf", printerId: "p3", printer: "Campus MK4", status: "queued", priority: "Normal", stage: "needs scheduling", material: "PETG", color: "Orange", due: "Today 18:00", dimensions: [92, 68, 56], assignee: "Iain", time: "1h 42m", cost: 38, added: "Today 11:03" },
  { id: "q4", fileId: "f3", file: "Student badge tray.stl", printerId: "p2", printer: "Resin Bay", status: "queued", priority: "Low", stage: "needs slicing", material: "PLA", color: "Any", due: "Tomorrow 08:00", dimensions: [235, 180, 16], assignee: "Maya", time: "2h 04m", cost: 44, added: "Tomorrow 08:00" },
  { id: "q5", fileId: "f5", file: "Miniature terrain.obj", printerId: "p2", printer: "Resin Bay", status: "queued", priority: "High", stage: "needs scheduling", material: "Resin", color: "Gray", due: "Today 13:30", dimensions: [118, 118, 96], assignee: "Noah", time: "4h 12m", cost: 122, added: "Today 12:10" },
  { id: "q6", fileId: "f2", file: "Oversize fixture plate.3mf", printerId: "p5", printer: "Archive Mini", status: "queued", priority: "Rush", stage: "needs scheduling", material: "PETG", color: "Black", due: "Today 15:00", dimensions: [280, 230, 34], assignee: "Iain", time: "2h 48m", cost: 91, added: "Today 12:28" }
];

const initialSpools: Spool[] = [
  { id: "s1", material: "PLA", color: "#111827", brand: "Polymaker", remaining: 742, weight: 1000, location: "Rack A2", dry: true, nfc: "LP-PLA-001" },
  { id: "s2", material: "PETG", color: "#f97316", brand: "Prusament", remaining: 318, weight: 1000, location: "Rack B1", dry: true, nfc: "LP-PETG-014" },
  { id: "s3", material: "ASA", color: "#f8fafc", brand: "Bambu", remaining: 126, weight: 1000, location: "Dry box 2", dry: true, nfc: "LP-ASA-004" },
  { id: "s4", material: "TPU", color: "#22c55e", brand: "Overture", remaining: 86, weight: 500, location: "Rack C3", dry: false, nfc: "LP-TPU-002" },
  { id: "s5", material: "Resin", color: "#94a3b8", brand: "Siraya", remaining: 490, weight: 1000, location: "Clean Room", dry: true, nfc: "LP-RES-008" }
];

const initialMaintenance: MaintenanceJob[] = [
  { id: "m1", title: "Nozzle inspection", printer: "Forge A1", status: "in progress", due: "Today", progress: "2/4", severity: "Medium" },
  { id: "m2", title: "Belt tension check", printer: "Campus MK4", status: "scheduled", due: "Tomorrow", progress: "0/5", severity: "High" },
  { id: "m3", title: "Clean print bed", printer: "Farm Loop 07", status: "blocked", due: "Overdue", progress: "1/3", severity: "Urgent" },
  { id: "m4", title: "Lubricate rails", printer: "Archive Mini", status: "scheduled", due: "Jun 18", progress: "0/6", severity: "Low" }
];

const historySeed = [
  { file: "Robot gripper.gcode", printer: "Forge A1", status: "complete", duration: "6h 14m", material: "PLA", cost: 132, date: "Jun 13", note: "Dimensional check passed" },
  { file: "Bracket batch.gcode", printer: "Farm Loop 07", status: "failed", duration: "24m", material: "ASA", cost: 18, date: "Jun 12", note: "Warping on front-left corner" },
  { file: "Physics gear set.gcode", printer: "Campus MK4", status: "cancelled", duration: "1h 03m", material: "PETG", cost: 21, date: "Jun 12", note: "Paused for classroom demo" },
  { file: "Sensor housing.gcode", printer: "Archive Mini", status: "complete", duration: "2h 33m", material: "PLA", cost: 64, date: "Jun 11", note: "Reprint approved" }
];

const teamSeed: User[] = [
  { id: "u1", name: "Production Owner", email: "owner@layerpilot.test", role: "Owner", location: "HQ", lastSeen: "Now" },
  { id: "u2", name: "Maya Lin", email: "maya@layerpilot.test", role: "Admin", location: "Studio North", lastSeen: "13m ago" },
  { id: "u3", name: "Noah Chen", email: "noah@layerpilot.test", role: "Operator", location: "Print Farm", lastSeen: "1h ago" },
  { id: "u4", name: "Classroom Demo", email: "student@layerpilot.test", role: "Student", location: "School Lab", lastSeen: "Yesterday" }
];

const partSeed: Part[] = [
  { id: "part-1", name: "Aero duct assembly", fileId: "f1", material: "PLA", process: "0.20mm Production", plates: 1, variants: ["Black", "Blue"], status: "ready" },
  { id: "part-2", name: "Camera mount kit", fileId: "f2", material: "PETG", process: "0.16mm Detail", plates: 2, variants: ["Orange", "Carbon"], status: "ready" },
  { id: "part-3", name: "Student badge tray", fileId: "f3", material: "PLA", process: "Classroom fast", plates: 1, variants: ["Any color"], status: "needs profile" },
  { id: "part-4", name: "Parametric name plate", fileId: "f5", material: "PLA", process: "OpenSCAD mock", plates: 1, variants: ["Text", "Size", "Icon"], status: "draft" }
];

const skuSeed: SKU[] = [
  { id: "sku-1", sku: "DUCT-KIT-BLK", title: "Aero Duct Kit", parts: ["Aero duct assembly"], variants: ["Black", "Matte"], price: 680, stock: 14, channel: "Shopify" },
  { id: "sku-2", sku: "CAM-MOUNT-ORG", title: "Camera Mount Pack", parts: ["Camera mount kit"], variants: ["Orange", "M5 hardware"], price: 420, stock: 8, channel: "Etsy" },
  { id: "sku-3", sku: "CLASS-TRAY-20", title: "Classroom Badge Tray", parts: ["Student badge tray"], variants: ["Pack of 20"], price: 350, stock: 3, channel: "Manual" }
];

const orderSeed: Order[] = [
  { id: "ord-1048", source: "Shopify", customer: "M. Rivera", items: ["DUCT-KIT-BLK x2"], status: "queued", due: "Jun 14", value: 1360 },
  { id: "ord-1049", source: "Etsy", customer: "A. Wood", items: ["CAM-MOUNT-ORG x1"], status: "received", due: "Jun 15", value: 420 },
  { id: "ord-1050", source: "Manual", customer: "North Campus", items: ["CLASS-TRAY-20 x4"], status: "printing", due: "Jun 17", value: 1400 }
];

const profileSeed: Profile[] = [
  { id: "prof-1", name: "CoreXY Pro 300", kind: "Machine", target: "Forge A1", source: "Manual", updated: "Today" },
  { id: "prof-2", name: "0.20mm Production", kind: "Process", target: "FDM fleet", source: "Orca import", updated: "Yesterday" },
  { id: "prof-3", name: "PLA Matte Black", kind: "Filament", target: "PLA spools", source: "Bambu sync", updated: "Jun 10" },
  { id: "prof-4", name: "ASA enclosure profile", kind: "Filament", target: "Farm Loop 07", source: "Manual", updated: "Jun 8" }
];

const addonSeed: Addon[] = [
  { id: "commerce", name: "Commerce Connectors", description: "Import Shopify, Etsy, eBay, and manual orders into production.", category: "Commerce", status: "enabled", enabled: true },
  { id: "cost", name: "Cost Catalog", description: "Calculate material, labor, overhead, and SKU margin.", category: "Finance", status: "enabled", enabled: true },
  { id: "audit", name: "Audit Timeline", description: "Track who changed printers, orders, queue, profiles, and settings.", category: "Governance", status: "enabled", enabled: true },
  { id: "maintenance", name: "Maintenance Tracker", description: "Schedule recurring tasks from print hours and job counts.", category: "Operations", status: "enabled", enabled: true },
  { id: "mqtt", name: "MQTT Event Stream", description: "Broadcast realtime printer and order events to automations.", category: "Automation", status: "beta", enabled: false },
  { id: "pwa", name: "PWA Mobile Console", description: "Installable tablet and phone operations interface.", category: "Mobile", status: "available", enabled: false }
];

const auditSeed = [
  "Maya imported Orca process profiles",
  "Scheduler matched DUCT-KIT-BLK to Forge A1",
  "Noah marked Campus MK4 bed clear and ready",
  "Shopify order ord-1048 generated 2 queue jobs"
];

const integrations = [
  ["OctoPrint", "Connect USB printers through an OctoPrint plugin.", "Ready"],
  ["Klipper / Moonraker", "Stream status and send controls over a local bridge.", "Ready"],
  ["PrusaLink", "Connect Prusa printers through the local PrusaLink HTTP API.", "Ready"],
  ["Cura", "Send sliced files from Cura into the cloud library.", "Available"],
  ["OrcaSlicer", "Push plate exports to selected folders and queues.", "Available"],
  ["Slack", "Notify channels when jobs complete or fail.", "Connected"],
  ["Discord", "Post fleet alerts and daily farm summaries.", "Available"],
  ["Zapier", "Trigger automations from job, spool, and maintenance events.", "Beta"],
  ["n8n", "Self-hosted workflow hooks for advanced print farms.", "Beta"]
];
const defaultWorkspaceSettings: WorkspaceSettings = { organizationName: "North Campus Lab", defaultLocation: "Studio North", units: "metric", currency: "USD", timezone: "Asia/Taipei", theme: "system", requireAdmin2fa: true, auditLogRetention: true, auditLogRetentionDays: 365, restrictApiByIp: false, allowedApiIps: [], storageLimitGb: 10, hotDropMode: "Direct Print", plan: "Print Farm Trial" };
const defaultCostCatalog: CostCatalog = { currency: "USD", materialRates: { PLA: 0.82, PETG: 1.05, ASA: 1.28, TPU: 1.5, Resin: 2.1 }, machineHourlyRate: 18, laborPerOrder: 35, failureReservePercent: 6, minimumQuote: 18, overheadPercent: 8 };

const chartData = [
  { day: "Mon", jobs: 31, hours: 48, success: 97 },
  { day: "Tue", jobs: 26, hours: 43, success: 94 },
  { day: "Wed", jobs: 40, hours: 64, success: 96 },
  { day: "Thu", jobs: 37, hours: 58, success: 98 },
  { day: "Fri", jobs: 44, hours: 71, success: 95 },
  { day: "Sat", jobs: 21, hours: 29, success: 99 },
  { day: "Sun", jobs: 18, hours: 24, success: 93 }
];

const materialData = [
  { name: "PLA", value: 44, color: "#2563eb" },
  { name: "PETG", value: 24, color: "#f97316" },
  { name: "ASA", value: 18, color: "#14b8a6" },
  { name: "Resin", value: 14, color: "#64748b" }
];

const roles: Role[] = ["Owner", "Admin", "Operator", "Viewer", "Student"];
const API_BASE = import.meta.env.VITE_LAYERPILOT_API_URL ?? (import.meta.env.PROD ? "" : "http://127.0.0.1:8797");

class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super(`API ${status}`);
    this.status = status;
    this.body = body;
  }
}

function realtimeUrl(path: string, token: string) {
  const base = API_BASE || window.location.origin;
  const url = new URL(path, base);
  url.searchParams.set("token", token);
  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";
  return url.toString();
}

async function apiRequest<T>(path: string, init: RequestInit = {}) {
  const token = typeof window !== "undefined" ? window.localStorage.getItem("layerpilot-token") : "";
  const hasBody = init.body !== undefined;
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(!hasBody || isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {})
    }
  });
  if (!response.ok) {
    let body: Record<string, unknown> = {};
    try {
      const parsed = await response.json();
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch {
      body = {};
    }
    throw new ApiError(response.status, body);
  }
  return response.json() as Promise<T>;
}

function downloadJsonFile(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadCsvFile(filename: string, rows: Array<Record<string, string | number>>) {
  const headers = Object.keys(rows[0] || { metric: "", value: "" });
  const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => escape(row[header] ?? "")).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadTextFile(filename: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function normalizeFiles(items: Partial<PrintFile>[]) {
  return items.map((file) => ({
    id: file.id || crypto.randomUUID(),
    name: file.name || "Untitled model.stl",
    type: file.type || "STL",
    folder: file.folder || "Inbox",
    size: file.size || "0 MB",
    material: file.material || "PLA",
    tags: file.tags || ["api"],
    sliced: Boolean(file.sliced),
    status: file.status || (file.sliced ? "sliced" : "uploaded"),
    version: file.version || 1,
    dimensions: file.dimensions || [100, 100, 50],
    thumbnail: file.thumbnail || file.name || "model",
    printTime: file.printTime || "1h 00m",
    cost: file.cost || 0,
    layerHeight: file.layerHeight || "0.20",
    usage: file.usage || 0
  })) as PrintFile[];
}

function exceedsVolume(dimensions: [number, number, number], buildVolume: [number, number, number]) {
  return dimensions.some((value, index) => value > buildVolume[index]);
}

function hasMaterialConflict(job: QueueItem, printer: Printer) {
  return job.material !== "Auto matched" && !printer.compatibleMaterials.includes(job.material);
}

function dueRisk(job: QueueItem) {
  const hour = Number(job.due.match(/\b(\d{1,2}):\d{2}\b/)?.[1]);
  return job.status !== "complete" && job.status !== "cancelled" && (job.priority === "Rush" || job.due.includes("Today") && (job.priority === "High" || Number.isFinite(hour) && hour <= 18));
}

function getScheduleWarnings(job: QueueItem, printer: Printer) {
  const warnings: string[] = [];
  if (printer.status === "offline") warnings.push("Printer offline");
  if (printer.status === "error") warnings.push("Printer error");
  if (printer.status === "maintenance") warnings.push("In maintenance");
  if ((printer.status === "printing" || printer.status === "paused") && job.status === "queued") warnings.push("Printer busy");
  if (hasMaterialConflict(job, printer)) warnings.push("Material conflict");
  if (exceedsVolume(job.dimensions, printer.buildVolume)) warnings.push("Size mismatch");
  if (dueRisk(job)) warnings.push("Due date risk");
  return warnings;
}

function deriveTodos(queue: QueueItem[], printers: Printer[]): Todo[] {
  const todos: Todo[] = [];
  queue.forEach((job) => {
    const printer = printers.find((item) => item.id === job.printerId) || printers[0];
    if (job.stage === "needs slicing") todos.push({ id: `${job.id}-slice`, title: `Slice ${job.file}`, owner: job.assignee || "Slicer", source: job.file, severity: "Medium", due: job.due, kind: "slicing" });
    if (job.stage === "needs scheduling") todos.push({ id: `${job.id}-schedule`, title: `Schedule ${job.file}`, owner: "Scheduler", source: job.file, severity: dueRisk(job) ? "High" : "Medium", due: job.due, kind: "scheduling" });
    if (printer && hasMaterialConflict(job, printer)) todos.push({ id: `${job.id}-material`, title: `Change material on ${printer.name}`, owner: "Operator", source: job.file, severity: "High", due: job.due, kind: "material" });
    if (printer && exceedsVolume(job.dimensions, printer.buildVolume)) todos.push({ id: `${job.id}-size`, title: `Move ${job.file} to a larger printer`, owner: "Scheduler", source: job.file, severity: "High", due: job.due, kind: "size" });
    if (job.status === "complete" || job.stage === "post processing") todos.push({ id: `${job.id}-post`, title: `Pickup / post-process ${job.file}`, owner: job.assignee, source: job.file, severity: "Low", due: job.due, kind: "post" });
    if (job.status === "failed" || job.stage === "blocked" || dueRisk(job) || printer && ["offline", "error", "maintenance"].includes(printer.status) && ["scheduled", "printing"].includes(job.stage)) todos.push({ id: `${job.id}-exception`, title: `Resolve exception: ${job.file}`, owner: "Lead", source: job.file, severity: job.priority === "Rush" ? "Urgent" : "High", due: job.due, kind: "exception" });
  });
  return todos.map((todo) => ({ ...todo, status: "open" }));
}

function applyTodoActions(todos: Todo[], actions: TodoAction[]) {
  const latest = new Map<string, TodoAction>();
  [...actions].sort((a, b) => String(a.at || "").localeCompare(String(b.at || ""))).forEach((action) => latest.set(action.todoId, action));
  return todos
    .map((todo) => {
      const action = latest.get(todo.id);
      if (!action) return todo;
      if (action.action === "complete") return null;
      if (action.action === "claim") return { ...todo, owner: action.owner || todo.owner, status: "claimed" as const, claimedBy: action.owner, actionNote: action.note || "" };
      if (action.action === "snooze") return { ...todo, status: "snoozed" as const, due: action.snoozeUntil || todo.due, snoozeUntil: action.snoozeUntil || "", actionNote: action.note || "" };
      return { ...todo, status: "open" as const, actionNote: action.note || "" };
    })
    .filter(Boolean) as Todo[];
}

function App() {
  const [language, setLanguage] = useState<Language>("en");
  const [showMarketing, setShowMarketing] = useState(() => !Boolean(window.localStorage.getItem("layerpilot-token")) && window.location.hash !== "#app");
  const [authToken, setAuthToken] = useState(() => window.localStorage.getItem("layerpilot-token") || "");
  const [authed, setAuthed] = useState(() => Boolean(window.localStorage.getItem("layerpilot-token")));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [twoFactorEnrollmentRequired, setTwoFactorEnrollmentRequired] = useState(false);
  const [view, setView] = useState<View>("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [printers, setPrinters] = useState(initialPrinters);
  const [files, setFiles] = useState(initialFiles);
  const [fileFolders, setFileFolders] = useState<FileFolder[]>([]);
  const [queue, setQueue] = useState(initialQueue);
  const [todoActions, setTodoActions] = useState<TodoAction[]>([]);
  const [spools, setSpools] = useState(initialSpools);
  const [purchaseRequests, setPurchaseRequests] = useState<PurchaseRequest[]>([]);
  const [maintenance, setMaintenance] = useState(initialMaintenance);
  const [maintenanceTemplates, setMaintenanceTemplates] = useState<MaintenanceTemplate[]>([]);
  const [maintenanceReports, setMaintenanceReports] = useState<MaintenanceReport[]>([]);
  const [users, setUsers] = useState(teamSeed);
  const [parts, setParts] = useState(partSeed);
  const [skus, setSkus] = useState(skuSeed);
  const [productionTemplates, setProductionTemplates] = useState<ProductionTemplate[]>([]);
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequest[]>([]);
  const [orders, setOrders] = useState(orderSeed);
  const [profiles, setProfiles] = useState(profileSeed);
  const [profileDefaults, setProfileDefaults] = useState<ProfileDefaults>({ Machine: "prof-1", Process: "prof-2", Filament: "" });
  const [profileMatchingPolicy, setProfileMatchingPolicy] = useState<ProfileMatchingPolicy>({ materialCompatibility: true, processFallback: true, commercialPriority: true, warnBeforeFallback: true, dueWindowHours: 2 });
  const [addons, setAddons] = useState<Addon[]>(addonSeed);
  const [hotDropMode, setHotDropMode] = useState<HotDropMode>(defaultWorkspaceSettings.hotDropMode);
  const [backendStatus, setBackendStatus] = useState<"local" | "connected">("local");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [notifications, setNotifications] = useState([
    "Farm Loop 07 reported bed adhesion risk.",
    "ASA White spool is below reorder threshold.",
    "Nozzle inspection is due today.",
    "Slack integration delivered 18 events today."
  ]);
  const accountIdempotencyAttempts = useRef<Record<string, IdempotencyAttempt>>({});
  const accountIdempotencyHeaders = (action: string, payload: unknown) => {
    const result = idempotencyHeadersForAttempt(accountIdempotencyAttempts.current[action] || null, action, payload);
    accountIdempotencyAttempts.current[action] = result.attempt;
    return result.headers;
  };
  const operatorIdempotencyAttempts = useRef<Record<string, IdempotencyAttempt>>({});
  const operatorIdempotencyHeaders = (action: string, payload: unknown) => {
    const result = idempotencyHeadersForAttempt(operatorIdempotencyAttempts.current[action] || null, action, payload);
    operatorIdempotencyAttempts.current[action] = result.attempt;
    return result.headers;
  };
  const clearOperatorIdempotency = (action: string) => {
    delete operatorIdempotencyAttempts.current[action];
  };

  const addToast = (message: string, type: Toast["type"] = "success") => {
    const id = crypto.randomUUID();
    setToasts((items) => [...items, { id, message, type }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3600);
  };

  const authenticate = async (payload: { email: string; password: string; mode: "login" | "signup"; name?: string; workspace?: string; twoFactorCode?: string }) => {
    const path = payload.mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload.mode === "signup"
          ? { email: payload.email, password: payload.password, name: payload.name || payload.email.split("@")[0], workspace: payload.workspace || "3DSTU FarmFlow Workspace" }
          : { email: payload.email, password: payload.password, twoFactorCode: payload.twoFactorCode || undefined })
      });
      const auth = await response.json();
      if (!response.ok) {
        if (auth?.requiresTwoFactor) return payload.twoFactorCode ? "Two-factor code is incorrect." : "Two-factor code required.";
        return "Email or password is incorrect.";
      }
      window.localStorage.setItem("layerpilot-token", auth.token);
      setAuthToken(auth.token);
      setCurrentUser(auth.user);
      setTwoFactorEnrollmentRequired(false);
      setAuthed(true);
      setBackendStatus("connected");
      return "";
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.startsWith("API ")) return "Email or password is incorrect.";
      window.localStorage.setItem("layerpilot-token", "local-demo");
      setAuthToken("local-demo");
      setCurrentUser({ id: "local", name: "Local Demo", email: payload.email, role: "Owner", location: "Local", lastSeen: "Now" });
      setTwoFactorEnrollmentRequired(false);
      setAuthed(true);
      setBackendStatus("local");
      return "";
    }
  };

  const logout = async () => {
    await apiRequest("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.localStorage.removeItem("layerpilot-token");
    setAuthToken("");
    setCurrentUser(null);
    setTwoFactorEnrollmentRequired(false);
    setAuthed(false);
    setBackendStatus("local");
  };

  useEffect(() => {
    if (!authed || backendStatus === "connected") return;
    const id = window.setInterval(() => {
      setPrinters((current) =>
        current.map((printer) => {
          if (printer.status !== "printing") return printer;
          const next = Math.min(99, printer.progress + Math.random() * 3);
          return {
            ...printer,
            progress: next,
            nozzle: Math.round(printer.targetNozzle - 6 + Math.random() * 9),
            bed: Math.round(printer.targetBed - 3 + Math.random() * 5)
          };
        })
      );
    }, 1800);
    return () => window.clearInterval(id);
  }, [authed, backendStatus]);

  const metrics = useMemo(() => {
    const active = printers.filter((p) => p.status === "printing" || p.status === "paused").length;
    return {
      printers: printers.length,
      active,
      idle: printers.filter((p) => p.status === "idle").length,
      issues: printers.filter((p) => p.status === "error" || p.status === "offline" || p.status === "maintenance").length,
      success: 96,
      filament: spools.reduce((sum, spool) => sum + (spool.weight - spool.remaining), 0),
      hours: 348,
      queue: queue.filter((job) => job.status === "queued").length
    };
  }, [printers, queue, spools]);

  const todos = useMemo(() => applyTodoActions(deriveTodos(queue, printers), todoActions), [queue, printers, todoActions]);

  const setPrinterState = (printer: Printer) => {
    setPrinters((items) => items.map((item) => item.id === printer.id ? { ...item, ...printer } : item));
    setSelectedPrinter((current) => current?.id === printer.id ? { ...current, ...printer } : current);
  };

  const updatePrinterStatus = async (id: string, status: PrinterStatus, localPatch: Partial<Printer> = {}) => {
    setPrinters((items) => items.map((printer) => printer.id === id ? { ...printer, status, ...localPatch } : printer));
    setSelectedPrinter((current) => current?.id === id ? { ...current, status, ...localPatch } : current);
    const payload = { status, ...localPatch };
    const attemptKey = `printer-status:${id}`;
    try {
      const printer = await apiRequest<Printer>(`/api/printers/${id}/status`, {
        method: "PATCH",
        headers: operatorIdempotencyHeaders(attemptKey, { printerId: id, ...payload }),
        body: JSON.stringify(payload)
      });
      setPrinterState({ ...printer, ...localPatch });
      clearOperatorIdempotency(attemptKey);
      setBackendStatus("connected");
    } catch {
      setBackendStatus("local");
    }
  };

  const createQueueJob = async (job: Omit<QueueItem, "id">) => {
    const fallback: QueueItem = { ...job, id: crypto.randomUUID() };
    const attemptKey = "queue-create";
    try {
      const created = await apiRequest<{ job: QueueItem }>("/api/queue", {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, job),
        body: JSON.stringify(job)
      });
      setQueue((items) => [...items, created.job]);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return created.job;
    } catch {
      setQueue((items) => [...items, fallback]);
      setBackendStatus("local");
      return fallback;
    }
  };

  const scheduleQueueJob = async (jobId: string, printer: Printer, scheduledStart = "13:00") => {
    const currentJob = queue.find((item) => item.id === jobId);
    const localWarnings = currentJob ? getScheduleWarnings(currentJob, printer) : [];
    const payload = { printerId: printer.id, scheduledStart };
    const attemptKey = `queue-schedule:${jobId}`;
    setQueue((items) => items.map((item) => item.id === jobId ? { ...item, printerId: printer.id, printer: printer.name, scheduledStart: item.scheduledStart || scheduledStart, scheduleWarnings: localWarnings, stage: item.stage === "needs slicing" ? "needs slicing" : "scheduled" } : item));
    try {
      const scheduled = await apiRequest<{ job: QueueItem; warnings?: string[]; spools?: Spool[] }>(`/api/queue/${jobId}/schedule`, {
        method: "PATCH",
        headers: operatorIdempotencyHeaders(attemptKey, { jobId, ...payload }),
        body: JSON.stringify(payload)
      });
      setQueue((items) => items.map((item) => item.id === jobId ? scheduled.job : item));
      if (scheduled.spools) setSpools(scheduled.spools);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return scheduled.warnings || scheduled.job.scheduleWarnings || [];
    } catch {
      setBackendStatus("local");
      return localWarnings;
    }
  };

  const autoScheduleQueueJobs = async () => {
    const payload = { includeBusyPrinters: true, respectMaterial: true, respectBuildVolume: true, startMinute: 8 * 60 };
    const attemptKey = "schedule-auto";
    try {
      const result = await apiRequest<AutoScheduleResult>("/api/schedule/auto", {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, payload),
        body: JSON.stringify(payload)
      });
      setQueue((items) => items.map((item) => result.jobs.find((job) => job.id === item.id) || item));
      if (result.spools) setSpools(result.spools);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return result;
    } catch {
      const draft = queue.map((job) => ({ ...job }));
      const scheduled: AutoScheduleResult["scheduled"] = [];
      const laneLoad = Object.fromEntries(printers.map((printer) => [printer.id, printer.status === "printing" || printer.status === "paused" ? 9 : 8]));
      const fallbackScore = (job: QueueItem, printer: Printer) => {
        const warnings = getScheduleWarnings(job, printer);
        let score = laneLoad[printer.id] * 60 + printer.utilization;
        if (warnings.includes("Printer offline")) score += 8000;
        if (warnings.includes("Printer error")) score += 7000;
        if (warnings.includes("In maintenance")) score += 6500;
        if (warnings.includes("Size mismatch")) score += 6000;
        if (warnings.includes("Material conflict")) score += 3500;
        if (warnings.includes("Printer busy")) score += 180;
        if (job.color !== "Any" && !printer.filament.toLowerCase().includes(job.color.toLowerCase())) score += 15;
        return score;
      };
      draft
        .filter((job) => job.status === "queued" && job.stage === "needs scheduling")
        .sort((a, b) => (["Rush", "High", "Normal", "Low"].indexOf(a.priority) - ["Rush", "High", "Normal", "Low"].indexOf(b.priority)) || a.due.localeCompare(b.due))
        .forEach((job) => {
          const target = [...printers].sort((a, b) => fallbackScore(job, a) - fallbackScore(job, b))[0];
          if (!target) return;
          const scheduledStart = `${String(laneLoad[target.id]).padStart(2, "0")}:00`;
          job.printerId = target.id;
          job.printer = target.name;
          job.scheduledStart = scheduledStart;
          job.stage = "scheduled";
          job.scheduleWarnings = getScheduleWarnings(job, target);
          laneLoad[target.id] += 2;
          scheduled.push({ jobId: job.id, file: job.file, printerId: target.id, printer: target.name, scheduledStart, durationMinutes: 120, changeCost: 0, score: job.scheduleWarnings.length, warnings: job.scheduleWarnings });
        });
      setQueue(draft);
      setBackendStatus("local");
      return { scheduled, skipped: [], jobs: draft.filter((job) => scheduled.some((item) => item.jobId === job.id)) };
    }
  };

  const optimizeScheduleJobs = async (strategy: OptimizeScheduleStrategy) => {
    const payload = { strategy, includeBusyPrinters: true, respectMaterial: true, respectBuildVolume: true, startMinute: 8 * 60 };
    const attemptKey = `schedule-optimize:${strategy}`;
    try {
      const result = await apiRequest<AutoScheduleResult>("/api/schedule/optimize", {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, payload),
        body: JSON.stringify(payload)
      });
      setQueue((items) => items.map((item) => result.jobs.find((job) => job.id === item.id) || item));
      if (result.spools) setSpools(result.spools);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return result;
    } catch {
      const draft = queue.map((job) => ({ ...job }));
      const scheduled: AutoScheduleResult["scheduled"] = [];
      const laneLoad = Object.fromEntries(printers.map((printer) => [printer.id, printer.status === "printing" || printer.status === "paused" ? 9 : 8]));
      const priorityOrder = ["Rush", "High", "Normal", "Low"];
      const sorted = draft
        .filter((job) => job.status === "queued" && job.stage === "needs scheduling")
        .sort((a, b) => strategy === "material-color"
          ? a.material.localeCompare(b.material) || a.color.localeCompare(b.color) || priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority)
          : priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority) || b.time.localeCompare(a.time));
      sorted.forEach((job) => {
        const target = [...printers].sort((a, b) => (laneLoad[a.id] + (strategy === "material-color" && !a.filament.includes(job.material) ? 3 : 0)) - (laneLoad[b.id] + (strategy === "material-color" && !b.filament.includes(job.material) ? 3 : 0)))[0];
        if (!target) return;
        const scheduledStart = `${String(laneLoad[target.id]).padStart(2, "0")}:00`;
        job.printerId = target.id;
        job.printer = target.name;
        job.scheduledStart = scheduledStart;
        job.stage = "scheduled";
        job.scheduleWarnings = getScheduleWarnings(job, target);
        laneLoad[target.id] += Math.max(1, Math.ceil(Number(job.time.match(/(\d+)/)?.[1] || 2)));
        scheduled.push({ jobId: job.id, file: job.file, printerId: target.id, printer: target.name, scheduledStart, durationMinutes: 120, changeCost: job.scheduleWarnings.includes("Material conflict") ? 45 : 0, score: job.scheduleWarnings.length, warnings: job.scheduleWarnings });
      });
      setQueue(draft);
      setBackendStatus("local");
      return { strategy, scheduled, skipped: [], jobs: draft.filter((job) => scheduled.some((item) => item.jobId === job.id)) };
    }
  };

  const solveScheduleJobs = async (objective: ConstraintObjective) => {
    const payload = { objective, includeBusyPrinters: true, respectMaterial: true, respectBuildVolume: true, startMinute: 8 * 60, maxJobs: 80 };
    const attemptKey = `schedule-constraint:${objective}`;
    try {
      const result = await apiRequest<AutoScheduleResult>("/api/schedule/constraint", {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, payload),
        body: JSON.stringify(payload)
      });
      setQueue((items) => items.map((item) => result.jobs.find((job) => job.id === item.id) || item));
      if (result.spools) setSpools(result.spools);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return result;
    } catch {
      const fallback = await optimizeScheduleJobs(objective === "changeover-min" ? "material-color" : objective === "due-risk" ? "due-priority" : "load-balance");
      setBackendStatus("local");
      return {
        ...fallback,
        strategy: `constraint-${objective}` as AutoScheduleResult["strategy"],
        solver: { engine: "local heuristic fallback", objective, feasible: fallback.scheduled.length > 0, bounded: true, result: fallback.scheduled.reduce((sum, item) => sum + item.score, 0), variables: fallback.scheduled.length }
      };
    }
  };

  const matchQueueJobs = async (dryRun: boolean) => {
    const payload = { dryRun, maxActiveSlots: 3, respectMaterial: true, respectBuildVolume: true };
    const attemptKey = `queue-match:${dryRun ? "dry-run" : "commit"}`;
    try {
      const result = await apiRequest<QueueMatchResult>("/api/queue/match", {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, payload),
        body: JSON.stringify(payload)
      });
      if (!dryRun) {
        setQueue((items) => items.map((item) => result.jobs.find((job) => job.id === item.id) || item));
        setPrinters(result.printers);
        if (result.spools) setSpools(result.spools);
      }
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return result;
    } catch {
      const active = queue.filter((job) => job.status === "printing" || job.status === "paused").length;
      const openSlots = Math.max(0, 3 - active);
      const matches = queue
        .filter((job) => job.status === "queued")
        .slice(0, openSlots)
        .map((job) => {
          const printer = printers.find((item) => item.status === "idle") || printers[0];
          return { jobId: job.id, file: job.file, printerId: printer?.id || job.printerId, printer: printer?.name || job.printer, scheduledStart: job.scheduledStart || "", priority: job.priority, material: job.material, warnings: printer ? getScheduleWarnings(job, printer) : ["Printer missing"], score: 0 };
        });
      if (!dryRun) {
        setQueue((items) => items.map((job) => matches.some((match) => match.jobId === job.id) ? { ...job, status: "printing", stage: "printing" } : job));
      }
      setBackendStatus("local");
      return { dryRun, maxActiveSlots: 3, activeSlots: active, openSlots, matches, skipped: [], jobs: queue.filter((job) => matches.some((match) => match.jobId === job.id)), printers, todos };
    }
  };

  const updateQueueStatus = async (jobId: string, status: JobStatus) => {
    const payload = { status };
    const attemptKey = `queue-status:${jobId}`;
    setQueue((items) => items.map((job) => job.id === jobId ? { ...job, status } : job));
    try {
      const updated = await apiRequest<{ job: QueueItem; spools?: Spool[] }>(`/api/queue/${jobId}/status`, {
        method: "PATCH",
        headers: operatorIdempotencyHeaders(attemptKey, { jobId, ...payload }),
        body: JSON.stringify(payload)
      });
      setQueue((items) => items.map((job) => job.id === jobId ? updated.job : job));
      if (updated.spools) setSpools(updated.spools);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
    } catch {
      setBackendStatus("local");
    }
  };

  const updateQueuePriority = async (jobId: string, priority: QueueItem["priority"]) => {
    const payload = { priority };
    const attemptKey = `queue-priority:${jobId}`;
    setQueue((items) => items.map((job) => job.id === jobId ? { ...job, priority } : job));
    try {
      const updated = await apiRequest<{ job: QueueItem }>(`/api/queue/${jobId}/priority`, {
        method: "PATCH",
        headers: operatorIdempotencyHeaders(attemptKey, { jobId, ...payload }),
        body: JSON.stringify(payload)
      });
      setQueue((items) => items.map((job) => job.id === jobId ? updated.job : job));
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
    } catch {
      setBackendStatus("local");
    }
  };

  const createOrder = async (draft: Omit<Order, "id">) => {
    const fallback: Order = { ...draft, id: `ord-${1051 + orders.length}` };
    const attemptKey = "order-create";
    try {
      const created = await apiRequest<Order>("/api/orders", {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, draft),
        body: JSON.stringify(draft)
      });
      setOrders((items) => [...items, created]);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return created;
    } catch {
      setOrders((items) => [...items, fallback]);
      setBackendStatus("local");
      return fallback;
    }
  };

  const updateOrderStatus = async (orderId: string, status: Order["status"]) => {
    const payload = { status };
    const attemptKey = `order-status:${orderId}`;
    setOrders((items) => items.map((order) => order.id === orderId ? { ...order, status } : order));
    try {
      const updated = await apiRequest<OrderStatusUpdateResult>(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: operatorIdempotencyHeaders(attemptKey, { orderId, ...payload }),
        body: JSON.stringify(payload)
      });
      const nextOrder = updated.order || updated;
      setOrders((items) => items.map((order) => order.id === orderId ? nextOrder : order));
      if (updated.jobs?.length) {
        setQueue((items) => items.map((job) => updated.jobs?.find((updatedJob) => updatedJob.id === job.id) || job));
      }
      if (updated.spools) setSpools(updated.spools);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return nextOrder;
    } catch {
      setBackendStatus("local");
      return orders.find((order) => order.id === orderId);
    }
  };

  const updateQuoteRequest = async (quoteId: string, patch: Partial<Pick<QuoteRequest, "status" | "priority" | "quotedValue" | "validUntil" | "internalNote">>) => {
    const attemptKey = `quote-update:${quoteId}`;
    setQuoteRequests((items) => items.map((quote) => quote.id === quoteId ? { ...quote, ...patch } : quote));
    try {
      const updated = await apiRequest<QuoteRequest>(`/api/quoteRequests/${quoteId}`, {
        method: "PATCH",
        headers: operatorIdempotencyHeaders(attemptKey, { quoteId, patch }),
        body: JSON.stringify(patch)
      });
      setQuoteRequests((items) => items.map((quote) => quote.id === quoteId ? updated : quote));
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return updated;
    } catch {
      setBackendStatus("local");
      return quoteRequests.find((quote) => quote.id === quoteId);
    }
  };

  const createQuotePortalLink = async (quote: QuoteRequest, rotate = false) => {
    const payload = { rotate };
    const attemptKey = `quote-portal-link:${quote.id}`;
    try {
      const result = await apiRequest<{ quoteRequest: QuoteRequest; url: string; accessToken: string }>(`/api/quoteRequests/${quote.id}/customer-link`, {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, { quoteId: quote.id, ...payload }),
        body: JSON.stringify(payload)
      });
      setQuoteRequests((items) => items.map((item) => item.id === quote.id ? result.quoteRequest : item));
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return result;
    } catch {
      setBackendStatus("local");
      return null;
    }
  };

  const convertQuoteRequest = async (quote: QuoteRequest) => {
    const payload = { due: quote.due, value: quote.quotedValue || quote.budget || 0, createJob: true };
    const attemptKey = `quote-convert:${quote.id}`;
    try {
      const result = await apiRequest<{ quoteRequest: QuoteRequest; order: Order; job?: QueueItem | null; orders: Order[]; quoteRequests: QuoteRequest[]; queue?: QueueItem[]; todos?: Todo[] }>(`/api/quoteRequests/${quote.id}/convert-order`, {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, { quoteId: quote.id, ...payload }),
        body: JSON.stringify(payload)
      });
      setQuoteRequests(result.quoteRequests);
      setOrders(result.orders);
      if (result.queue) setQueue(result.queue);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return result;
    } catch {
      const order: Order = { id: `local-${crypto.randomUUID().slice(0, 8)}`, source: "Manual", externalId: quote.id, customer: quote.company ? `${quote.customer} / ${quote.company}` : quote.customer, items: [`${quote.project} x${quote.quantity}`], status: "received", due: quote.due, value: quote.quotedValue || quote.budget || 0 };
      const updated = { ...quote, status: "converted" as const, orderId: order.id };
      setQuoteRequests((items) => items.map((item) => item.id === quote.id ? updated : item));
      setOrders((items) => [order, ...items]);
      setBackendStatus("local");
      return { quoteRequest: updated, order, orders: [order, ...orders], quoteRequests: quoteRequests.map((item) => item.id === quote.id ? updated : item) };
    }
  };

  const createSpool = async (draft: Omit<Spool, "id">) => {
    const fallback: Spool = { ...draft, id: crypto.randomUUID() };
    const attemptKey = "spool-create";
    try {
      const created = await apiRequest<Spool>("/api/spools", {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, draft),
        body: JSON.stringify(draft)
      });
      setSpools((items) => [...items, created]);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return created;
    } catch {
      setSpools((items) => [...items, fallback]);
      setBackendStatus("local");
      return fallback;
    }
  };

  const updateSpool = async (spoolId: string, patch: Partial<Spool>) => {
    const attemptKey = `spool-update:${spoolId}`;
    setSpools((items) => items.map((spool) => spool.id === spoolId ? { ...spool, ...patch } : spool));
    try {
      const updated = await apiRequest<Spool>(`/api/spools/${spoolId}`, {
        method: "PATCH",
        headers: operatorIdempotencyHeaders(attemptKey, { spoolId, patch }),
        body: JSON.stringify(patch)
      });
      setSpools((items) => items.map((spool) => spool.id === spoolId ? updated : spool));
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return updated;
    } catch {
      setBackendStatus("local");
      return spools.find((spool) => spool.id === spoolId);
    }
  };

  const logSpoolUsage = async (spoolId: string, grams = 20) => {
    const payload = { grams };
    const attemptKey = `spool-usage:${spoolId}`;
    setSpools((items) => items.map((spool) => spool.id === spoolId ? { ...spool, remaining: Math.max(0, spool.remaining - grams) } : spool));
    try {
      const updated = await apiRequest<Spool>(`/api/spools/${spoolId}/usage`, {
        method: "PATCH",
        headers: operatorIdempotencyHeaders(attemptKey, { spoolId, ...payload }),
        body: JSON.stringify(payload)
      });
      setSpools((items) => items.map((spool) => spool.id === spoolId ? updated : spool));
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return updated;
    } catch {
      setBackendStatus("local");
      return spools.find((spool) => spool.id === spoolId);
    }
  };

  const generateSpoolLabels = async (ids: string[] = []) => {
    const payload = { ids };
    const attemptKey = "spool-labels";
    const result = await apiRequest<SpoolLabelExport>("/api/spools/labels", {
      method: "POST",
      headers: operatorIdempotencyHeaders(attemptKey, payload),
      body: JSON.stringify(payload)
    });
    setBackendStatus("connected");
    clearOperatorIdempotency(attemptKey);
    return result;
  };

  const scanSpool = async (code: string, options: { grams?: number; location?: string } = {}) => {
    const payload = { code, ...options };
    const attemptKey = `spool-scan:${code}`;
    const result = await apiRequest<SpoolScanResult>("/api/spools/scan", {
      method: "POST",
      headers: operatorIdempotencyHeaders(attemptKey, payload),
      body: JSON.stringify(payload)
    });
    setSpools(result.spools || spools.map((spool) => spool.id === result.spool.id ? result.spool : spool));
    setBackendStatus("connected");
    clearOperatorIdempotency(attemptKey);
    return result;
  };

  const createPurchaseRequest = async (draft: Omit<PurchaseRequest, "id">) => {
    const fallback: PurchaseRequest = { ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const attemptKey = "purchase-request-create";
    try {
      const created = await apiRequest<PurchaseRequest>("/api/purchaseRequests", {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, draft),
        body: JSON.stringify(draft)
      });
      setPurchaseRequests((items) => [created, ...items.filter((item) => item.id !== created.id)]);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return created;
    } catch {
      setPurchaseRequests((items) => [fallback, ...items]);
      setBackendStatus("local");
      return fallback;
    }
  };

  const generateReorderPlan = async (options: { thresholdGrams?: number; targetGrams?: number; quantity?: number } = {}) => {
    const attemptKey = "purchase-reorder-plan";
    try {
      const result = await apiRequest<ReorderPlanResult>("/api/purchaseRequests/reorderPlan", {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, options),
        body: JSON.stringify(options)
      });
      setPurchaseRequests(result.purchaseRequests);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return result;
    } catch {
      const existingOpen = new Set(purchaseRequests.filter((request) => ["open", "ordered"].includes(request.status) && request.spoolId).map((request) => request.spoolId));
      const threshold = options.thresholdGrams || 250;
      const created = spools
        .filter((spool) => Math.max(0, Number(spool.remaining || 0) - Number(spool.reserved || 0)) < threshold && !existingOpen.has(spool.id))
        .map((spool): PurchaseRequest => ({
          id: crypto.randomUUID(),
          spoolId: spool.id,
          material: spool.material,
          color: spool.color,
          brand: spool.brand,
          quantity: options.quantity || 1,
          targetGrams: options.targetGrams || spool.weight || 1000,
          supplier: "Preferred supplier",
          priority: "High",
          status: "open",
          due: "This week",
          note: "Local reorder request",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));
      setPurchaseRequests((items) => [...created, ...items]);
      setBackendStatus("local");
      return { created, skipped: [], thresholdGrams: threshold, purchaseRequests: [...created, ...purchaseRequests] };
    }
  };

  const updatePurchaseRequest = async (requestId: string, patch: Partial<PurchaseRequest>) => {
    const attemptKey = `purchase-request-update:${requestId}`;
    setPurchaseRequests((items) => items.map((request) => request.id === requestId ? { ...request, ...patch } : request));
    try {
      const updated = await apiRequest<PurchaseRequest>(`/api/purchaseRequests/${requestId}`, {
        method: "PATCH",
        headers: operatorIdempotencyHeaders(attemptKey, { requestId, patch }),
        body: JSON.stringify(patch)
      });
      setPurchaseRequests((items) => items.map((request) => request.id === requestId ? updated : request));
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return updated;
    } catch {
      setBackendStatus("local");
      return purchaseRequests.find((request) => request.id === requestId);
    }
  };

  const receivePurchaseRequest = async (requestId: string, location = "Rack Receiving") => {
    const payload = { location };
    const attemptKey = `purchase-receive:${requestId}`;
    try {
      const result = await apiRequest<PurchaseReceiveResult>(`/api/purchaseRequests/${requestId}/receive`, {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, { requestId, ...payload }),
        body: JSON.stringify(payload)
      });
      setPurchaseRequests(result.purchaseRequests);
      setSpools(result.inventory);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return result;
    } catch {
      const request = purchaseRequests.find((item) => item.id === requestId);
      if (!request) throw new Error("Purchase request not found");
      const now = new Date().toISOString();
      const newSpools = Array.from({ length: request.quantity || 1 }, (_, index): Spool => ({
        id: crypto.randomUUID(),
        material: request.material,
        color: request.color,
        brand: request.brand,
        remaining: request.targetGrams,
        weight: request.targetGrams,
        location,
        dry: true,
        nfc: `LP-${request.material.toUpperCase()}-${index + 1}`
      }));
      const updated = { ...request, status: "received" as const, receivedAt: now, receivedSpoolIds: newSpools.map((spool) => spool.id), updatedAt: now };
      setSpools((items) => [...items, ...newSpools]);
      setPurchaseRequests((items) => items.map((item) => item.id === requestId ? updated : item));
      setBackendStatus("local");
      return { request: updated, spools: newSpools, purchaseRequests: purchaseRequests.map((item) => item.id === requestId ? updated : item), inventory: [...spools, ...newSpools] };
    }
  };

  const actOnTodo = async (todoId: string, action: TodoAction["action"], payload: Partial<Pick<TodoAction, "owner" | "note" | "snoozeUntil">> = {}) => {
    const fallback: TodoAction = { id: crypto.randomUUID(), todoId, todoTitle: todoId, todoKind: "exception", action, owner: payload.owner || currentUser?.name || "Operator", note: payload.note || "", snoozeUntil: payload.snoozeUntil || "", createdBy: currentUser?.email || "", at: new Date().toISOString() };
    const body = { action, ...payload };
    const attemptKey = `todo-action:${todoId}:${action}`;
    try {
      const result = await apiRequest<{ action: TodoAction; todo: Todo | null; todos: Todo[]; todoActions: TodoAction[] }>(`/api/todos/${encodeURIComponent(todoId)}/action`, {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, { todoId, ...body }),
        body: JSON.stringify(body)
      });
      setTodoActions(result.todoActions);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return result;
    } catch {
      setTodoActions((items) => [fallback, ...items]);
      setBackendStatus("local");
      return { action: fallback, todo: null, todos: applyTodoActions(deriveTodos(queue, printers), [fallback, ...todoActions]), todoActions: [fallback, ...todoActions] };
    }
  };

  const createMaintenanceJob = async (draft: Omit<MaintenanceJob, "id">) => {
    const fallback: MaintenanceJob = { ...draft, id: crypto.randomUUID() };
    try {
      const created = await apiRequest<MaintenanceJob>("/api/maintenance", {
        method: "POST",
        body: JSON.stringify(draft)
      });
      setMaintenance((items) => [...items, created]);
      setBackendStatus("connected");
      return created;
    } catch {
      setMaintenance((items) => [...items, fallback]);
      setBackendStatus("local");
      return fallback;
    }
  };

  const updateMaintenanceJob = async (jobId: string, patch: Partial<MaintenanceJob>) => {
    const attemptKey = `maintenance-update:${jobId}`;
    setMaintenance((items) => items.map((job) => job.id === jobId ? { ...job, ...patch } : job));
    try {
      const updated = await apiRequest<MaintenanceJob>(`/api/maintenance/${jobId}`, {
        method: "PATCH",
        headers: operatorIdempotencyHeaders(attemptKey, { jobId, patch }),
        body: JSON.stringify(patch)
      });
      setMaintenance((items) => items.map((job) => job.id === jobId ? updated : job));
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return updated;
    } catch {
      setBackendStatus("local");
      return maintenance.find((job) => job.id === jobId);
    }
  };

  const saveMaintenanceTemplate = async (draft: Omit<MaintenanceTemplate, "id" | "createdAt" | "updatedAt">) => {
    const fallback: MaintenanceTemplate = { ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    try {
      const result = await apiRequest<{ template: MaintenanceTemplate; templates: MaintenanceTemplate[]; created: boolean }>("/api/maintenance/templates", {
        method: "POST",
        body: JSON.stringify(draft)
      });
      setMaintenanceTemplates(result.templates);
      setBackendStatus("connected");
      return result.template;
    } catch {
      setMaintenanceTemplates((items) => [fallback, ...items.filter((item) => item.title !== fallback.title)]);
      setBackendStatus("local");
      return fallback;
    }
  };

  const reportMaintenanceProblem = async (draft: { title: string; printer: string; description: string; severity: MaintenanceJob["severity"]; createJob: boolean }) => {
    try {
      const result = await apiRequest<{ report: MaintenanceReport; job?: MaintenanceJob | null; reports: MaintenanceReport[]; maintenance: MaintenanceJob[] }>("/api/maintenance/reports", {
        method: "POST",
        body: JSON.stringify(draft)
      });
      setMaintenanceReports(result.reports);
      setMaintenance(result.maintenance);
      setBackendStatus("connected");
      return result;
    } catch {
      const report: MaintenanceReport = { id: crypto.randomUUID(), ...draft, status: "open", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      const job: MaintenanceJob | null = draft.createJob ? { id: crypto.randomUUID(), title: draft.title, printer: draft.printer, status: "scheduled", due: "Today", progress: "0/4", severity: draft.severity } : null;
      setMaintenanceReports((items) => [report, ...items]);
      if (job) setMaintenance((items) => [job, ...items]);
      setBackendStatus("local");
      return { report, job, reports: [report, ...maintenanceReports], maintenance: job ? [job, ...maintenance] : maintenance };
    }
  };

  const createPrinter = async (draft: Omit<Printer, "id" | "job" | "progress" | "uptime" | "utilization" | "queue">) => {
    const fallback: Printer = { ...draft, id: crypto.randomUUID(), job: undefined, progress: 0, uptime: 100, utilization: 0, queue: 0 };
    try {
      const created = await apiRequest<Printer>("/api/printers", {
        method: "POST",
        body: JSON.stringify(draft)
      });
      setPrinters((items) => [...items, created]);
      setBackendStatus("connected");
      return created;
    } catch {
      setPrinters((items) => [...items, fallback]);
      setBackendStatus("local");
      return fallback;
    }
  };

  const createUser = async (draft: Omit<User, "id" | "lastSeen"> & { password?: string }) => {
    const fallback: User = { ...draft, id: crypto.randomUUID(), lastSeen: "Invite pending" };
    const attemptKey = "team-user-invite";
    try {
      const result = await apiRequest<{ user: User; temporaryPassword?: string }>("/api/users", {
        method: "POST",
        headers: accountIdempotencyHeaders(attemptKey, draft),
        body: JSON.stringify(draft)
      });
      setUsers((items) => [result.user, ...items.filter((item) => item.id !== result.user.id)]);
      setBackendStatus("connected");
      delete accountIdempotencyAttempts.current[attemptKey];
      return result;
    } catch {
      setUsers((items) => [fallback, ...items]);
      setBackendStatus("local");
      return { user: fallback };
    }
  };

  const updateUser = async (userId: string, patch: Partial<User>) => {
    const payload = { userId, patch };
    const attemptKey = `team-user-update:${userId}`;
    setUsers((items) => items.map((user) => user.id === userId ? { ...user, ...patch } : user));
    try {
      const updated = await apiRequest<User>(`/api/users/${userId}`, {
        method: "PATCH",
        headers: accountIdempotencyHeaders(attemptKey, payload),
        body: JSON.stringify(patch)
      });
      setUsers((items) => items.map((user) => user.id === userId ? updated : user));
      setBackendStatus("connected");
      delete accountIdempotencyAttempts.current[attemptKey];
      return updated;
    } catch {
      setBackendStatus("local");
      return users.find((user) => user.id === userId);
    }
  };

  const resetUserPassword = async (userId: string) => {
    const payload = { userId };
    const attemptKey = `team-password-reset:${userId}`;
    try {
      const result = await apiRequest<{ user: User; temporaryPassword?: string }>(`/api/users/${userId}/reset-password`, { method: "POST", headers: accountIdempotencyHeaders(attemptKey, payload), body: JSON.stringify({}) });
      setUsers((items) => items.map((user) => user.id === userId ? result.user : user));
      setBackendStatus("connected");
      delete accountIdempotencyAttempts.current[attemptKey];
      return result;
    } catch {
      setBackendStatus("local");
      const user = users.find((item) => item.id === userId);
      return { user: user ? { ...user, passwordResetRequired: true } : undefined };
    }
  };

  const changeOwnPassword = async (currentPassword: string, newPassword: string) => {
    const result = await apiRequest<{ ok: boolean; user: User }>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword })
    });
    setCurrentUser(result.user);
    setUsers((items) => items.map((user) => user.id === result.user.id ? result.user : user));
    setBackendStatus("connected");
    return result.user;
  };

  const setupTwoFactor = async () => apiRequest<TwoFactorSetup>("/api/auth/2fa/setup", { method: "POST" });

  const enableTwoFactor = async (secret: string, code: string) => {
    const result = await apiRequest<{ user: User; recoveryCodes: string[] }>("/api/auth/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ secret, code })
    });
    setCurrentUser(result.user);
    setTwoFactorEnrollmentRequired(false);
    setUsers((items) => items.map((user) => user.id === result.user.id ? result.user : user));
    setBackendStatus("connected");
    return result;
  };

  const disableTwoFactor = async (password: string, code: string) => {
    const result = await apiRequest<{ user: User }>("/api/auth/2fa/disable", {
      method: "POST",
      body: JSON.stringify({ password, code })
    });
    setCurrentUser(result.user);
    setTwoFactorEnrollmentRequired(workspaceSettings.requireAdmin2fa && (result.user.role === "Owner" || result.user.role === "Admin") && !result.user.twoFactor?.enabled);
    setUsers((items) => items.map((user) => user.id === result.user.id ? result.user : user));
    setBackendStatus("connected");
    return result.user;
  };

  const createPart = async (draft: Omit<Part, "id">) => {
    const fallback: Part = { ...draft, id: crypto.randomUUID() };
    try {
      const created = await apiRequest<Part>("/api/parts", {
        method: "POST",
        body: JSON.stringify(draft)
      });
      setParts((items) => [...items, created]);
      setBackendStatus("connected");
      return created;
    } catch {
      setParts((items) => [...items, fallback]);
      setBackendStatus("local");
      return fallback;
    }
  };

  const createSku = async (draft: Omit<SKU, "id">) => {
    const fallback: SKU = { ...draft, id: crypto.randomUUID() };
    try {
      const created = await apiRequest<SKU>("/api/skus", {
        method: "POST",
        body: JSON.stringify(draft)
      });
      setSkus((items) => [...items, created]);
      setBackendStatus("connected");
      return created;
    } catch {
      setSkus((items) => [...items, fallback]);
      setBackendStatus("local");
      return fallback;
    }
  };

  const createProductionTemplate = async (draft: Omit<ProductionTemplate, "id">) => {
    const fallback: ProductionTemplate = { ...draft, id: crypto.randomUUID(), runCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    try {
      const created = await apiRequest<ProductionTemplate>("/api/productionTemplates", {
        method: "POST",
        body: JSON.stringify(draft)
      });
      setProductionTemplates((items) => [created, ...items.filter((item) => item.id !== created.id)]);
      setBackendStatus("connected");
      return created;
    } catch {
      setProductionTemplates((items) => [fallback, ...items]);
      setBackendStatus("local");
      return fallback;
    }
  };

  const runProductionTemplate = async (template: ProductionTemplate, options: { quantity?: number; dryRun?: boolean } = {}) => {
    try {
      const result = await apiRequest<ProductionTemplateRunResult>(`/api/productionTemplates/${template.id}/run`, {
        method: "POST",
        body: JSON.stringify(options)
      });
      if (Array.isArray(result.queue)) setQueue(result.queue);
      setProductionTemplates((items) => items.map((item) => item.id === result.template.id ? result.template : item));
      setBackendStatus("connected");
      return result;
    } catch {
      const jobs: QueueItem[] = Array.from({ length: options.quantity || template.quantity || 1 }, (_, index) => {
        const file = files.find((item) => item.id === template.fileId);
        return {
          id: crypto.randomUUID(),
          fileId: template.fileId,
          file: `${template.name}${(options.quantity || template.quantity || 1) > 1 ? ` #${index + 1}` : ""}`,
          printerId: template.printerId || "",
          printer: template.printerId || "Unassigned",
          status: "queued",
          priority: template.priority,
          stage: template.stage,
          material: template.material || file?.material || "PLA",
          color: template.color || "Any",
          due: new Date(Date.now() + template.dueOffsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          dimensions: file?.dimensions || [100, 100, 50],
          assignee: "Scheduler",
          time: template.time,
          cost: template.cost,
          added: `Template: ${template.name}`,
          sourceTemplateId: template.id,
          sourceSku: template.sku || ""
        };
      });
      if (!options.dryRun) setQueue((items) => [...items, ...jobs]);
      setBackendStatus("local");
      return { template, jobs, dryRun: Boolean(options.dryRun), queue: options.dryRun ? queue : [...queue, ...jobs], todos };
    }
  };

  const generateNameplate = async (draft: ParametricNameplateDraft) => {
    try {
      const result = await apiRequest<ParametricNameplateResult>("/api/parametric/nameplate", {
        method: "POST",
        body: JSON.stringify(draft)
      });
      if (Array.isArray(result.files)) setFiles(result.files);
      else setFiles((items) => [result.file, ...items.filter((item) => item.id !== result.file.id)]);
      if (Array.isArray(result.parts)) setParts(result.parts);
      else if (result.part) setParts((items) => [result.part!, ...items.filter((item) => item.id !== result.part?.id)]);
      setBackendStatus("connected");
      return result;
    } catch {
      const fallbackFile: PrintFile = {
        id: crypto.randomUUID(),
        name: `Nameplate ${draft.text}.stl`,
        type: "STL",
        folder: "Parametric / Nameplates",
        size: "0 MB",
        material: draft.material,
        tags: ["parametric", "nameplate", draft.feature],
        sliced: false,
        status: "uploaded",
        version: 1,
        dimensions: [draft.width, draft.height, draft.thickness],
        thumbnail: draft.text,
        printTime: "0h 30m",
        cost: 18,
        layerHeight: "0.20",
        usage: Math.max(1, Math.round(draft.width * draft.height * draft.thickness * 0.00124))
      };
      const fallbackPart: Part | null = draft.createPart ? { id: crypto.randomUUID(), name: `Parametric nameplate - ${draft.text}`, fileId: fallbackFile.id, material: draft.material, process: "0.20mm Production", plates: 1, variants: ["Text", draft.feature], status: "ready" } : null;
      setFiles((items) => [fallbackFile, ...items]);
      if (fallbackPart) setParts((items) => [fallbackPart, ...items]);
      setBackendStatus("local");
      return { file: fallbackFile, part: fallbackPart, estimates: { grams: fallbackFile.usage, minutes: 30, quote: { total: fallbackFile.cost } }, stlBytes: 0 };
    }
  };

  const localCatalogRows = () => skus.map((sku) => {
    const linkedParts = sku.parts
      .map((partName) => parts.find((part) => part.name.toLowerCase() === partName.toLowerCase()))
      .filter(Boolean) as Part[];
    const linkedFiles = linkedParts
      .map((part) => files.find((file) => file.id === part.fileId))
      .filter(Boolean) as PrintFile[];
    return {
      sku: sku.sku,
      title: sku.title,
      channel: sku.channel,
      price: sku.price,
      stock: sku.stock,
      variants: sku.variants.join("|"),
      parts: sku.parts.join("|"),
      partIds: linkedParts.map((part) => part.id).join("|"),
      fileIds: linkedParts.map((part) => part.fileId).join("|"),
      fileNames: linkedFiles.map((file) => file.name).join("|"),
      materials: [...new Set(linkedParts.map((part) => part.material))].join("|"),
      processes: [...new Set(linkedParts.map((part) => part.process))].join("|"),
      plates: linkedParts.reduce((sum, part) => sum + part.plates, 0),
      partStatuses: [...new Set(linkedParts.map((part) => part.status))].join("|"),
      fileStatuses: [...new Set(linkedFiles.map((file) => file.status))].join("|"),
      estimatedMinutes: linkedFiles.reduce((sum, file) => {
        const hours = Number(file.printTime.match(/(\d+)h/)?.[1] || 0);
        const minutes = Number(file.printTime.match(/(\d+)m/)?.[1] || 0);
        return sum + hours * 60 + minutes;
      }, 0),
      estimatedGrams: linkedFiles.reduce((sum, file) => sum + file.usage, 0)
    };
  });

  const exportCatalog = async () => {
    const filename = `layerpilot-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    try {
      const result = await apiRequest<CatalogExportResult>("/api/catalog/export");
      downloadCsvFile(filename, result.rows);
      setBackendStatus("connected");
      return result;
    } catch {
      const rows = localCatalogRows();
      downloadCsvFile(filename, rows);
      setBackendStatus("local");
      return { exportedAt: new Date().toISOString(), rows, csv: "" };
    }
  };

  const mapMaterials = async () => {
    try {
      const result = await apiRequest<MaterialMapResult>("/api/catalog/material-map", {
        method: "POST",
        body: JSON.stringify({ apply: true })
      });
      if (Array.isArray(result.parts)) setParts(result.parts);
      if (Array.isArray(result.files)) setFiles(normalizeFiles(result.files));
      if (Array.isArray(result.queue)) setQueue(result.queue);
      setBackendStatus("connected");
      return result;
    } catch {
      const canonical = ["PLA", "PETG", "ASA", "ABS", "TPU", "Resin", "Nylon"];
      const normalizeMaterial = (value: string) => canonical.find((item) => value.toLowerCase().includes(item.toLowerCase())) || value;
      const nextParts = parts.map((part) => ({ ...part, material: normalizeMaterial(part.material) }));
      const nextFiles = files.map((file) => ({ ...file, material: normalizeMaterial(file.material) }));
      const nextQueue = queue.map((job) => ({ ...job, material: normalizeMaterial(job.material) }));
      const changed = [
        ...parts.map((part, index) => part.material !== nextParts[index].material),
        ...files.map((file, index) => file.material !== nextFiles[index].material),
        ...queue.map((job, index) => job.material !== nextQueue[index].material)
      ].filter(Boolean).length;
      setParts(nextParts);
      setFiles(nextFiles);
      setQueue(nextQueue);
      setBackendStatus("local");
      return {
        generatedAt: new Date().toISOString(),
        applied: true,
        changed,
        unmapped: 0,
        mappings: [],
        items: []
      };
    }
  };

  const generateJobsForOrder = async (order: Order, dryRun = false) => {
    const payload = { dryRun };
    const attemptKey = `order-generate-jobs:${order.id}:${dryRun ? "dry-run" : "commit"}`;
    try {
      const result = await apiRequest<OrderJobGenerationResult>(`/api/orders/${order.id}/generate-jobs`, {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, { orderId: order.id, ...payload }),
        body: JSON.stringify(payload)
      });
      if (!dryRun && !result.duplicateBlocked) {
        setOrders((items) => items.map((item) => item.id === order.id ? result.order : item));
        setQueue((items) => [...items, ...result.jobs.filter((job) => !items.some((item) => item.id === job.id))]);
        if (Array.isArray(result.skus)) setSkus(result.skus);
      }
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return result;
    } catch {
      const printer = printers.find((p) => p.status === "idle") || printers.find((p) => p.status !== "offline" && p.status !== "maintenance") || printers[0];
      const fallbackJobs = order.items.map((item) => ({
        id: crypto.randomUUID(),
        fileId: "order",
        file: `${item} production job`,
        printerId: printer.id,
        printer: printer.name,
        status: "queued" as JobStatus,
        priority: "High" as QueueItem["priority"],
        stage: "needs scheduling" as TaskStage,
        material: "Auto matched",
        color: "Any",
        due: order.due,
        dimensions: [120, 100, 50] as [number, number, number],
        assignee: "Scheduler",
        time: "2h 35m",
        cost: Math.round(order.value / Math.max(1, order.items.length)),
        added: "From order"
      }));
      if (!dryRun) {
        setQueue((items) => [...items, ...fallbackJobs]);
        setOrders((items) => items.map((item) => item.id === order.id ? { ...item, status: "queued" } : item));
      }
      setBackendStatus("local");
      return { order: dryRun ? order : { ...order, status: "queued" as Order["status"] }, jobs: fallbackJobs, skus, missing: [], dryRun, duplicateBlocked: false, stockChanges: [] };
    }
  };

  const createFile = async (draft: PrintFile) => {
    try {
      const created = await apiRequest<Partial<PrintFile>>("/api/files", {
        method: "POST",
        body: JSON.stringify({
          name: draft.name,
          type: draft.type,
          material: draft.material,
          folder: draft.folder,
          size: draft.size,
          tags: draft.tags,
          thumbnail: draft.thumbnail,
          layerHeight: draft.layerHeight,
          dimensions: draft.dimensions,
          estimateGrams: draft.usage,
          estimateMinutes: Number(draft.printTime.match(/(\d+)h/)?.[1] || 1) * 60 + Number(draft.printTime.match(/(\d+)m/)?.[1] || 0),
          quote: draft.cost
        })
      });
      const normalized = normalizeFiles([created])[0];
      setFiles((items) => [...items, normalized]);
      setBackendStatus("connected");
      return normalized;
    } catch {
      setFiles((items) => [...items, draft]);
      setBackendStatus("local");
      return draft;
    }
  };

  const uploadModelFile = async (fileBlob: File, material = "PLA", folder = "Uploads") => {
    const formData = new FormData();
    formData.append("file", fileBlob);
    formData.append("material", material);
    formData.append("folder", folder);
    try {
      const uploaded = await apiRequest<Partial<PrintFile>>("/api/files/upload", {
        method: "POST",
        body: formData
      });
      const normalized = normalizeFiles([uploaded])[0];
      setFiles((items) => [...items, normalized]);
      setBackendStatus("connected");
      return normalized;
    } catch {
      const extension = fileBlob.name.split(".").pop()?.toUpperCase();
      const fallback: PrintFile = {
        id: crypto.randomUUID(),
        name: fileBlob.name,
        type: extension === "GCODE" || extension === "3MF" || extension === "OBJ" || extension === "STL" ? extension : "STL",
        folder,
        size: `${Math.max(1, Math.round(fileBlob.size / 1024))} KB`,
        material,
        tags: ["local-upload"],
        sliced: extension === "GCODE",
        status: extension === "GCODE" ? "sliced" : "uploaded",
        version: 1,
        dimensions: [100, 100, 50],
        thumbnail: fileBlob.name,
        printTime: "1h 00m",
        cost: 24,
        layerHeight: "0.20",
        usage: 28
      };
      setFiles((items) => [...items, fallback]);
      setBackendStatus("local");
      return fallback;
    }
  };

  const createFileFolder = async (draft: Omit<FileFolder, "id" | "fileCount" | "createdAt" | "updatedAt">) => {
    const fallback: FileFolder = { ...draft, id: crypto.randomUUID(), fileCount: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const attemptKey = `file-folder:${draft.parent || ""}:${draft.name}:${draft.purpose}`;
    try {
      const result = await apiRequest<{ folder: FileFolder; folders: FileFolder[]; created: boolean }>("/api/file-folders", {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, draft),
        body: JSON.stringify(draft)
      });
      setFileFolders(result.folders);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return result.folder;
    } catch {
      setFileFolders((items) => [...items, fallback]);
      setBackendStatus("local");
      return fallback;
    }
  };

  const createSampleFile = async (draft: { name: string; material: string; folder: string }) => {
    const attemptKey = "file-sample";
    try {
      const result = await apiRequest<{ file: Partial<PrintFile>; folder: FileFolder; files: Partial<PrintFile>[]; folders: FileFolder[]; stlBytes: number }>("/api/files/sample", {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, draft),
        body: JSON.stringify(draft)
      });
      const normalized = normalizeFiles([result.file])[0];
      setFiles(normalizeFiles(result.files));
      setFileFolders(result.folders);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return { file: normalized, folder: result.folder, stlBytes: result.stlBytes };
    } catch {
      const fallback: PrintFile = {
        id: crypto.randomUUID(),
        name: `${draft.name || "3DSTU FarmFlow sample bracket"}.stl`,
        type: "STL",
        folder: draft.folder,
        size: "0 KB",
        material: draft.material,
        tags: ["local-sample"],
        sliced: false,
        status: "uploaded",
        version: 1,
        dimensions: [120, 36, 28],
        thumbnail: draft.name,
        printTime: "2h 08m",
        cost: 38,
        layerHeight: "0.20",
        usage: 64
      };
      setFiles((items) => [...items, fallback]);
      setBackendStatus("local");
      return { file: fallback, folder: { id: crypto.randomUUID(), name: draft.folder, purpose: "sample" as const, fileCount: 1 }, stlBytes: 0 };
    }
  };

  const saveHotDropMode = async (mode: HotDropMode) => {
    setHotDropMode(mode);
    setWorkspaceSettings((current) => ({ ...current, hotDropMode: mode }));
    try {
      const updated = await apiRequest<WorkspaceSettings>("/api/workspaceSettings", {
        method: "PATCH",
        body: JSON.stringify({ hotDropMode: mode })
      });
      const merged = { ...defaultWorkspaceSettings, ...updated };
      setWorkspaceSettings(merged);
      setHotDropMode(merged.hotDropMode);
      setBackendStatus("connected");
      addToast(`Hot Drop mode saved as ${merged.hotDropMode}`, "info");
      return merged;
    } catch {
      setBackendStatus("local");
      addToast("Hot Drop mode saved locally while API is unavailable", "warning");
      return undefined;
    }
  };

  const runHotDrop = async () => {
    const mode = hotDropMode;
    const payload = {
      mode,
      name: `Hot Drop ${new Date().toISOString().slice(11, 16).replace(":", "")}`,
      material: mode === "Upload Only" ? "PLA" : "Any Material",
      folder: "Hot Drops / Today"
    };
    const attemptKey = "hot-drop";
    try {
      const result = await apiRequest<HotDropResult>("/api/hot-drop", {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, payload),
        body: JSON.stringify(payload)
      });
      const normalizedFiles = normalizeFiles(result.files);
      setFiles(normalizedFiles);
      setFileFolders(result.folders);
      setQueue(result.queue);
      setPrinters(result.printers);
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      const normalizedFile = normalizeFiles([result.file])[0];
      if (result.mode === "Upload Only") {
        setView("files");
        addToast(`Hot Drop uploaded ${normalizedFile.name}`, "info");
        return;
      }
      if (result.job?.stage === "needs slicing") {
        setView("slicer");
        addToast(`Hot Drop queued ${normalizedFile.name} for slicing before print`, "warning");
        return;
      }
      if (result.mode === "Direct Print") {
        setView("queue");
        addToast(result.match?.matches?.length ? `Hot Drop queued and sent to an available printer` : `Hot Drop queued; no safe printer slot is open`, result.match?.matches?.length ? "success" : "warning");
        return;
      }
      setView("scheduler");
      addToast(`Hot Drop queued ${normalizedFile.name}`, "success");
      return;
    } catch {
      setBackendStatus("local");
    }
    const result = await createSampleFile({
      name: `Hot Drop ${new Date().toISOString().slice(11, 16).replace(":", "")}`,
      material: mode === "Upload Only" ? "PLA" : "Any Material",
      folder: "Hot Drops / Today"
    });
    const file = { ...result.file, tags: Array.from(new Set([...(result.file.tags || []), "hot-drop", mode.toLowerCase().replace(" ", "-")])) };
    setFiles((items) => items.map((item) => item.id === file.id ? file : item));
    if (mode === "Upload Only") {
      setView("files");
      addToast(`Hot Drop uploaded ${file.name}`, "info");
      return;
    }
    await mockApi.addQueueFromFile(file);
    setView(mode === "Direct Print" ? "queue" : "scheduler");
    if (mode === "Direct Print") {
      if (!file.sliced && file.type !== "GCODE") {
        setView("slicer");
        addToast(`Hot Drop queued ${file.name} for slicing before print`, "warning");
        return;
      }
      const match = await matchQueueJobs(false);
      const started = match.matches.some((item) => item.file === file.name || item.jobId === file.id);
      addToast(started ? `Hot Drop queued and sent to an available printer` : `Hot Drop queued; no safe printer slot is open`, started ? "success" : "warning");
      return;
    }
    addToast(`Hot Drop queued ${file.name}`, "success");
  };

  const versionFile = async (fileId: string) => {
    const attemptKey = `file-version:${fileId}`;
    setFiles((items) => items.map((item) => item.id === fileId ? { ...item, version: item.version + 1, status: "needs review" } : item));
    try {
      const updated = await apiRequest<Partial<PrintFile>>(`/api/files/${fileId}/version`, { method: "PATCH", headers: operatorIdempotencyHeaders(attemptKey, { fileId }) });
      const normalized = normalizeFiles([updated])[0];
      setFiles((items) => items.map((item) => item.id === fileId ? normalized : item));
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
    } catch {
      setBackendStatus("local");
    }
  };

  const downloadFile = async (file: PrintFile) => {
    const token = window.localStorage.getItem("layerpilot-token") || "";
    try {
      const response = await fetch(`${API_BASE}/api/files/${file.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error(`Download failed ${response.status}`);
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") || "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] || file.name;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      setBackendStatus("connected");
      return true;
    } catch {
      setBackendStatus("local");
      return false;
    }
  };

  const deleteFile = async (fileId: string) => {
    const attemptKey = `file-delete:${fileId}`;
    try {
      await apiRequest(`/api/files/${fileId}`, { method: "DELETE", headers: operatorIdempotencyHeaders(attemptKey, { fileId }) });
      setFiles((items) => items.filter((file) => file.id !== fileId));
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return true;
    } catch {
      setBackendStatus("local");
      return false;
    }
  };

  const sliceFile = async (fileId: string) => {
    const attemptKey = `file-slice:${fileId}`;
    setFiles((items) => items.map((file) => file.id === fileId ? { ...file, sliced: true, status: "sliced", type: "GCODE" } : file));
    try {
      const updated = await apiRequest<Partial<PrintFile>>(`/api/files/${fileId}/slice`, { method: "PATCH", headers: operatorIdempotencyHeaders(attemptKey, { fileId }) });
      const normalized = normalizeFiles([updated])[0];
      setFiles((items) => items.map((file) => file.id === fileId ? normalized : file));
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
    } catch {
      setBackendStatus("local");
    }
  };

  const runSlicerJob = async (settings: { fileId: string; printerId: string; material: string; layerHeight: string; infill: number; supports: boolean }) => {
    const sourceFile = files.find((file) => file.id === settings.fileId);
    const printer = printers.find((item) => item.id === settings.printerId) || printers[0];
    const attemptKey = `slicer-job:${settings.fileId}`;
    try {
      const result = await apiRequest<{ job: SlicerJob; file: Partial<PrintFile>; slicerJobs: SlicerJob[] }>("/api/slicer/jobs", {
        method: "POST",
        headers: operatorIdempotencyHeaders(attemptKey, settings),
        body: JSON.stringify(settings)
      });
      setSlicerJobs(result.slicerJobs);
      const normalized = normalizeFiles([result.file])[0];
      setFiles((items) => items.map((file) => file.id === normalized.id ? normalized : file));
      setBackendStatus("connected");
      clearOperatorIdempotency(attemptKey);
      return { job: result.job, file: normalized };
    } catch {
      const fallbackJob: SlicerJob = {
        id: crypto.randomUUID(),
        fileId: settings.fileId,
        sourceFile: sourceFile?.name || "Local model",
        printerId: printer?.id || "",
        printer: printer?.name || "Local printer",
        status: "failed",
        engine: "internal",
        settings,
        error: "Slicer API unavailable",
        createdAt: new Date().toISOString()
      };
      setSlicerJobs((items) => [fallbackJob, ...items]);
      setBackendStatus("local");
      return { job: fallbackJob, file: sourceFile };
    }
  };

  const createProfile = async (draft: Omit<Profile, "id" | "updated">) => {
    const fallback: Profile = { ...draft, id: crypto.randomUUID(), updated: "Just now" };
    try {
      const created = await apiRequest<Profile>("/api/profiles", {
        method: "POST",
        body: JSON.stringify(draft)
      });
      setProfiles((items) => [...items, created]);
      setBackendStatus("connected");
      return created;
    } catch {
      setProfiles((items) => [...items, fallback]);
      setBackendStatus("local");
      return fallback;
    }
  };

  const importProfiles = async (source: Profile["source"], content?: string, profileDrafts?: Array<Omit<Profile, "id" | "updated">>) => {
    try {
      const result = await apiRequest<{ imported: Profile[]; skipped: Array<{ name: string; reason: string }>; profiles: Profile[] }>("/api/profiles/import", {
        method: "POST",
        body: JSON.stringify({ source, content, profiles: profileDrafts })
      });
      setProfiles(result.profiles);
      setBackendStatus("connected");
      return result;
    } catch {
      const fallbackProfiles = profileDrafts?.map((profile) => ({ ...profile, id: crypto.randomUUID(), updated: "Just now" })) || [{
        id: crypto.randomUUID(),
        name: source === "Bambu sync" ? "A1 high-speed PLA" : "0.16mm quality plate",
        kind: source === "Bambu sync" ? "Machine" as Profile["kind"] : "Process" as Profile["kind"],
        target: source === "Bambu sync" ? "Bambu-style bridge" : "FDM fleet",
        source,
        updated: "Just now",
        settings: {}
      }];
      setProfiles((items) => [...items, ...fallbackProfiles]);
      setBackendStatus("local");
      return { imported: fallbackProfiles, skipped: [], profiles: [...profiles, ...fallbackProfiles] };
    }
  };

  const archiveProfile = async (profileId: string) => {
    const removed = profiles.find((profile) => profile.id === profileId);
    setProfiles((items) => items.filter((item) => item.id !== profileId));
    try {
      await apiRequest(`/api/profiles/${profileId}`, { method: "DELETE" });
      setBackendStatus("connected");
      return true;
    } catch {
      setBackendStatus("local");
      if (removed) setProfiles((items) => items.some((item) => item.id === removed.id) ? items : [...items, removed]);
      return false;
    }
  };

  const setDefaultProfile = async (profileId: string) => {
    const profile = profiles.find((item) => item.id === profileId);
    if (!profile) return undefined;
    setProfileDefaults((current) => ({ ...current, [profile.kind]: profile.id }));
    try {
      const result = await apiRequest<{ profile: Profile; profileDefaults: ProfileDefaults; profiles: Profile[] }>(`/api/profiles/${profileId}/default`, { method: "PATCH" });
      setProfiles(result.profiles);
      setProfileDefaults(result.profileDefaults);
      setBackendStatus("connected");
      return result;
    } catch {
      setBackendStatus("local");
      return { profile, profileDefaults: { ...profileDefaults, [profile.kind]: profile.id }, profiles };
    }
  };

  const saveProfilePolicy = async (patch: Partial<ProfileMatchingPolicy>) => {
    setProfileMatchingPolicy((current) => ({ ...current, ...patch }));
    try {
      const updated = await apiRequest<ProfileMatchingPolicy>("/api/profile-policy", {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      setProfileMatchingPolicy(updated);
      setBackendStatus("connected");
      return updated;
    } catch {
      setBackendStatus("local");
      return undefined;
    }
  };

  const saveCostCatalog = async (patch: Partial<CostCatalog>) => {
    setCostCatalog((current) => ({ ...current, ...patch, materialRates: { ...current.materialRates, ...(patch.materialRates || {}) } }));
    try {
      const updated = await apiRequest<CostCatalog>("/api/costCatalog", {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      setCostCatalog({ ...defaultCostCatalog, ...updated, materialRates: { ...defaultCostCatalog.materialRates, ...updated.materialRates } });
      setBackendStatus("connected");
      return updated;
    } catch {
      setBackendStatus("local");
      return undefined;
    }
  };

  const updateAddon = async (addonId: string, patch: Partial<Pick<Addon, "status" | "enabled" | "config">> & { note?: string }) => {
    const previous = addons;
    const optimisticStatus = patch.status || (patch.enabled !== undefined ? patch.enabled ? "enabled" : "disabled" : undefined);
    setAddons((items) => items.map((addon) => addon.id === addonId ? { ...addon, ...patch, status: optimisticStatus || addon.status, enabled: optimisticStatus ? optimisticStatus === "enabled" : addon.enabled, config: { ...(addon.config || {}), ...(patch.config || {}) } } : addon));
    try {
      const result = await apiRequest<{ addon: Addon; addons: Addon[] }>(`/api/addons/${addonId}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      setAddons(result.addons);
      setBackendStatus("connected");
      return result.addon;
    } catch {
      setBackendStatus("local");
      setAddons(previous.map((addon) => addon.id === addonId ? { ...addon, ...patch, status: optimisticStatus || addon.status, enabled: optimisticStatus ? optimisticStatus === "enabled" : addon.enabled, config: { ...(addon.config || {}), ...(patch.config || {}) } } : addon));
      return undefined;
    }
  };

  const mockApi = {
    controlPrinter: async (id: string, action: string) => {
      const current = printers.find((printer) => printer.id === id);
      if (!current) return;
      const payload = { printerId: id, action };
      const attemptKey = `printer-action:${id}:${action}`;
      try {
        const result = await apiRequest<{ printer: Printer; job?: QueueItem | null; action: string }>(
          "/api/actions",
          { method: "POST", headers: operatorIdempotencyHeaders(attemptKey, payload), body: JSON.stringify(payload) }
        );
        setPrinterState(result.printer);
        if (result.job) setQueue((items) => items.map((job) => job.id === result.job?.id ? result.job : job));
        setBackendStatus("connected");
        clearOperatorIdempotency(attemptKey);
        addToast(`${result.action} accepted by printer bridge`, "info");
        return;
      } catch {
        setBackendStatus("local");
      }
      if (action === "pause") await updatePrinterStatus(id, "paused");
      else if (action === "resume" || action === "start") await updatePrinterStatus(id, "printing", { job: current.job || "Manual control" });
      else if (action === "cancel") await updatePrinterStatus(id, "idle", { progress: 0, job: undefined });
      else if (action === "preheat") {
        setPrinters((items) => items.map((p) => p.id === id ? { ...p, targetNozzle: p.filament.toLowerCase().includes("petg") ? 240 : 210, targetBed: p.filament.toLowerCase().includes("petg") ? 75 : 60, status: p.status === "offline" ? "idle" : p.status } : p));
      } else if (action === "cooldown") {
        setPrinters((items) => items.map((p) => p.id === id ? { ...p, targetNozzle: 0, targetBed: 0 } : p));
      }
      addToast(`${action} applied locally while API is unavailable`, "warning");
    },
    addQueueFromFile: async (file: PrintFile) => {
      const printer = printers.find((p) => p.status !== "offline") || printers[0];
      await createQueueJob({
        fileId: file.id,
        file: file.name,
        printerId: printer.id,
        printer: printer.name,
        status: "queued",
        priority: "Normal",
        stage: file.sliced ? "needs scheduling" : "needs slicing",
        material: file.material,
        color: file.tags.includes("resin") ? "Gray" : "Any",
        due: "Tomorrow 17:00",
        dimensions: file.dimensions,
        assignee: "Maya",
        time: file.printTime,
        cost: file.cost,
        added: "Just now"
      });
      addToast(`${file.name} added to queue`);
    }
  };

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([
    { id: "w1", name: "Slack alerts", url: "https://hooks.slack.test/layerpilot", events: ["print.failed", "printer.offline"], enabled: true },
    { id: "w2", name: "n8n farm flow", url: "https://n8n.local/webhook/jobs", events: ["job.completed", "spool.low"], enabled: false }
  ]);
  const [webhookDeliveries, setWebhookDeliveries] = useState<WebhookDelivery[]>([]);
  const [notificationChannels, setNotificationChannels] = useState<NotificationChannel[]>([]);
  const [notificationDeliveries, setNotificationDeliveries] = useState<NotificationDelivery[]>([]);
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [commerceConnectors, setCommerceConnectors] = useState<CommerceConnector[]>([]);
  const [commerceImports, setCommerceImports] = useState<CommerceImport[]>([]);
  const [slicerJobs, setSlicerJobs] = useState<SlicerJob[]>([]);
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>(defaultWorkspaceSettings);
  const [costCatalog, setCostCatalog] = useState<CostCatalog>(defaultCostCatalog);

  useLocalizedDom(language);

  const applyIncomingState = (data: Record<string, unknown>) => {
    if (Array.isArray(data.printers)) {
      const nextPrinters = data.printers as Printer[];
      setPrinters(nextPrinters);
      setSelectedPrinter((current) => current ? nextPrinters.find((printer) => printer.id === current.id) || current : current);
    }
    if (Array.isArray(data.files)) setFiles(normalizeFiles(data.files));
    if (Array.isArray(data.fileFolders)) setFileFolders(data.fileFolders as FileFolder[]);
    if (Array.isArray(data.queue)) setQueue(data.queue as QueueItem[]);
    if (Array.isArray(data.todoActions)) setTodoActions(data.todoActions as TodoAction[]);
    if (Array.isArray(data.spools)) setSpools(data.spools as Spool[]);
    if (Array.isArray(data.purchaseRequests)) setPurchaseRequests(data.purchaseRequests as PurchaseRequest[]);
    if (Array.isArray(data.maintenance)) setMaintenance(data.maintenance as MaintenanceJob[]);
    if (Array.isArray(data.maintenanceTemplates)) setMaintenanceTemplates(data.maintenanceTemplates as MaintenanceTemplate[]);
    if (Array.isArray(data.maintenanceReports)) setMaintenanceReports(data.maintenanceReports as MaintenanceReport[]);
    if (Array.isArray(data.users)) setUsers(data.users as User[]);
    if (Array.isArray(data.parts)) setParts(data.parts as Part[]);
    if (Array.isArray(data.skus)) setSkus(data.skus as SKU[]);
    if (Array.isArray(data.productionTemplates)) setProductionTemplates(data.productionTemplates as ProductionTemplate[]);
    if (Array.isArray(data.quoteRequests)) setQuoteRequests(data.quoteRequests as QuoteRequest[]);
    if (Array.isArray(data.orders)) setOrders(data.orders as Order[]);
    if (Array.isArray(data.profiles)) setProfiles(data.profiles as Profile[]);
    if (data.profileDefaults && typeof data.profileDefaults === "object") setProfileDefaults(data.profileDefaults as ProfileDefaults);
    if (data.profileMatchingPolicy && typeof data.profileMatchingPolicy === "object") setProfileMatchingPolicy({ materialCompatibility: true, processFallback: true, commercialPriority: true, warnBeforeFallback: true, dueWindowHours: 2, ...(data.profileMatchingPolicy as Partial<ProfileMatchingPolicy>) });
    if (Array.isArray(data.addons)) setAddons(data.addons as Addon[]);
    if (Array.isArray(data.webhooks)) setWebhooks(data.webhooks as Webhook[]);
    if (Array.isArray(data.webhookDeliveries)) setWebhookDeliveries(data.webhookDeliveries as WebhookDelivery[]);
    if (Array.isArray(data.notificationChannels)) setNotificationChannels(data.notificationChannels as NotificationChannel[]);
    if (Array.isArray(data.notificationDeliveries)) setNotificationDeliveries(data.notificationDeliveries as NotificationDelivery[]);
    if (Array.isArray(data.bridges)) setBridges(data.bridges as Bridge[]);
    if (Array.isArray(data.commerceConnectors)) setCommerceConnectors(data.commerceConnectors as CommerceConnector[]);
    if (Array.isArray(data.commerceImports)) setCommerceImports(data.commerceImports as CommerceImport[]);
    if (Array.isArray(data.apiKeys)) setApiKeys(data.apiKeys as ApiKey[]);
    if (Array.isArray(data.slicerJobs)) setSlicerJobs(data.slicerJobs as SlicerJob[]);
    if (data.workspaceSettings && typeof data.workspaceSettings === "object") {
      const mergedSettings = { ...defaultWorkspaceSettings, ...(data.workspaceSettings as Partial<WorkspaceSettings>) };
      setWorkspaceSettings(mergedSettings);
      setHotDropMode(mergedSettings.hotDropMode);
    }
    if (data.costCatalog && typeof data.costCatalog === "object") setCostCatalog({ ...defaultCostCatalog, ...(data.costCatalog as Partial<CostCatalog>), materialRates: { ...defaultCostCatalog.materialRates, ...((data.costCatalog as Partial<CostCatalog>).materialRates || {}) } });
  };

  useEffect(() => {
    if (!authed) return;
    apiRequest<Record<string, unknown>>("/api/state")
      .then((data) => {
        applyIncomingState(data);
        setBackendStatus("connected");
        setTwoFactorEnrollmentRequired(false);
      })
      .catch((error) => {
        if (error instanceof ApiError && error.body.requiresTwoFactorEnrollment === true) {
          setTwoFactorEnrollmentRequired(true);
          setBackendStatus("connected");
          setView("settings");
          addToast("Set up two-factor authentication to unlock production admin access.", "warning");
          return;
        }
        setBackendStatus("local");
      });
  }, [authed, authToken]);

  useEffect(() => {
    if (!authed || !authToken || authToken === "local-demo" || twoFactorEnrollmentRequired) return;
    const handleRealtimePayload = (kind: string, payload: Record<string, unknown>) => {
      if (kind === "state" && payload.state) applyIncomingState(payload.state as Record<string, unknown>);
      if (kind === "event") {
        const event = payload.event as { message?: string } | undefined;
        const message = event?.message;
        if (message) setNotifications((items) => [message, ...items.filter((item) => item !== message)].slice(0, 8));
        if (Array.isArray(payload.notificationDeliveries)) setNotificationDeliveries((items) => [...(payload.notificationDeliveries as NotificationDelivery[]), ...items].slice(0, 25));
      }
      if (kind !== "heartbeat") setBackendStatus("connected");
    };
    if ("WebSocket" in window) {
      const socket = new WebSocket(realtimeUrl("/api/events/ws", authToken));
      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data || "{}");
        handleRealtimePayload(payload.event || "", payload.data || {});
      };
      socket.onerror = () => setBackendStatus("local");
      socket.onclose = () => setBackendStatus("local");
      return () => socket.close();
    }
    const source = new EventSource(`${API_BASE}/api/events/stream?token=${encodeURIComponent(authToken)}`);
    source.addEventListener("state", (event) => handleRealtimePayload("state", JSON.parse((event as MessageEvent).data || "{}")));
    source.addEventListener("event", (event) => handleRealtimePayload("event", JSON.parse((event as MessageEvent).data || "{}")));
    source.onerror = () => setBackendStatus("local");
    return () => source.close();
  }, [authed, authToken, twoFactorEnrollmentRequired]);

  if (!authed && showMarketing) return <MarketingSite onOpenApp={() => { window.location.hash = "app"; setShowMarketing(false); }} />;

  if (!authed) return <><AuthScreen onLogin={authenticate} language={language} setLanguage={setLanguage} /><VersionBadge /></>;

  return (
    <div className="app-shell">
      <Sidebar view={view} setView={setView} mobileNav={mobileNav} setMobileNav={setMobileNav} hotDropMode={hotDropMode} setHotDropMode={saveHotDropMode} onHotDrop={runHotDrop} />
      <main className="workspace">
        <Topbar setMobileNav={setMobileNav} setView={setView} notifications={notifications.length} onLogout={logout} language={language} setLanguage={setLanguage} backendStatus={backendStatus} />
        {view === "dashboard" && <Dashboard metrics={metrics} printers={printers} queue={queue} setView={setView} setModal={setModal} onPrinter={setSelectedPrinter} />}
        {view === "printers" && <PrintersPage printers={printers} onPrinter={setSelectedPrinter} setModal={setModal} api={mockApi} />}
        {view === "products" && <ProductsPage parts={parts} skus={skus} productionTemplates={productionTemplates} files={files} createPart={createPart} createSku={createSku} createProductionTemplate={createProductionTemplate} runProductionTemplate={runProductionTemplate} generateNameplate={generateNameplate} exportCatalog={exportCatalog} mapMaterials={mapMaterials} addToast={addToast} />}
        {view === "orders" && <OrdersPage orders={orders} setOrders={setOrders} quoteRequests={quoteRequests} files={files} skus={skus} commerceConnectors={commerceConnectors} setCommerceConnectors={setCommerceConnectors} commerceImports={commerceImports} setCommerceImports={setCommerceImports} createOrder={createOrder} updateOrderStatus={updateOrderStatus} updateQuoteRequest={updateQuoteRequest} createQuotePortalLink={createQuotePortalLink} convertQuoteRequest={convertQuoteRequest} generateJobsForOrder={generateJobsForOrder} downloadFile={downloadFile} addToast={addToast} setBackendStatus={setBackendStatus} />}
        {view === "files" && <FilesPage files={files} folders={fileFolders} queueFile={mockApi.addQueueFromFile} setView={setView} addToast={addToast} createSampleFile={createSampleFile} createFileFolder={createFileFolder} uploadModelFile={uploadModelFile} versionFile={versionFile} downloadFile={downloadFile} deleteFile={deleteFile} />}
        {view === "queue" && <QueuePage queue={queue} setQueue={setQueue} printers={printers} addToast={addToast} scheduleJob={scheduleQueueJob} updateStatus={updateQueueStatus} updatePriority={updateQueuePriority} matchQueueJobs={matchQueueJobs} />}
        {view === "scheduler" && <SchedulerPage queue={queue} setQueue={setQueue} printers={printers} addToast={addToast} scheduleJob={scheduleQueueJob} autoScheduleJobs={autoScheduleQueueJobs} optimizeScheduleJobs={optimizeScheduleJobs} solveScheduleJobs={solveScheduleJobs} />}
        {view === "todos" && <TodosPage todos={todos} queue={queue} printers={printers} currentUser={currentUser} actOnTodo={actOnTodo} addToast={addToast} />}
        {view === "slicer" && <SlicerPage files={files} printers={printers} slicerJobs={slicerJobs} addToast={addToast} runSlicerJob={runSlicerJob} />}
        {view === "filament" && <FilamentPage spools={spools} purchaseRequests={purchaseRequests} createSpool={createSpool} updateSpool={updateSpool} logSpoolUsage={logSpoolUsage} generateSpoolLabels={generateSpoolLabels} scanSpool={scanSpool} createPurchaseRequest={createPurchaseRequest} generateReorderPlan={generateReorderPlan} updatePurchaseRequest={updatePurchaseRequest} receivePurchaseRequest={receivePurchaseRequest} addToast={addToast} />}
        {view === "profiles" && <ProfilesPage profiles={profiles} profileDefaults={profileDefaults} profileMatchingPolicy={profileMatchingPolicy} createProfile={createProfile} importProfiles={importProfiles} archiveProfile={archiveProfile} setDefaultProfile={setDefaultProfile} saveProfilePolicy={saveProfilePolicy} addToast={addToast} />}
        {view === "analytics" && <AnalyticsPage addToast={addToast} />}
        {view === "history" && <HistoryPage setQueue={setQueue} printers={printers} addToast={addToast} setBackendStatus={setBackendStatus} />}
        {view === "maintenance" && <MaintenancePage jobs={maintenance} templates={maintenanceTemplates} reports={maintenanceReports} createJob={createMaintenanceJob} updateJob={updateMaintenanceJob} saveTemplate={saveMaintenanceTemplate} reportProblem={reportMaintenanceProblem} addToast={addToast} />}
        {view === "team" && <TeamPage users={users} createUser={createUser} updateUser={updateUser} resetUserPassword={resetUserPassword} addToast={addToast} />}
        {view === "integrations" && <IntegrationsPage apiKeys={apiKeys} setApiKeys={setApiKeys} webhooks={webhooks} setWebhooks={setWebhooks} webhookDeliveries={webhookDeliveries} setWebhookDeliveries={setWebhookDeliveries} bridges={bridges} setBridges={setBridges} printers={printers} setPrinters={setPrinters} addToast={addToast} setBackendStatus={setBackendStatus} />}
        {view === "addons" && <AddonsPage addons={addons} updateAddon={updateAddon} addToast={addToast} costCatalog={costCatalog} saveCostCatalog={saveCostCatalog} />}
        {view === "notifications" && <NotificationsPage notifications={notifications} setNotifications={setNotifications} channels={notificationChannels} setChannels={setNotificationChannels} deliveries={notificationDeliveries} setDeliveries={setNotificationDeliveries} addToast={addToast} />}
        {view === "settings" && <SettingsPage settings={workspaceSettings} setSettings={setWorkspaceSettings} addToast={addToast} setBackendStatus={setBackendStatus} currentUser={currentUser} changeOwnPassword={changeOwnPassword} setupTwoFactor={setupTwoFactor} enableTwoFactor={enableTwoFactor} disableTwoFactor={disableTwoFactor} />}
        <VersionBadge />
      </main>
      {selectedPrinter && <PrinterDrawer printer={selectedPrinter} onClose={() => setSelectedPrinter(null)} api={mockApi} />}
      {modal === "add-printer" && <AddPrinterModal onClose={() => setModal(null)} onAdd={async (printer) => { const created = await createPrinter(printer); setModal(null); addToast(`${created.name} added to printer fleet`); }} />}
      <ToastStack toasts={toasts} />
    </div>
  );
}

function VersionBadge() {
  return <footer className="version-badge"><span>System version</span> <strong data-i18n-ignore>v{APP_VERSION}</strong></footer>;
}

function MarketingSite({ onOpenApp }: { onOpenApp: () => void }) {
  const initialQuoteLookup = () => {
    const params = new URLSearchParams(window.location.search);
    return { id: params.get("quoteId") || "", token: params.get("quoteToken") || "" };
  };
  const [quoteDraft, setQuoteDraft] = useState({ customer: "", email: "", company: "", project: "Prototype enclosure", material: "PLA", quantity: 1, due: "Flexible", budget: 0, fileName: "", notes: "" });
  const [quoteFile, setQuoteFile] = useState<File | null>(null);
  const [quoteStatus, setQuoteStatus] = useState("");
  const [quoteLookup, setQuoteLookup] = useState(initialQuoteLookup);
  const [quoteLookupStatus, setQuoteLookupStatus] = useState("");
  const [quoteLookupResult, setQuoteLookupResult] = useState<PublicQuoteStatus | null>(null);
  const quoteSubmitAttempt = useRef<IdempotencyAttempt | null>(null);
  const quoteDecisionAttempts = useRef<Record<string, IdempotencyAttempt>>({});
  const submitQuote = async () => {
    if (!quoteDraft.customer.trim() || !quoteDraft.email.trim() || !quoteDraft.project.trim()) {
      setQuoteStatus("Please add your name, email, and project.");
      return;
    }
    setQuoteStatus("Sending quote request...");
    try {
      const payload = { ...quoteDraft, quantity: Number(quoteDraft.quantity || 1), budget: Number(quoteDraft.budget || 0), source: "Marketing website" };
      const fingerprint = idempotencyFingerprint({
        ...payload,
        file: quoteFile ? { name: quoteFile.name, size: quoteFile.size, lastModified: quoteFile.lastModified } : null
      });
      quoteSubmitAttempt.current = idempotencyKeyForAttempt(quoteSubmitAttempt.current, "public-quote-intake", fingerprint);
      const body = quoteFile ? new FormData() : JSON.stringify(payload);
      if (quoteFile && body instanceof FormData) {
        Object.entries(payload).forEach(([key, value]) => body.append(key, String(value ?? "")));
        body.append("file", quoteFile, quoteFile.name);
      }
      const response = await fetch(`${API_BASE}/api/public/quoteRequests`, {
        method: "POST",
        headers: {
          ...(quoteFile ? {} : { "Content-Type": "application/json" }),
          "Idempotency-Key": quoteSubmitAttempt.current.key
        },
        body
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Quote request failed");
      const token = result.quoteRequest?.accessToken || "";
      setQuoteStatus(token ? `Quote request ${result.quoteRequest.id} received. Tracking token: ${token}` : `Quote request ${result.quoteRequest.id} received.`);
      setQuoteLookup({ id: result.quoteRequest.id, token });
      setQuoteLookupResult(result.quoteRequest);
      setQuoteDraft({ customer: "", email: "", company: "", project: "Prototype enclosure", material: "PLA", quantity: 1, due: "Flexible", budget: 0, fileName: "", notes: "" });
      setQuoteFile(null);
      quoteSubmitAttempt.current = null;
    } catch {
      setQuoteStatus("Quote request could not be sent. Please contact support@3dstu.com.");
    }
  };
  const checkQuoteStatus = async () => {
    if (!quoteLookup.id.trim() || !quoteLookup.token.trim()) {
      setQuoteLookupStatus("Add the quote request ID and tracking token first.");
      return;
    }
    setQuoteLookupStatus("Checking quote status...");
    try {
      const response = await fetch(`${API_BASE}/api/public/quoteRequests/${encodeURIComponent(quoteLookup.id.trim())}?token=${encodeURIComponent(quoteLookup.token.trim())}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Quote status lookup failed");
      const quote = result.quoteRequest;
      setQuoteLookupResult(quote);
      setQuoteLookupStatus(`${quote.id}: ${quote.status}${quote.quotedValue ? ` - quoted $${quote.quotedValue}` : ""}${quote.validUntil ? ` - valid until ${quote.validUntil}` : ""}${quote.orderId ? ` - order ${quote.orderId}` : ""}`);
    } catch {
      setQuoteLookupStatus("Quote status could not be loaded. Check the ID and tracking token.");
    }
  };
  const decideQuote = async (decision: "accepted" | "rejected" | "revision") => {
    if (!quoteLookup.id.trim() || !quoteLookup.token.trim()) {
      setQuoteLookupStatus("Add the quote request ID and tracking token first.");
      return;
    }
    setQuoteLookupStatus(decision === "accepted" ? "Approving quote..." : decision === "rejected" ? "Rejecting quote..." : "Requesting quote changes...");
    try {
      const payload = { token: quoteLookup.token.trim(), decision, note: decision === "revision" ? "Customer requested changes from the quote portal." : "" };
      const attemptId = `${quoteLookup.id.trim()}:${decision}`;
      quoteDecisionAttempts.current[attemptId] = idempotencyKeyForAttempt(
        quoteDecisionAttempts.current[attemptId] || null,
        "public-quote-decision",
        idempotencyFingerprint({ quoteId: quoteLookup.id.trim(), ...payload })
      );
      const response = await fetch(`${API_BASE}/api/public/quoteRequests/${encodeURIComponent(quoteLookup.id.trim())}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": quoteDecisionAttempts.current[attemptId].key },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Quote decision failed");
      setQuoteLookupResult(result.quoteRequest);
      setQuoteLookupStatus(decision === "accepted" ? `${result.quoteRequest.id}: approved and converted to ${result.order?.id || "an order"}.` : decision === "revision" ? `${result.quoteRequest.id}: changes requested. The operator will review it again.` : `${result.quoteRequest.id}: rejected.`);
      delete quoteDecisionAttempts.current[attemptId];
    } catch {
      setQuoteLookupStatus("Quote decision could not be saved. Check the ID and tracking token.");
    }
  };
  useEffect(() => {
    if (quoteLookup.id && quoteLookup.token) void checkQuoteStatus();
  }, []);
  const metrics = [
    ["Today\'s queue", "48", "jobs structured by status, material, and due risk"],
    ["Printer states", "6", "idle, printing, paused, offline, error, maintenance"],
    ["Operator todos", "12", "generated from production state instead of manual reminders"],
    ["Deployment track", "24/7", "Docker, HTTPS, backups, health checks, and audit logs"]
  ];
  const workflow = [
    ["Intake", "Bring in manual, CSV, webhook, or commerce orders and turn them into structured production jobs."],
    ["Validate", "Check model files, material needs, print volume, slicing state, and quote assumptions before the job reaches a machine."],
    ["Schedule", "Drag jobs onto printers or run automated matching with material, color, nozzle, capacity, and due-date constraints."],
    ["Produce", "Track printer state, operator actions, file versions, maintenance, alerts, and exception todos in one control layer."],
    ["Close the loop", "Archive job history, reprint from previous work, export reports, restore backups, and keep customer operations traceable."]
  ];
  const capabilities = [
    ["Queue intelligence", "Status-driven jobs, rush flags, due windows, commerce imports, CSV intake, SKU mapping, and reprint history."],
    ["Scheduling engine", "Drag-and-drop planning, dry-run matching, material conflicts, volume checks, due-risk warnings, and load balancing."],
    ["File operations", "STL, 3MF, and G-code uploads, model metadata, generated thumbnails, stored versions, slicer profiles, and G-code outputs."],
    ["Fleet control", "Printer states, bridge configs, OctoPrint/Moonraker-style sync, API actions, telemetry, and maintenance workflows."],
    ["Team execution", "Role permissions, automatic todos, 2FA, audit logs, notifications, webhooks, Slack, Discord, and email channels."],
    ["Business layer", "Cost catalog, storage usage, billing hooks, quote assumptions, backups, restore previews, and customer-ready deployment."]
  ];
  const audiences = ["Print farms", "Service bureaus", "Makerspaces", "School labs", "Factory prototyping teams"];
  const installSteps = [
    ["Clone", "git clone the repository and copy .env.example to .env."],
    ["Configure", "Set admin credentials, public URL, worker token, metrics token, and production security flags."],
    ["Deploy", "Start Docker Compose or run the Ubuntu deployment scripts for Nginx, HTTPS, backups, and ops checks."],
    ["Verify", "Run QC, readiness, smoke checks, backup drills, and then push the versioned release to GitHub."]
  ];
  const competitorSignals = [
    ["FDM Monster", "Multi-protocol printer connectors, batch printing, grid-based printer layout, backups, and thumbnails."],
    ["OctoFarm", "Single-pane monitoring for many OctoPrint instances and websocket-driven farm status."],
    ["Spoolman", "Filament inventory, spool usage tracking, and automatic weight deduction through Klipper/Moonraker-style integrations."],
    ["Obico and PrintWatch", "AI failure detection, camera-driven monitoring, anomaly alerts, and remote printer visibility."],
    ["FilaOps, LayerlyOS, Daedalus, runsodin, PrintStream", "ERP/MRP depth, no-cloud MES/SCADA positioning, profitability analytics, PWA, shared libraries, and plugin systems."]
  ];
  const buildPriorities = [
    ["Printer bridge hardening", "Connector test harnesses for OctoPrint, Moonraker/Klipper, PrusaLink, Bambu LAN, Creality, and Snapmaker-style devices."],
    ["Material automation", "Reserve spools for scheduled work, deduct usage from completed prints, and warn before a job runs out of material."],
    ["Failure and waste intelligence", "Track failed prints, wasted filament, root causes, reprint cost, and printer-specific reliability trends."],
    ["File and preview depth", "Add richer STL/3MF previews, G-code visualization, slicing presets, and reusable production templates."]
  ];
  return (
    <div className="marketing-site" data-i18n-ignore>
      <header className="marketing-nav">
        <a className="brand-lockup" href="#top" aria-label="3DSTU FarmFlow home"><Layers /><span>3DSTU FarmFlow</span></a>
        <nav className="marketing-links" aria-label="Website sections">
          <a href="#platform">Platform</a>
          <a href="#workflow">Workflow</a>
          <a href="#operations">Operations</a>
          <a href="#docs">Docs</a>
          <a href="#github">GitHub</a>
          <a href="#roadmap">Roadmap</a>
          <a href="#quote">Quote</a>
          <a href="#support">Support</a>
        </nav>
        <div className="marketing-nav-actions">
          <a href="https://github.com/iain0901/3D-Printing-Farm-System" target="_blank" rel="noreferrer">GitHub</a>
          <button onClick={onOpenApp}>Open App</button>
        </div>
      </header>

      <main id="top">
        <section className="marketing-hero">
          <div className="marketing-hero-media" aria-hidden="true"></div>
          <div className="marketing-hero-shade" aria-hidden="true"></div>
          <div className="marketing-hero-content">
            <p className="eyebrow">3D printing farm operating system</p>
            <h1>Production control for serious 3D printing teams.</h1>
            <p>3DSTU FarmFlow connects orders, files, materials, printers, operators, alerts, and backups into one deployable SaaS platform for real print-farm operations.</p>
            <div className="marketing-actions">
              <button className="primary" onClick={onOpenApp}>Open App</button>
              <a className="ghost-link" href="mailto:support@3dstu.com">Talk to 3DSTU</a>
            </div>
          </div>
          <div className="marketing-hero-strip">
            {metrics.map(([label, value, detail]) => <article key={label}><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>)}
          </div>
        </section>

        <section className="audience-strip" aria-label="Designed for">
          <span>Built for</span>
          {audiences.map((audience) => <b key={audience}>{audience}</b>)}
        </section>

        <section className="marketing-section platform-section" id="platform">
          <div className="section-kicker">
            <p className="eyebrow">Why it exists</p>
            <h2>A print farm does not need another task list. It needs an operating layer.</h2>
          </div>
          <div className="platform-grid">
            <article>
              <h3>From order chaos to machine-ready work</h3>
              <p>Every job carries the production facts that matter: model file, material, color, nozzle, build volume, due date, slicing state, operator owner, printer match, and exception history.</p>
            </article>
            <article>
              <h3>Humans handle exceptions, not repetitive tracking</h3>
              <p>Todos are generated when state changes: slicing needed, scheduling needed, material mismatch, maintenance risk, completion pickup, post-processing, or late-work escalation.</p>
            </article>
            <article>
              <h3>Deployment is part of the product</h3>
              <p>The repo includes Docker deployment, Nginx and HTTPS guidance, health checks, backups, restore preview, audit trails, and support paths for customer farms.</p>
            </article>
          </div>
        </section>

        <section className="workflow-section" id="workflow">
          <div className="workflow-copy">
            <p className="eyebrow">Operating workflow</p>
            <h2>One flow from intake to completed print.</h2>
            <p>FarmFlow is designed around the production decisions that cost time when they live in chat, spreadsheets, slicer notes, and memory.</p>
          </div>
          <div className="workflow-steps">
            {workflow.map(([title, body], index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{body}</p></article>)}
          </div>
        </section>

        <section className="marketing-section capability-section">
          <div className="section-kicker">
            <p className="eyebrow">Platform depth</p>
            <h2>Built around the real constraints of printers, people, files, and delivery promises.</h2>
          </div>
          <div className="capability-grid">
            {capabilities.map(([title, body]) => <article key={title}><h3>{title}</h3><p>{body}</p></article>)}
          </div>
        </section>

        <section className="operations-section" id="operations">
          <div className="operations-image">
            <img src="/marketing/farmflow-scheduling-workspace.webp" alt="3D printing production scheduling workspace" />
          </div>
          <div className="operations-copy">
            <p className="eyebrow">Production cockpit</p>
            <h2>See the work that needs attention before it becomes expensive.</h2>
            <ul>
              <li>Which jobs are due today, late, blocked, or waiting for slicing.</li>
              <li>Which printers are idle, printing, paused, offline, in error, or under maintenance.</li>
              <li>Which material changes, build-volume conflicts, or due-date risks need a person.</li>
              <li>Which operators have actionable work generated from the production state.</li>
            </ul>
          </div>
        </section>

        <section className="marketing-section customer-section">
          <p className="eyebrow">3DSTU customer model</p>
          <h2>Free for 3DSTU farm customers, source-available with commercial-use boundaries.</h2>
          <div className="customer-grid">
            <article><h3>Use it to run your farm</h3><p>Customers can self-host, operate production, and earn from their own printing services.</p></article>
            <article><h3>Protect the platform</h3><p>The license does not allow selling the script, modified source, clones, or hosted resale services.</p></article>
            <article><h3>Get expert setup</h3><p>Professional installation, technical setup, and training are available from 3DSTU.</p></article>
          </div>
        </section>

        <section className="project-section" id="github">
          <div className="project-copy">
            <p className="eyebrow">Project home</p>
            <h2>GitHub repository</h2>
            <p>Source, releases, deployment scripts, issue tracking, and project documentation live in the public repository.</p>
            <div className="project-actions">
              <a className="primary-link" href="https://github.com/iain0901/3D-Printing-Farm-System" target="_blank" rel="noreferrer">Open GitHub</a>
              <a href="https://github.com/iain0901/3D-Printing-Farm-System/tree/main/docs" target="_blank" rel="noreferrer">Docs in repository</a>
            </div>
          </div>
          <div className="repo-card">
            <span>Current version</span><strong data-i18n-ignore>{APP_VERSION}</strong>
            <span>Public deployment</span><strong data-i18n-ignore>farm-saas.3dstu.com</strong>
            <span>Production domain</span><strong data-i18n-ignore>github.com/iain0901/3D-Printing-Farm-System</strong>
          </div>
        </section>

        <section className="marketing-section docs-section" id="docs">
          <div className="section-kicker">
            <p className="eyebrow">Documentation and install path</p>
            <h2>Run it locally, deploy it with Docker, or operate it behind Nginx and HTTPS on Ubuntu.</h2>
          </div>
          <div className="install-steps">
            {installSteps.map(([title, body], index) => <article key={title}><span>{index + 1}</span><h3>{title}</h3><p>{body}</p></article>)}
          </div>
          <div className="doc-links">
            <a href="https://github.com/iain0901/3D-Printing-Farm-System/blob/main/docs/INSTALL.md" target="_blank" rel="noreferrer">View install guide</a>
            <a href="https://github.com/iain0901/3D-Printing-Farm-System/blob/main/docs/OPERATIONS.md" target="_blank" rel="noreferrer">View operations runbook</a>
            <a href="https://github.com/iain0901/3D-Printing-Farm-System/blob/main/docs/ROADMAP.md" target="_blank" rel="noreferrer">Roadmap document</a>
          </div>
        </section>

        <section className="marketing-section roadmap-section" id="roadmap">
          <div className="section-kicker">
            <p className="eyebrow">Competitive roadmap</p>
            <h2>What we are absorbing from the print-farm ecosystem.</h2>
          </div>
          <div className="signal-grid">
            {competitorSignals.map(([title, body]) => <article key={title}><h3>{title}</h3><p>{body}</p></article>)}
          </div>
          <div className="section-kicker priority-kicker">
            <p className="eyebrow">Next build priorities</p>
            <h2>From MVP shell toward production-grade operations.</h2>
          </div>
          <div className="priority-list">
            {buildPriorities.map(([title, body]) => <article key={title}><h3>{title}</h3><p>{body}</p></article>)}
          </div>
        </section>

        <section className="marketing-section quote-section" id="quote">
          <div className="section-kicker">
            <p className="eyebrow">Customer quote intake</p>
            <h2>Send print requirements into the production pipeline.</h2>
          </div>
          <div className="quote-form">
            <label>Name<input value={quoteDraft.customer} onChange={(event) => setQuoteDraft((draft) => ({ ...draft, customer: event.target.value }))} /></label>
            <label>Email<input type="email" value={quoteDraft.email} onChange={(event) => setQuoteDraft((draft) => ({ ...draft, email: event.target.value }))} /></label>
            <label>Company<input value={quoteDraft.company} onChange={(event) => setQuoteDraft((draft) => ({ ...draft, company: event.target.value }))} /></label>
            <label>Project<input value={quoteDraft.project} onChange={(event) => setQuoteDraft((draft) => ({ ...draft, project: event.target.value }))} /></label>
            <label>Material<select value={quoteDraft.material} onChange={(event) => setQuoteDraft((draft) => ({ ...draft, material: event.target.value }))}>{["PLA", "PETG", "ASA", "TPU", "Resin"].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Quantity<input type="number" min="1" value={quoteDraft.quantity} onChange={(event) => setQuoteDraft((draft) => ({ ...draft, quantity: Number(event.target.value) }))} /></label>
            <label>Due date<input value={quoteDraft.due} onChange={(event) => setQuoteDraft((draft) => ({ ...draft, due: event.target.value }))} /></label>
            <label>Budget<input type="number" min="0" value={quoteDraft.budget} onChange={(event) => setQuoteDraft((draft) => ({ ...draft, budget: Number(event.target.value) }))} /></label>
            <label>File name<input value={quoteDraft.fileName} onChange={(event) => setQuoteDraft((draft) => ({ ...draft, fileName: event.target.value }))} placeholder="model.stl / model.3mf" /></label>
            <label className="wide">Notes<textarea value={quoteDraft.notes} onChange={(event) => setQuoteDraft((draft) => ({ ...draft, notes: event.target.value }))} /></label>
            <label className="wide">Model file<input type="file" accept=".stl,.3mf,.gcode,.obj" onChange={(event) => setQuoteFile(event.currentTarget.files?.[0] || null)} /></label>
            <button className="primary wide" onClick={submitQuote}>Request quote</button>
            {quoteFile && <p className="quote-status wide">Attached: {quoteFile.name} ({Math.round(quoteFile.size / 1024)} KB)</p>}
            {quoteStatus && <p className="quote-status wide">{quoteStatus}</p>}
          </div>
          <div className="quote-form quote-lookup">
            <div className="wide">
              <p className="eyebrow">Quote status lookup</p>
              <p className="muted">Save the returned tracking token to check quote status after the operator reviews it.</p>
            </div>
            <label>Quote request ID<input value={quoteLookup.id} onChange={(event) => setQuoteLookup((draft) => ({ ...draft, id: event.target.value }))} placeholder="qr-..." /></label>
            <label>Tracking token<input value={quoteLookup.token} onChange={(event) => setQuoteLookup((draft) => ({ ...draft, token: event.target.value }))} /></label>
            <button className="primary" onClick={checkQuoteStatus}>Check status</button>
            {quoteLookupResult?.validUntil && <p className="quote-status wide">Quote valid until {quoteLookupResult.validUntil}</p>}
            {quoteLookupResult?.status === "quoted" && <div className="quote-actions wide"><button className="primary" onClick={() => decideQuote("accepted")}>Approve quote</button><button onClick={() => decideQuote("revision")}>Request changes</button><button onClick={() => decideQuote("rejected")}>Reject quote</button></div>}
            {quoteLookupStatus && <p className="quote-status wide">{quoteLookupStatus}</p>}
          </div>
        </section>

        <section className="marketing-contact" id="support">
          <div>
            <p className="eyebrow">Professional setup available</p>
            <h2>Need installation, training, custom integration, or technical support?</h2>
            <p>Contact the 3DSTU team for deployment support, farm onboarding, connector planning, and production workflow design.</p>
          </div>
          <div className="contact-actions">
            <a href="mailto:support@3dstu.com">support@3dstu.com</a>
            <button onClick={onOpenApp}>Open App</button>
          </div>
        </section>
      </main>
      <VersionBadge />
    </div>
  );
}

function AuthScreen({ onLogin, language, setLanguage }: { onLogin: (payload: { email: string; password: string; mode: "login" | "signup"; name?: string; workspace?: string; twoFactorCode?: string }) => Promise<string>; language: Language; setLanguage: (language: Language) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("demo@layerpilot.test");
  const [password, setPassword] = useState("layerpilot");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
  const [name, setName] = useState("Demo Operator");
  const [workspace, setWorkspace] = useState("North Campus Lab");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const steps = ["Profile", "Workspace", "Mock printer", "Done"];
  const submit = async () => {
    setBusy(true);
    setError("");
    const nextError = await onLogin({ email, password, mode, name, workspace, twoFactorCode: needsTwoFactor ? twoFactorCode : undefined });
    setNeedsTwoFactor(nextError.toLowerCase().includes("two-factor"));
    setError(nextError);
    setBusy(false);
  };
  return (
    <div className="auth-page">
      <section className="auth-visual">
        <div className="brand-lockup"><Layers /><span>3DSTU FarmFlow</span></div>
        <h1>Run a smarter print lab from one cockpit.</h1>
        <p>Original cloud management for printers, jobs, materials, teams, and automations.</p>
        <p className="support-note">Professional setup and technical support: <a href="mailto:support@3dstu.com">support@3dstu.com</a></p>
        <div className="machine-wall">
          {initialPrinters.slice(0, 4).map((p) => <PrinterMini key={p.id} printer={p} />)}
        </div>
      </section>
      <section className="auth-panel">
        <div className="segmented">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Sign in</button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>Create account</button>
        </div>
        <h2>{mode === "login" ? "Welcome back" : "Start a workspace"}</h2>
        {mode === "signup" && <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>}
        <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {needsTwoFactor && <label>Two-factor code<input inputMode="numeric" value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value)} placeholder="123456 or recovery code" /></label>}
        {mode === "signup" && <label>Workspace name<input value={workspace} onChange={(event) => setWorkspace(event.target.value)} /></label>}
        {error && <div className="notice error"><AlertTriangle size={18} /><span>{error}</span></div>}
        <button className="primary wide" onClick={submit} disabled={busy}>{busy ? "Signing in..." : mode === "login" ? "Demo Login" : "Create demo workspace"}</button>
        <LanguageSwitcher language={language} setLanguage={setLanguage} />
        <div className="onboarding">
          <div className="step-line">{steps.map((name, index) => <button key={name} className={index <= step ? "done" : ""} onClick={() => setStep(index)}>{index < step ? <Check size={14} /> : index + 1}<span>{name}</span></button>)}</div>
          <p>{step === 0 ? "Choose role and preferred units." : step === 1 ? "Create locations for lab, farm, or classrooms." : step === 2 ? "Connect a mock bridge now, real hardware later." : "Workspace is ready for the app dashboard."}</p>
        </div>
      </section>
    </div>
  );
}

function Sidebar({ view, setView, mobileNav, setMobileNav, hotDropMode, setHotDropMode, onHotDrop }: { view: View; setView: (v: View) => void; mobileNav: boolean; setMobileNav: (v: boolean) => void; hotDropMode: HotDropMode; setHotDropMode: (mode: HotDropMode) => void; onHotDrop: () => void }) {
  const items: [View, string, typeof Home][] = [
    ["dashboard", "Dashboard", Home],
    ["printers", "Printers", Box],
    ["products", "Products", Package],
    ["orders", "Orders", ShoppingBag],
    ["files", "Files", Archive],
    ["queue", "Print Queue", ClipboardList],
    ["scheduler", "Scheduler", CalendarClock],
    ["todos", "Auto Todos", ListChecks],
    ["slicer", "Cloud Slicer", Wand2],
    ["filament", "Filament", CircleDot],
    ["profiles", "Profiles", SlidersHorizontal],
    ["analytics", "Analytics", Gauge],
    ["history", "History", ListChecks],
    ["maintenance", "Maintenance", CalendarClock],
    ["team", "Team", Users],
    ["integrations", "Integrations", Code2],
    ["addons", "Add-ons", Store],
    ["notifications", "Notifications", Bell],
    ["settings", "Settings", Settings]
  ];
  return (
    <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
      <div className="brand-lockup small"><Layers /><span>3DSTU FarmFlow</span></div>
      <nav>
        {items.map(([id, label, Icon]) => (
          <button key={id} className={view === id ? "active" : ""} onClick={() => { setView(id); setMobileNav(false); }}>
            <Icon size={18} /><span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="hot-drop">
        <b>Hot Drop</b>
        <select value={hotDropMode} onChange={(event) => setHotDropMode(event.target.value as HotDropMode)}>
          <option>Upload Only</option>
          <option>Direct Print</option>
          <option>Auto-Queue</option>
        </select>
        <button onClick={onHotDrop}><Upload size={15} />Run hot drop</button>
      </div>
      <div className="plan-tile">
        <Sparkles size={18} />
        <b>Print Farm Trial</b>
        <span>14 days left in mock billing.</span>
      </div>
    </aside>
  );
}

function LanguageSwitcher({ language, setLanguage, compact = false }: { language: Language; setLanguage: (language: Language) => void; compact?: boolean }) {
  return (
    <label className={`language-switcher ${compact ? "compact" : ""}`} data-i18n-ignore>
      <span>{language === "zh-TW" ? "語言" : language === "zh-CN" ? "语言" : "Language"}</span>
      <select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={language === "zh-TW" ? "語言" : language === "zh-CN" ? "语言" : "Language"}>
        <option value="en">English</option>
        <option value="zh-TW">繁體中文</option>
        <option value="zh-CN">简体中文</option>
      </select>
    </label>
  );
}

function Topbar({ setMobileNav, setView, notifications, onLogout, language, setLanguage, backendStatus }: { setMobileNav: (v: boolean) => void; setView: (v: View) => void; notifications: number; onLogout: () => void; language: Language; setLanguage: (language: Language) => void; backendStatus: "local" | "connected" }) {
  return (
    <header className="topbar">
      <button className="icon mobile-only" onClick={() => setMobileNav(true)} title="Open navigation"><Menu size={20} /></button>
      <div className="searchbox"><Search size={16} /><input placeholder="Search printers, files, spools, jobs" /></div>
      <div className="top-actions">
        <span className={`backend-badge ${backendStatus}`}>{backendStatus === "connected" ? "Backend Live" : "Local Demo"}</span>
        <LanguageSwitcher language={language} setLanguage={setLanguage} compact />
        <button className="ghost" onClick={() => setView("notifications")}><Bell size={16} />{notifications}</button>
        <button className="ghost" onClick={onLogout}><LogOut size={16} />Logout</button>
      </div>
    </header>
  );
}

function Dashboard({ metrics, printers, queue, setView, setModal, onPrinter }: { metrics: Record<string, number>; printers: Printer[]; queue: QueueItem[]; setView: (v: View) => void; setModal: (v: string) => void; onPrinter: (p: Printer) => void }) {
  const todos = deriveTodos(queue, printers);
  const dueSoon = queue.filter(dueRisk);
  const idlePrinters = printers.filter((printer) => printer.status === "idle");
  const problemPrinters = printers.filter((printer) => printer.status === "error" || printer.status === "offline" || printer.status === "maintenance");
  return (
    <Page title="Production cockpit" kicker="Today tasks, printer readiness, exceptions, and next human actions">
      <div className="quickbar">
        <button className="primary" onClick={() => setModal("add-printer")}><Plus size={16} />Add printer</button>
        <button onClick={() => setView("files")}><Upload size={16} />Upload file</button>
        <button onClick={() => setView("scheduler")}><CalendarClock size={16} />Open scheduler</button>
        <button onClick={() => setView("todos")}><ListChecks size={16} />Review todos</button>
      </div>
      <div className="metric-grid">
        <Metric label="Today tasks" value={`${queue.length}`} icon={ClipboardList} />
        <Metric label="Due risk" value={`${dueSoon.length}`} icon={AlertTriangle} tone={dueSoon.length ? "red" : "green"} />
        <Metric label="Idle printers" value={`${idlePrinters.length}`} icon={Box} tone="green" />
        <Metric label="Printer issues" value={`${problemPrinters.length}`} icon={HardDrive} tone={problemPrinters.length ? "red" : "green"} />
        <Metric label="Human todos" value={`${todos.length}`} icon={ListChecks} tone="orange" />
      </div>
      <div className="split">
        <section className="panel">
          <PanelTitle title="Device status" action={<button className="text-button" onClick={() => setView("printers")}>All printers <ChevronRight size={14} /></button>} />
          <div className="printer-grid compact">
            {printers.map((printer) => <PrinterCard key={printer.id} printer={printer} onClick={() => onPrinter(printer)} />)}
          </div>
        </section>
        <section className="panel">
          <PanelTitle title="Tasks near due" action={<button className="text-button" onClick={() => setView("scheduler")}>Schedule <ChevronRight size={14} /></button>} />
          <div className="event-feed">
            {dueSoon.map((job) => <div key={job.id}><StatusDot status={job.status} /><span>{job.file}</span><em>{job.due} - {job.priority}</em></div>)}
            {!dueSoon.length && <div><StatusDot status="complete" /><span>No urgent due risk right now</span><em>Keep production moving</em></div>}
          </div>
        </section>
      </div>
      <div className="split">
        <section className="panel">
          <PanelTitle title="Auto-generated todos" action={<button className="text-button" onClick={() => setView("todos")}>Open todos <ChevronRight size={14} /></button>} />
          <div className="event-feed">{todos.slice(0, 6).map((todo) => <div key={todo.id}><StatusDot status={todo.severity === "Urgent" || todo.severity === "High" ? "failed" : "queued"} /><span>{todo.title}</span><em>{todo.owner} - {todo.due}</em></div>)}</div>
        </section>
        <section className="panel">
          <PanelTitle title="Production progress" />
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Area type="monotone" dataKey="hours" stroke="#2563eb" fill="#bfdbfe" />
              <Area type="monotone" dataKey="jobs" stroke="#14b8a6" fill="#ccfbf1" />
            </AreaChart>
          </ResponsiveContainer>
        </section>
      </div>
    </Page>
  );
}

function PrintersPage({ printers, onPrinter, setModal, api }: { printers: Printer[]; onPrinter: (p: Printer) => void; setModal: (v: string) => void; api: { controlPrinter: (id: string, action: string) => void } }) {
  const [mode, setMode] = useState<"cards" | "table">("cards");
  return (
    <Page title="Printers" kicker="Control, monitor, and route jobs">
      <div className="quickbar">
        <button className="primary" onClick={() => setModal("add-printer")}><Plus size={16} />Add printer</button>
        <button className={mode === "cards" ? "selected" : ""} onClick={() => setMode("cards")}>Cards</button>
        <button className={mode === "table" ? "selected" : ""} onClick={() => setMode("table")}>Table</button>
      </div>
      {mode === "cards" ? (
        <div className="printer-grid">{printers.map((printer) => <PrinterCard key={printer.id} printer={printer} onClick={() => onPrinter(printer)} />)}</div>
      ) : (
        <DataTable headers={["Name", "Model", "Status", "Temp", "Job", "Actions"]}>
          {printers.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.model}</td><td><StatusPill status={p.status} /></td><td>{p.nozzle}/{p.targetNozzle}C - {p.bed}/{p.targetBed}C</td><td>{p.job || "Idle"}</td><td><button onClick={() => onPrinter(p)}>Open</button><button onClick={() => api.controlPrinter(p.id, p.status === "printing" ? "pause" : "start")}>{p.status === "printing" ? "Pause" : "Start"}</button></td></tr>)}
        </DataTable>
      )}
    </Page>
  );
}

function ProductsPage({ parts, skus, productionTemplates, files, createPart, createSku, createProductionTemplate, runProductionTemplate, generateNameplate, exportCatalog, mapMaterials, addToast }: { parts: Part[]; skus: SKU[]; productionTemplates: ProductionTemplate[]; files: PrintFile[]; createPart: (part: Omit<Part, "id">) => Promise<Part>; createSku: (sku: Omit<SKU, "id">) => Promise<SKU>; createProductionTemplate: (template: Omit<ProductionTemplate, "id">) => Promise<ProductionTemplate>; runProductionTemplate: (template: ProductionTemplate, options?: { quantity?: number; dryRun?: boolean }) => Promise<ProductionTemplateRunResult>; generateNameplate: (draft: ParametricNameplateDraft) => Promise<ParametricNameplateResult>; exportCatalog: () => Promise<CatalogExportResult>; mapMaterials: () => Promise<MaterialMapResult>; addToast: (message: string, type?: Toast["type"]) => void }) {
  const [tab, setTab] = useState<"parts" | "skus" | "templates" | "builder">("parts");
  const [nameplate, setNameplate] = useState<ParametricNameplateDraft>({ text: "3DSTU FarmFlow", width: 120, height: 42, thickness: 3, material: "PLA", feature: "keyholes", createPart: true });
  const [generated, setGenerated] = useState<ParametricNameplateResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [mapping, setMapping] = useState<MaterialMapResult | null>(null);
  const [mappingBusy, setMappingBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState("");
  const addPart = async () => {
    const file = files.find((item) => item.type !== "GCODE") || files[0];
    await createPart({ name: "Hot-swappable jig", fileId: file.id, material: "Any PLA", process: "0.20mm Production", plates: 1, variants: ["Text", "Color"], status: "draft" });
    addToast("Part created from file library");
  };
  const addSku = async () => {
    const linkedPart = parts.find((part) => part.name === "Parametric name plate") || parts[0];
    await createSku({ sku: `CUSTOM-${String(skus.length + 1).padStart(3, "0")}`, title: "Parametric Name Plate", parts: [linkedPart.name], variants: ["Text", "Size"], price: 520, stock: 0, channel: "Manual" });
    addToast("SKU assembled from linked parts");
  };
  const renderNameplate = async () => {
    setGenerating(true);
    const result = await generateNameplate(nameplate);
    setGenerated(result);
    setGenerating(false);
    addToast(`${result.file.name} generated as STL`, "success");
  };
  const downloadCatalog = async () => {
    setExporting(true);
    const result = await exportCatalog();
    setExporting(false);
    addToast(`${result.rows.length} SKU catalog rows exported`, "success");
  };
  const runMaterialMap = async () => {
    setMappingBusy(true);
    const result = await mapMaterials();
    setMapping(result);
    setMappingBusy(false);
    addToast(`${result.changed} material labels normalized`, result.unmapped ? "warning" : "success");
  };
  const saveTemplate = async () => {
    const file = files.find((item) => item.status === "approved" || item.sliced) || files[0];
    if (!file) return addToast("Upload a model file before saving a template", "warning");
    const sku = skus[0];
    setTemplateBusy("save");
    const created = await createProductionTemplate({
      name: `${file.name.replace(/\.[^.]+$/, "")} production`,
      sku: sku?.sku || "",
      fileId: file.id,
      material: file.material || "PLA",
      color: "Any",
      priority: "Normal",
      stage: file.sliced ? "needs scheduling" : "needs slicing",
      printerId: "",
      process: "0.20mm Production",
      dueOffsetDays: 2,
      quantity: 1,
      time: file.printTime || "1h 00m",
      cost: file.cost || 0,
      notes: "Reusable production recipe"
    });
    setTemplateBusy("");
    addToast(`${created.name} saved as a production template`);
  };
  const runTemplate = async (template: ProductionTemplate, dryRun = false) => {
    setTemplateBusy(`${dryRun ? "dry" : "run"}-${template.id}`);
    const result = await runProductionTemplate(template, { dryRun, quantity: template.quantity });
    setTemplateBusy("");
    addToast(dryRun ? `${result.jobs.length} jobs checked from ${template.name}` : `${result.jobs.length} jobs added from ${template.name}`, dryRun ? "info" : "success");
  };
  return (
    <Page title="Products" kicker="Parts, SKUs, variants, and parametric production">
      <div className="quickbar">
        <button className={tab === "parts" ? "selected" : ""} onClick={() => setTab("parts")}><Package size={16} />Parts</button>
        <button className={tab === "skus" ? "selected" : ""} onClick={() => setTab("skus")}><Tag size={16} />SKUs</button>
        <button className={tab === "templates" ? "selected" : ""} onClick={() => setTab("templates")}><Archive size={16} />Templates</button>
        <button className={tab === "builder" ? "selected" : ""} onClick={() => setTab("builder")}><Wand2 size={16} />Parametric builder</button>
      </div>
      {tab === "parts" && (
        <>
          <div className="quickbar"><button className="primary" onClick={addPart}><Plus size={16} />Create part</button><button onClick={runMaterialMap} disabled={mappingBusy}>{mappingBusy ? "Mapping materials" : "Map materials"}</button></div>
          {mapping && <div className={`notice ${mapping.unmapped ? "warning" : "success"}`}><Check size={18} /><span>{mapping.changed} labels normalized, {mapping.mappings.length} aliases saved, {mapping.unmapped} unmapped.</span></div>}
          <DataTable headers={["Part", "Material", "Process profile", "Plates", "Variants", "Status"]}>
            {parts.map((part) => <tr key={part.id}><td><b>{part.name}</b><small>Linked file: {files.find((file) => file.id === part.fileId)?.name || part.fileId}</small></td><td>{part.material}</td><td>{part.process}</td><td>{part.plates}</td><td>{part.variants.join(", ")}</td><td><StatusPill status={part.status} /></td></tr>)}
          </DataTable>
        </>
      )}
      {tab === "skus" && (
        <>
          <div className="quickbar"><button className="primary" onClick={addSku}><Plus size={16} />New SKU</button><button onClick={downloadCatalog} disabled={exporting}><Download size={16} />{exporting ? "Exporting catalog" : "Export catalog"}</button></div>
          <DataTable headers={["SKU", "Product", "Linked parts", "Variants", "Channel", "Stock", "Price"]}>
            {skus.map((sku) => <tr key={sku.id}><td><code>{sku.sku}</code></td><td><b>{sku.title}</b></td><td>{sku.parts.join(", ")}</td><td>{sku.variants.join(", ")}</td><td>{sku.channel}</td><td>{sku.stock}</td><td>${sku.price}</td></tr>)}
          </DataTable>
        </>
      )}
      {tab === "templates" && (
        <>
          <div className="quickbar"><button className="primary" onClick={saveTemplate} disabled={templateBusy === "save"}><Save size={16} />{templateBusy === "save" ? "Saving template" : "Save template"}</button></div>
          <div className="template-grid">
            {productionTemplates.map((template) => {
              const file = files.find((item) => item.id === template.fileId);
              const busyRun = templateBusy === `run-${template.id}`;
              const busyDry = templateBusy === `dry-${template.id}`;
              return (
                <article className="template-card" key={template.id}>
                  <div>
                    <span>{template.sku || "Manual recipe"}</span>
                    <h3>{template.name}</h3>
                    <p>{file?.name || template.fileId}</p>
                  </div>
                  <div className="template-meta">
                    <span><b>{template.quantity}</b> jobs</span>
                    <span>{template.material} / {template.color}</span>
                    <span>Due +{template.dueOffsetDays}d</span>
                    <span>{template.time}</span>
                  </div>
                  <div className="template-actions">
                    <button onClick={() => runTemplate(template, true)} disabled={busyDry || busyRun}>{busyDry ? "Checking" : "Dry run"}</button>
                    <button className="primary" onClick={() => runTemplate(template)} disabled={busyDry || busyRun}>{busyRun ? "Creating" : "Create jobs"}</button>
                  </div>
                  <small>{template.runCount || 0} jobs created{template.lastRunAt ? ` - last run ${template.lastRunAt.slice(0, 10)}` : ""}</small>
                </article>
              );
            })}
            {!productionTemplates.length && <section className="panel empty-state"><Archive size={26} /><h3>No production templates yet</h3><p>Save a reusable recipe from the file library, then run it into the print queue whenever a customer or stock batch repeats.</p></section>}
          </div>
        </>
      )}
      {tab === "builder" && (
        <div className="slicer-layout">
          <section className="panel">
            <PanelTitle title="Dynamic model parameters" />
            <label>Engraved text<input value={nameplate.text} onChange={(event) => setNameplate((draft) => ({ ...draft, text: event.target.value }))} /></label>
            <div className="settings-grid">
              <label>Width mm<input type="number" value={nameplate.width} onChange={(event) => setNameplate((draft) => ({ ...draft, width: Number(event.target.value) }))} /></label>
              <label>Height mm<input type="number" value={nameplate.height} onChange={(event) => setNameplate((draft) => ({ ...draft, height: Number(event.target.value) }))} /></label>
              <label>Thickness mm<input type="number" value={nameplate.thickness} onChange={(event) => setNameplate((draft) => ({ ...draft, thickness: Number(event.target.value) }))} /></label>
            </div>
            <label>Material<select value={nameplate.material} onChange={(event) => setNameplate((draft) => ({ ...draft, material: event.target.value }))}>{["PLA", "PETG", "ASA", "TPU", "Resin"].map((material) => <option key={material}>{material}</option>)}</select></label>
            <label>Feature toggles<select value={nameplate.feature} onChange={(event) => setNameplate((draft) => ({ ...draft, feature: event.target.value as ParametricNameplateDraft["feature"] }))}><option value="keyholes">Keyholes</option><option value="magnet pockets">Magnet pockets</option><option value="plain plate">Plain plate</option></select></label>
            <label className="check-row"><input type="checkbox" checked={nameplate.createPart} onChange={(event) => setNameplate((draft) => ({ ...draft, createPart: event.target.checked }))} />Create linked production part</label>
            <button className="primary wide" onClick={renderNameplate} disabled={generating}><Wand2 size={16} />{generating ? "Generating STL" : "Generate STL part"}</button>
            {generated && <div className="notice success"><Check size={18} /><span>{generated.file.name} - {generated.file.printTime} - ${generated.file.cost}</span></div>}
          </section>
          <section className="panel preview-bed">
            <PanelTitle title="Generated preview" />
            <div className="parametric-preview" style={{ aspectRatio: `${nameplate.width} / ${nameplate.height}` }}><span>{nameplate.text}</span></div>
            <p className="muted">{generated ? `${generated.stlBytes} STL bytes stored, ${generated.estimates.grams}g estimate, ${generated.estimates.minutes} minutes.` : "Generate a stored STL and optional linked part from these parameters."}</p>
          </section>
        </div>
      )}
    </Page>
  );
}

function OrdersPage({ orders, setOrders, quoteRequests, files, skus, commerceConnectors, setCommerceConnectors, commerceImports, setCommerceImports, createOrder, updateOrderStatus, updateQuoteRequest, createQuotePortalLink, convertQuoteRequest, generateJobsForOrder, downloadFile, addToast, setBackendStatus }: { orders: Order[]; setOrders: React.Dispatch<React.SetStateAction<Order[]>>; quoteRequests: QuoteRequest[]; files: PrintFile[]; skus: SKU[]; commerceConnectors: CommerceConnector[]; setCommerceConnectors: React.Dispatch<React.SetStateAction<CommerceConnector[]>>; commerceImports: CommerceImport[]; setCommerceImports: React.Dispatch<React.SetStateAction<CommerceImport[]>>; createOrder: (order: Omit<Order, "id">) => Promise<Order>; updateOrderStatus: (orderId: string, status: Order["status"]) => Promise<Order | undefined>; updateQuoteRequest: (quoteId: string, patch: Partial<Pick<QuoteRequest, "status" | "priority" | "quotedValue" | "validUntil" | "internalNote">>) => Promise<QuoteRequest | undefined>; createQuotePortalLink: (quote: QuoteRequest, rotate?: boolean) => Promise<{ quoteRequest: QuoteRequest; url: string; accessToken: string } | null>; convertQuoteRequest: (quote: QuoteRequest) => Promise<{ quoteRequest: QuoteRequest; order: Order; job?: QueueItem | null; orders: Order[]; quoteRequests: QuoteRequest[]; queue?: QueueItem[]; todos?: Todo[] }>; generateJobsForOrder: (order: Order, dryRun?: boolean) => Promise<OrderJobGenerationResult>; downloadFile: (file: PrintFile) => Promise<boolean>; addToast: (message: string, type?: Toast["type"]) => void; setBackendStatus: React.Dispatch<React.SetStateAction<"local" | "connected">> }) {
  const [connectorDraft, setConnectorDraft] = useState({ name: "Shopify feed", source: "Shopify" as CommerceConnector["source"], url: "https://example.com/orders.json", token: "", enabled: true });
  const [csvText, setCsvText] = useState("externalId,customer,items,due,value\nSP-1001,Demo Customer,DUCT-KIT-BLK x1,Tomorrow 17:00,680");
  const [busy, setBusy] = useState("");
  const [jobPlan, setJobPlan] = useState<OrderJobGenerationResult | null>(null);
  const newQuotes = quoteRequests.filter((quote) => quote.status === "new" || quote.status === "reviewing");
  const saveConnector = async () => {
    setBusy("save");
    try {
      const saved = await apiRequest<CommerceConnector>("/api/commerceConnectors", {
        method: "POST",
        body: JSON.stringify(connectorDraft)
      });
      setCommerceConnectors((items) => [saved, ...items]);
      setBackendStatus("connected");
      addToast(`${saved.name} connector saved`);
    } catch {
      setBackendStatus("local");
      addToast("Connector save failed. Check URL, role, or API status.", "warning");
    } finally {
      setBusy("");
    }
  };
  const testConnector = async (connector: CommerceConnector) => {
    setBusy(`test-${connector.id}`);
    try {
      const result = await apiRequest<{ connector: CommerceConnector; ok: boolean }>(`/api/commerceConnectors/${connector.id}/test`, { method: "POST" });
      setCommerceConnectors((items) => items.map((item) => item.id === connector.id ? result.connector : item));
      setBackendStatus("connected");
      addToast(result.ok ? `${connector.name} feed reachable` : `${connector.name} feed returned an error`, result.ok ? "success" : "warning");
    } catch {
      setBackendStatus("local");
      addToast(`${connector.name} test failed`, "warning");
    } finally {
      setBusy("");
    }
  };
  const importConnector = async (connector: CommerceConnector) => {
    setBusy(`import-${connector.id}`);
    try {
      const result = await apiRequest<{ created: Order[]; skipped: unknown[]; importRun: CommerceImport; orders: Order[]; connector: CommerceConnector }>(`/api/commerceConnectors/${connector.id}/import`, { method: "POST" });
      setOrders(result.orders);
      setCommerceConnectors((items) => items.map((item) => item.id === connector.id ? result.connector : item));
      setCommerceImports((items) => [result.importRun, ...items.filter((item) => item.id !== result.importRun.id)]);
      setBackendStatus("connected");
      addToast(`${result.created.length} orders imported, ${result.skipped.length} skipped`, result.created.length ? "success" : "warning");
    } catch {
      setBackendStatus("local");
      addToast(`${connector.name} import failed`, "warning");
    } finally {
      setBusy("");
    }
  };
  const importCsv = async () => {
    setBusy("csv");
    try {
      const result = await apiRequest<{ created: Order[]; skipped: unknown[]; importRun: CommerceImport; orders: Order[] }>("/api/commerce/import-csv", {
        method: "POST",
        body: JSON.stringify({ source: connectorDraft.source, csv: csvText })
      });
      setOrders(result.orders);
      setCommerceImports((items) => [result.importRun, ...items.filter((item) => item.id !== result.importRun.id)]);
      setBackendStatus("connected");
      addToast(`${result.created.length} CSV orders imported, ${result.skipped.length} skipped`, result.created.length ? "success" : "warning");
    } catch {
      setBackendStatus("local");
      addToast("CSV import failed. Check headers or API status.", "warning");
    } finally {
      setBusy("");
    }
  };
  const importSample = async () => {
    await createOrder({ source: "Manual", externalId: `sample-${Date.now()}`, customer: "Demo Customer", items: [`${skus[0]?.sku || "CUSTOM"} x1`], status: "received", due: "Jun 19", value: skus[0]?.price || 500 });
    addToast("Sample order added");
  };
  const planOrderJobs = async (order: Order) => {
    setBusy(`plan-${order.id}`);
    const result = await generateJobsForOrder(order, true);
    setJobPlan(result);
    const gaps = result.missing?.length ? `, ${result.missing.length} catalog gaps` : "";
    const duplicates = result.duplicateBlocked ? `, ${result.existingJobs?.length || 0} existing jobs` : "";
    addToast(`${order.id} plan: ${result.jobs.length} jobs${gaps}${duplicates}`, result.jobs.length && !result.duplicateBlocked ? "info" : "warning");
    setBusy("");
  };
  const commitOrderJobs = async (order: Order) => {
    setBusy(`generate-${order.id}`);
    const result = await generateJobsForOrder(order, false);
    setJobPlan(result);
    const missing = result.missing?.length ? ` (${result.missing.length} catalog gaps)` : "";
    const duplicate = result.duplicateBlocked ? ` (${result.existingJobs?.length || 0} existing jobs already linked)` : "";
    addToast(`${order.id} generated ${result.jobs.length} queue jobs${missing}${duplicate}`, result.jobs.length ? "success" : "warning");
    setBusy("");
  };
  const quoteValue = (quote: QuoteRequest) => quote.quotedValue || quote.budget || Math.max(50, quote.quantity * 80);
  const quoteAttachment = (quote: QuoteRequest) => quote.fileId ? files.find((file) => file.id === quote.fileId) : undefined;
  const copyPortalLink = async (quote: QuoteRequest, rotate = false) => {
    setBusy(`${rotate ? "rotate" : "portal"}-${quote.id}`);
    const result = await createQuotePortalLink(quote, rotate);
    setBusy("");
    if (!result) {
      addToast("Customer portal link could not be created. Check API status.", "warning");
      return;
    }
    try {
      await navigator.clipboard.writeText(result.url);
      addToast("Customer portal link copied", "success");
    } catch {
      addToast(`Customer portal link ready: ${result.url}`, "info");
    }
  };
  const markQuoted = async (quote: QuoteRequest) => {
    setBusy(`quote-${quote.id}`);
    const defaultValidUntil = quote.validUntil || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const updated = await updateQuoteRequest(quote.id, { status: "quoted", priority: quote.priority || "Normal", quotedValue: quoteValue(quote), validUntil: defaultValidUntil, internalNote: quote.internalNote || "Operator quote prepared" });
    setBusy("");
    addToast(updated ? `${quote.id} quoted at $${updated.quotedValue || quoteValue(quote)}` : `${quote.id} quote saved locally`, updated ? "success" : "warning");
  };
  const acceptQuote = async (quote: QuoteRequest) => {
    setBusy(`convert-${quote.id}`);
    const result = await convertQuoteRequest({ ...quote, status: quote.status === "new" ? "quoted" : quote.status, quotedValue: quoteValue(quote) });
    setBusy("");
    addToast(result.job ? `${quote.id} converted to ${result.order.id} and queued ${result.job.id}` : `${quote.id} converted to ${result.order.id}`);
  };
  const terminalOrder = (order: Order) => order.status === "completed" || order.status === "cancelled";
  const setOrderLifecycleStatus = async (order: Order, status: Order["status"], label: string) => {
    setBusy(`${status}-${order.id}`);
    const updated = await updateOrderStatus(order.id, status);
    setBusy("");
    addToast(updated ? `${order.id} ${label}` : `${order.id} status saved locally`, updated ? "success" : "warning");
  };
  return (
    <Page title="Orders" kicker="Commerce intake, SKU mapping, and production fulfillment">
      <div className="metric-grid">
        <Metric label="Quote requests" value={`${quoteRequests.length}`} icon={FilePlus2} tone="teal" />
        <Metric label="New quotes" value={`${newQuotes.length}`} icon={Sparkles} tone="orange" />
        <Metric label="Received" value={`${orders.filter((order) => order.status === "received").length}`} icon={ShoppingBag} />
        <Metric label="Queued" value={`${orders.filter((order) => order.status === "queued").length}`} icon={ClipboardList} tone="orange" />
        <Metric label="Printing" value={`${orders.filter((order) => order.status === "printing").length}`} icon={Activity} tone="teal" />
        <Metric label="Connectors" value={`${commerceConnectors.length}`} icon={Store} tone={commerceConnectors.some((connector) => connector.enabled) ? "green" : "gray"} />
        <Metric label="Revenue" value={`$${orders.reduce((sum, order) => sum + order.value, 0)}`} icon={Database} tone="green" />
      </div>
      <div className="split">
        <section className="panel">
          <PanelTitle title="Commerce connector" action={<button className="primary" onClick={saveConnector} disabled={busy === "save"}><Save size={16} />{busy === "save" ? "Saving" : "Save source"}</button>} />
          <div className="settings-grid">
            <label>Name<input value={connectorDraft.name} onChange={(event) => setConnectorDraft((draft) => ({ ...draft, name: event.target.value }))} /></label>
            <label>Source<select value={connectorDraft.source} onChange={(event) => setConnectorDraft((draft) => ({ ...draft, source: event.target.value as CommerceConnector["source"] }))}>{["Shopify", "Etsy", "eBay", "Generic", "Manual"].map((source) => <option key={source}>{source}</option>)}</select></label>
          </div>
          <label>Feed URL<input value={connectorDraft.url} onChange={(event) => setConnectorDraft((draft) => ({ ...draft, url: event.target.value }))} placeholder="https://store.example.com/orders.json" /></label>
          <label>Access token<input value={connectorDraft.token} onChange={(event) => setConnectorDraft((draft) => ({ ...draft, token: event.target.value }))} placeholder="Optional bearer token" type="password" /></label>
          <label className="check-row"><input type="checkbox" checked={connectorDraft.enabled} onChange={(event) => setConnectorDraft((draft) => ({ ...draft, enabled: event.target.checked }))} />Enabled for imports</label>
        </section>
        <section className="panel">
          <PanelTitle title="CSV intake" action={<button className="primary" onClick={importCsv} disabled={busy === "csv"}><Upload size={16} />{busy === "csv" ? "Importing" : "Import CSV"}</button>} />
          <textarea className="code-textarea" value={csvText} onChange={(event) => setCsvText(event.target.value)} spellCheck={false} />
          <p className="muted">Headers: externalId, customer, items, due, value. Separate multiple items with ; or |.</p>
        </section>
      </div>
      <section className="panel">
        <PanelTitle title="Quote intake" />
        <DataTable headers={["Request", "Customer", "Material", "Qty", "Due", "Budget", "Status", "Actions"]}>
          {quoteRequests.map((quote) => {
            const attachment = quoteAttachment(quote);
            return <tr key={quote.id}><td><b>{quote.project}</b><small>{quote.fileName || "No file attached"}{quote.fileSize ? ` - ${quote.fileSize}` : ""}{quote.estimatedGrams ? ` - ${quote.estimatedGrams}g estimate` : ""}</small><small>{quote.customerDecisionNote || quote.notes || "No notes"}</small>{attachment && <button onClick={() => downloadFile(attachment)}><Download size={14} />Download model</button>}</td><td>{quote.customer}<small>{quote.email}{quote.company ? ` - ${quote.company}` : ""}</small></td><td>{quote.material}</td><td>{quote.quantity}</td><td>{quote.due}<small>{quote.validUntil ? `Quote valid until ${quote.validUntil}` : "No quote expiry"}</small></td><td>${quoteValue(quote)}</td><td><StatusPill status={quote.status} /></td><td><button onClick={() => copyPortalLink(quote)} disabled={busy === `portal-${quote.id}`}>{busy === `portal-${quote.id}` ? "Creating" : "Copy portal link"}</button><button onClick={() => copyPortalLink(quote, true)} disabled={busy === `rotate-${quote.id}`}>{busy === `rotate-${quote.id}` ? "Rotating" : "Rotate link"}</button><button onClick={() => markQuoted(quote)} disabled={busy === `quote-${quote.id}` || quote.status === "converted"}>{busy === `quote-${quote.id}` ? "Quoting" : "Mark quoted"}</button><button className="primary" onClick={() => acceptQuote(quote)} disabled={busy === `convert-${quote.id}` || quote.status === "converted"}>{busy === `convert-${quote.id}` ? "Converting" : "Accept / order"}</button></td></tr>;
          })}
        </DataTable>
        {!quoteRequests.length && <p className="muted">No quote requests yet. Website submissions will appear here.</p>}
      </section>
      <section className="panel">
        <PanelTitle title="Commerce feeds" action={<button onClick={importSample}><Plus size={16} />Add sample order</button>} />
        <DataTable headers={["Name", "Source", "URL", "Status", "Token", "Enabled", "Last sync", "Actions"]}>
          {commerceConnectors.map((connector) => <tr key={connector.id}><td><b>{connector.name}</b></td><td><StatusPill status={connector.source} /></td><td><code>{connector.url}</code></td><td><StatusPill status={connector.lastStatus || "not synced"} /></td><td>{connector.hasToken ? "Stored" : "None"}</td><td>{connector.enabled ? "Yes" : "No"}</td><td>{connector.lastSyncAt || "Never"}</td><td><button onClick={() => testConnector(connector)} disabled={busy === `test-${connector.id}`}>Test</button><button className="primary" onClick={() => importConnector(connector)} disabled={busy === `import-${connector.id}` || !connector.enabled}><Download size={14} />Import</button></td></tr>)}
        </DataTable>
        {!commerceConnectors.length && <p className="muted">No commerce feeds yet. Save one above or use CSV intake.</p>}
      </section>
      <DataTable headers={["Order", "Source", "Customer", "Items", "Status", "Due", "Value", "Actions"]}>
        {orders.map((order) => <tr key={order.id}><td><b>{order.id}</b><small>{order.externalId ? `External ${order.externalId}` : "Manual record"}</small></td><td>{order.source}</td><td>{order.customer}</td><td>{order.items.join(", ")}</td><td><StatusPill status={order.status} /></td><td>{order.due}</td><td>${order.value}</td><td><button onClick={() => planOrderJobs(order)} disabled={busy === `plan-${order.id}` || terminalOrder(order)}>Plan jobs</button><button className="primary" onClick={() => commitOrderJobs(order)} disabled={busy === `generate-${order.id}` || terminalOrder(order)}>Generate jobs</button><button onClick={() => setOrderLifecycleStatus(order, "on_hold", "placed on hold")} disabled={busy === `on_hold-${order.id}` || terminalOrder(order)}>Hold</button><button onClick={() => setOrderLifecycleStatus(order, "shipped", "shipped")} disabled={busy === `shipped-${order.id}` || terminalOrder(order)}>Ship</button><button onClick={() => setOrderLifecycleStatus(order, "completed", "completed")} disabled={busy === `completed-${order.id}` || terminalOrder(order)}>Complete</button><button onClick={() => setOrderLifecycleStatus(order, "cancelled", "cancelled")} disabled={busy === `cancelled-${order.id}` || terminalOrder(order)}>Cancel</button></td></tr>)}
      </DataTable>
      {jobPlan && (
        <section className="panel">
          <PanelTitle title={`${jobPlan.dryRun ? "Generation plan" : "Generation result"} - ${jobPlan.order.id}`} />
          <div className="event-feed match-feed">
            {jobPlan.duplicateBlocked && <div><StatusDot status="failed" /><span>Duplicate generation blocked</span><em>{jobPlan.existingJobs?.length || 0} active jobs already linked to this order</em></div>}
            {jobPlan.jobs.map((job) => <div key={job.id}><StatusDot status={jobPlan.dryRun ? "queued" : "complete"} /><span>{job.file}</span><em>{job.material} - {job.stage} - {job.scheduleWarnings?.length ? job.scheduleWarnings.join(", ") : "Ready for production"}</em></div>)}
            {jobPlan.stockChanges?.map((change) => <div key={change.sku}><StatusDot status="queued" /><span>{change.sku} stock</span><em>{change.before} {"->"} {change.after} after {change.quantity} ordered</em></div>)}
            {jobPlan.missing?.map((gap) => <div key={`${gap.item}-${gap.reason}`}><StatusDot status="failed" /><span>{gap.item}</span><em>{gap.reason}</em></div>)}
            {!jobPlan.jobs.length && !jobPlan.duplicateBlocked && !jobPlan.missing?.length && <div><StatusDot status="queued" /><span>No jobs generated</span><em>Check SKU mapping rules before committing production</em></div>}
          </div>
        </section>
      )}
      <section className="panel">
        <PanelTitle title="Import history" />
        <div className="event-feed">{commerceImports.slice(0, 8).map((run) => <div key={run.id}><StatusDot status={run.status === "imported" ? "complete" : "queued"} /><span>{run.connectorName || run.source}</span><em>{run.created} created - {run.skipped} skipped - {run.at}</em></div>)}{!commerceImports.length && <div><StatusDot status="queued" /><span>No commerce imports yet</span><em>Use a feed or CSV to create the first batch</em></div>}</div>
      </section>
      <section className="panel">
        <PanelTitle title="SKU mapping rules" />
        <div className="rule-grid">{skus.map((sku) => <div key={sku.id} className="rule-card"><b>{sku.channel}</b><span><code>{sku.sku}</code> maps to {sku.parts.join(" + ")}</span><em>{sku.variants.join(", ")}</em></div>)}</div>
      </section>
    </Page>
  );
}

function FilesPage({ files, folders, queueFile, setView, addToast, createSampleFile, createFileFolder, uploadModelFile, versionFile, downloadFile, deleteFile }: { files: PrintFile[]; folders: FileFolder[]; queueFile: (file: PrintFile) => void; setView: (v: View) => void; addToast: (message: string, type?: Toast["type"]) => void; createSampleFile: (draft: { name: string; material: string; folder: string }) => Promise<{ file: PrintFile; folder: FileFolder; stlBytes: number }>; createFileFolder: (draft: Omit<FileFolder, "id" | "fileCount" | "createdAt" | "updatedAt">) => Promise<FileFolder>; uploadModelFile: (file: File, material?: string, folder?: string) => Promise<PrintFile>; versionFile: (fileId: string) => void; downloadFile: (file: PrintFile) => Promise<boolean>; deleteFile: (fileId: string) => Promise<boolean> }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState("All");
  const [material, setMaterial] = useState("PLA");
  const [uploading, setUploading] = useState(false);
  const [working, setWorking] = useState("");
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState("");
  const visible = files.filter((f) => (type === "All" || f.type === type) && f.name.toLowerCase().includes(query.toLowerCase()));
  const addSample = async () => {
    setWorking("sample");
    const result = await createSampleFile({ name: "3DSTU FarmFlow sample bracket", material, folder: "Samples" });
    setWorking("");
    addToast(`${result.file.name} generated and stored (${result.stlBytes} bytes)`);
  };
  const addFolder = async () => {
    setWorking("folder");
    const folder = await createFileFolder({ name: `Review ${folders.length + 1}`, parent: "Inbox", purpose: "review" });
    setWorking("");
    addToast(`${folder.name} folder ready`);
  };
  const uploadRealFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    const uploaded = await uploadModelFile(file, material, "Uploads");
    setUploading(false);
    addToast(`${uploaded.name} parsed: ${uploaded.dimensions.join(" x ")} mm, ${uploaded.usage}g, ${uploaded.printTime}`);
  };
  const download = async (file: PrintFile) => {
    const ok = await downloadFile(file);
    addToast(ok ? `${file.name} download started` : `${file.name} download failed`, ok ? "success" : "warning");
  };
  const remove = async (file: PrintFile) => {
    const ok = await deleteFile(file.id);
    addToast(ok ? `${file.name} deleted` : `${file.name} is still referenced; remove jobs or parts first`, ok ? "success" : "warning");
  };
  const openPreview = async (file: PrintFile) => {
    setPreviewLoading(file.id);
    try {
      const result = await apiRequest<FilePreview>(`/api/files/${file.id}/preview`);
      setPreview(result);
      addToast(`${file.name} preview ready`, "success");
    } catch {
      addToast(`${file.name} preview failed`, "warning");
    } finally {
      setPreviewLoading("");
    }
  };
  return (
    <Page title="Cloud files" kicker="Library, folders, slicing and queue actions">
      <div className="toolbar">
        <div className="searchbox"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search file library" /></div>
        <select value={type} onChange={(e) => setType(e.target.value)}><option>All</option><option>GCODE</option><option>STL</option><option>3MF</option><option>OBJ</option></select>
        <select value={material} onChange={(event) => setMaterial(event.target.value)}>{["PLA", "PETG", "ASA", "TPU", "Resin"].map((item) => <option key={item}>{item}</option>)}</select>
        <label className="file-upload-button"><Upload size={16} />{uploading ? "Parsing..." : "Upload model"}<input type="file" accept=".stl,.3mf,.gcode,.obj" onChange={uploadRealFile} /></label>
        <button onClick={addSample} disabled={working === "sample"}>{working === "sample" ? "Generating..." : "Add sample file"}</button>
        <button onClick={addFolder} disabled={working === "folder"}><FilePlus2 size={16} />{working === "folder" ? "Creating..." : "Create folder"}</button>
      </div>
      <div className="folder-strip">{folders.slice(0, 6).map((folder) => <span key={folder.id}>{folder.name}<small>{folder.fileCount || files.filter((file) => file.folder === folder.name).length}</small></span>)}</div>
      <DataTable headers={["Model", "Folder", "Material", "Status", "Version", "Dimensions", "Estimate", "Actions"]}>
        {visible.map((file) => <tr key={file.id}><td><div className="model-cell"><span className="model-thumb">{file.thumbnail.slice(0, 2).toUpperCase()}</span><div><b>{file.name}</b><small>{file.type} - {file.size} - {file.tags.join(", ")}</small></div></div></td><td>{file.folder}</td><td>{file.material}</td><td><StatusPill status={file.status} /></td><td>v{file.version}</td><td>{file.dimensions.join(" x ")} mm</td><td>{file.printTime}<small>{file.usage}g - ${file.cost} quote</small></td><td><button onClick={() => openPreview(file)}>{previewLoading === file.id ? "Loading" : "Preview"}</button><button onClick={() => queueFile(file)}>Queue</button><button onClick={() => setView("slicer")}>Slice</button><button onClick={() => versionFile(file.id)}>New version</button><button onClick={() => download(file)}><Download size={14} /></button><button onClick={() => remove(file)}><Trash2 size={14} /></button></td></tr>)}
      </DataTable>
      {preview && <FilePreviewDrawer preview={preview} onClose={() => setPreview(null)} />}
    </Page>
  );
}

function FilePreviewDrawer({ preview, onClose }: { preview: FilePreview; onClose: () => void }) {
  const sample = preview.visualization.sample || [];
  const maxX = Math.max(1, preview.buildPlate.width, preview.visualization.extents.max[0] || preview.summary.dimensions[0]);
  const maxY = Math.max(1, preview.buildPlate.depth, preview.visualization.extents.max[1] || preview.summary.dimensions[1]);
  const points = sample.slice(0, 160).map((point, index) => {
    const left = Math.max(0, Math.min(100, (point.x / maxX) * 100));
    const top = Math.max(0, Math.min(100, (point.y / maxY) * 100));
    return <i key={`${point.x}-${point.y}-${point.z}-${index}`} style={{ left: `${left}%`, top: `${top}%`, opacity: point.extrusion ? 0.88 : 0.35 }} />;
  });
  const boxWidth = Math.max(4, Math.min(100, (preview.summary.dimensions[0] / preview.buildPlate.width) * 100));
  const boxDepth = Math.max(4, Math.min(100, (preview.summary.dimensions[1] / preview.buildPlate.depth) * 100));
  const layers = preview.visualization.layers || [];
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer file-preview-drawer" onClick={(event) => event.stopPropagation()}>
        <button className="icon close" onClick={onClose}><X size={18} /></button>
        <h2>{preview.name}</h2>
        <p>{preview.type} - {preview.material} - generated {new Date(preview.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
        <div className="metric-grid">
          <Metric label="Dimensions" value={`${preview.summary.dimensions.join(" x ")} mm`} icon={Box} />
          <Metric label="Estimate" value={preview.summary.printTime} icon={CalendarClock} tone="teal" />
          <Metric label="Material" value={`${preview.summary.estimateGrams}g`} icon={Database} tone="orange" />
          <Metric label="Plate use" value={`${preview.buildPlate.occupancyPercent}%`} icon={Gauge} tone={preview.buildPlate.occupancyPercent > 100 ? "red" : "green"} />
        </div>
        <section className="preview-plate">
          <div className="plate-canvas">
            <span className="model-footprint" style={{ width: `${boxWidth}%`, height: `${boxDepth}%` }} />
            {points}
          </div>
          <small>{preview.buildPlate.fit} - {preview.buildPlate.width} x {preview.buildPlate.depth} x {preview.buildPlate.height} mm reference</small>
        </section>
        {preview.visualization.kind === "toolpath" && <section className="panel flat-panel">
          <PanelTitle title="G-code toolpath" />
          <div className="preview-stats">
            <span>{preview.visualization.lineCount || 0} lines</span>
            <span>{preview.visualization.motionCommands || 0} moves</span>
            <span>{preview.visualization.extrusionMoves || 0} extrusion moves</span>
            <span>{preview.visualization.totalExtrusion || 0} E</span>
          </div>
          <div className="layer-bars">
            {layers.slice(0, 32).map((layer) => <span key={layer.z} title={`Z${layer.z} - ${layer.moves} moves`} style={{ height: `${Math.max(8, Math.min(100, layer.moves * 2))}%` }} />)}
          </div>
        </section>}
        <section className="panel flat-panel">
          <PanelTitle title="Compatible printers" />
          <div className="event-feed">
            {preview.compatiblePrinters.map((printer) => <div key={printer.id}><StatusDot status={printer.status} /><span>{printer.name}<small>{printer.buildVolume.join(" x ")} mm</small></span><em>{printer.status}</em></div>)}
            {!preview.compatiblePrinters.length && <div><StatusDot status="failed" /><span>No matching printer</span><em>Check material and build volume</em></div>}
          </div>
        </section>
        {preview.warnings.length > 0 && <div className="notice warning"><AlertTriangle size={18} /><span>{preview.warnings.join(" ")}</span></div>}
      </aside>
    </div>
  );
}

function QueuePage({ queue, setQueue, printers, addToast, scheduleJob, updateStatus, updatePriority, matchQueueJobs }: { queue: QueueItem[]; setQueue: React.Dispatch<React.SetStateAction<QueueItem[]>>; printers: Printer[]; addToast: (message: string, type?: Toast["type"]) => void; scheduleJob: (jobId: string, printer: Printer, scheduledStart?: string) => Promise<string[]>; updateStatus: (jobId: string, status: JobStatus) => void; updatePriority: (jobId: string, priority: QueueItem["priority"]) => void; matchQueueJobs: (dryRun: boolean) => Promise<QueueMatchResult> }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [tab, setTab] = useState<"queued" | "printing" | "complete" | "cancelled" | "failed">("queued");
  const [autoMatching, setAutoMatching] = useState(true);
  const [lowPriority, setLowPriority] = useState(true);
  const [matchPlan, setMatchPlan] = useState<QueueMatchResult | null>(null);
  const productionSlots = 3;
  const activeSlots = queue.filter((job) => job.status === "printing" || job.status === "paused").length;
  const visibleQueue = queue.filter((job) => tab === "queued" ? job.status === "queued" : tab === "printing" ? job.status === "printing" || job.status === "paused" : job.status === tab);
  const queueTabs: [typeof tab, string][] = [["queued", "Queued"], ["printing", "In Progress"], ["complete", "Completed"], ["cancelled", "Cancelled"], ["failed", "Errored"]];
  const move = (id: string, dir: -1 | 1) => setQueue((items) => {
    const index = items.findIndex((i) => i.id === id);
    const next = [...items];
    const target = index + dir;
    if (target < 0 || target >= next.length) return next;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    setQueue((items) => {
      const moving = items.find((item) => item.id === dragId);
      if (!moving) return items;
      const without = items.filter((item) => item.id !== dragId);
      const targetIndex = without.findIndex((item) => item.id === targetId);
      const next = [...without];
      next.splice(targetIndex, 0, moving);
      return next;
    });
    setDragId(null);
    addToast("Queue order updated", "info");
  };
  const dryRunMatch = async () => {
    const result = await matchQueueJobs(true);
    setMatchPlan(result);
    addToast(result.matches.length ? `Dry run found ${result.matches.length} startable jobs` : "No startable jobs found", result.matches.length ? "info" : "warning");
  };
  const commitMatch = async () => {
    const result = await matchQueueJobs(false);
    setMatchPlan(result);
    addToast(result.matches.length ? `Started ${result.matches.length} matched jobs` : "No matched jobs were started", result.matches.length ? "success" : "warning");
  };
  const runMatchFromKey = (event: React.KeyboardEvent<HTMLButtonElement>, action: () => Promise<void>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void action();
  };
  return (
    <Page title="Print queue" kicker="Smart routing, grouped production, and matching diagnostics">
      <div className="metric-grid">
        <Metric label="Production slots" value={`${activeSlots}/${productionSlots}`} icon={Gauge} tone={activeSlots >= productionSlots ? "orange" : "green"} />
        <Metric label="Queued normal" value={`${queue.filter((job) => job.status === "queued" && job.priority !== "Low").length}`} icon={ClipboardList} />
        <Metric label="Low priority" value={lowPriority ? `${queue.filter((job) => job.status === "queued" && job.priority === "Low").length}` : "Paused"} icon={Pause} tone="orange" />
        <Metric label="Auto matching" value={autoMatching ? "On" : "Off"} icon={Sparkles} tone={autoMatching ? "teal" : "gray"} />
      </div>
      <div className="queue-tabs">
        {queueTabs.map(([id, label]) => <button key={id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>{queue.filter((job) => id === "queued" ? job.status === "queued" : id === "printing" ? job.status === "printing" || job.status === "paused" : job.status === id).length} {label}</button>)}
      </div>
      <div className="quickbar">
        <label className="check-row"><input type="checkbox" checked={autoMatching} onChange={(event) => setAutoMatching(event.target.checked)} />Automatic Queue Matching</label>
        <label className="check-row"><input type="checkbox" checked={lowPriority} onChange={(event) => setLowPriority(event.target.checked)} />Low Priority Queue</label>
        <button onClick={() => { selected.forEach((id) => updatePriority(id, "Rush")); addToast("Selected jobs marked rush"); }}>Mark rush</button>
        <button type="button" onMouseDown={(event) => { event.preventDefault(); void commitMatch(); }} onKeyDown={(event) => runMatchFromKey(event, commitMatch)}>Match queue now</button>
        <button onClick={() => setSelected([])}>Clear selection</button>
      </div>
      <DataTable headers={["", "Order", "File", "Printer", "Status", "Priority", "Material", "Estimate", "Actions"]}>
        {visibleQueue.map((job) => <tr key={job.id} draggable={job.status === "queued"} onDragStart={() => setDragId(job.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(job.id)} className={dragId === job.id ? "dragging" : ""}><td><input type="checkbox" checked={selected.includes(job.id)} onChange={(e) => setSelected((items) => e.target.checked ? [...items, job.id] : items.filter((x) => x !== job.id))} /></td><td><button onClick={() => move(job.id, -1)}>Up</button><button onClick={() => move(job.id, 1)}>Down</button></td><td><b>{job.file}</b><small>{job.priority === "Low" ? "Low priority group" : "Normal priority group"} - added {job.added}</small></td><td><select value={job.printerId} onChange={(e) => { const p = printers.find((x) => x.id === e.target.value)!; scheduleJob(job.id, p, job.scheduledStart || "13:00"); }} >{printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td><td><StatusPill status={job.status} /></td><td><select value={job.priority} onChange={(e) => updatePriority(job.id, e.target.value as QueueItem["priority"])}>{["Rush", "High", "Normal", "Low"].map((p) => <option key={p}>{p}</option>)}</select></td><td>{job.material}</td><td>{job.time}<small>${job.cost}</small></td><td><button onClick={() => updateStatus(job.id, job.status === "paused" ? "printing" : "paused")}>{job.status === "paused" ? "Resume" : "Pause"}</button><button onClick={() => updateStatus(job.id, "cancelled")}>Cancel</button></td></tr>)}
      </DataTable>
      {visibleQueue.length === 0 && <section className="empty-state"><Archive size={24} /><b>No jobs in this state</b><span>Queue records stay available for audit and reporting after archiving.</span></section>}
      <section className="panel">
        <PanelTitle title="Matching inspector" action={<button type="button" onMouseDown={(event) => { event.preventDefault(); void dryRunMatch(); }} onKeyDown={(event) => runMatchFromKey(event, dryRunMatch)}><RefreshCw size={16} />Dry run</button>} />
        {matchPlan && (
          <div className="event-feed match-feed">
            {matchPlan.matches.map((match) => <div key={match.jobId}><StatusDot status={matchPlan.dryRun ? "queued" : "complete"} /><span>{match.file} {"->"} {match.printer}</span><em>{match.warnings.length ? match.warnings.join(", ") : "Ready to start"}</em></div>)}
            {!matchPlan.matches.length && <div><StatusDot status="failed" /><span>No matched jobs</span><em>{matchPlan.skipped[0]?.reason || "No open production slots"}</em></div>}
          </div>
        )}
        <DataTable headers={["Printer", "Result", "Reason"]}>
          {printers.map((printer) => {
            const reason = printer.status === "offline" ? "Offline" : printer.status === "printing" || printer.status === "paused" ? "Production slot busy" : printer.status === "error" ? "Needs operator review" : printer.filament.includes("PLA") || printer.filament.includes("PETG") ? "Compatible material and available" : "Material mismatch";
            const ok = reason.includes("Compatible");
            return <tr key={printer.id}><td><b>{printer.name}</b><small>{printer.model}</small></td><td><StatusPill status={ok ? "matched" : "waiting"} /></td><td>{reason}</td></tr>;
          })}
        </DataTable>
      </section>
    </Page>
  );
}

function SchedulerPage({ queue, setQueue, printers, addToast, scheduleJob, autoScheduleJobs, optimizeScheduleJobs, solveScheduleJobs }: { queue: QueueItem[]; setQueue: React.Dispatch<React.SetStateAction<QueueItem[]>>; printers: Printer[]; addToast: (message: string, type?: Toast["type"]) => void; scheduleJob: (jobId: string, printer: Printer, scheduledStart?: string) => Promise<string[]>; autoScheduleJobs: () => Promise<AutoScheduleResult>; optimizeScheduleJobs: (strategy: OptimizeScheduleStrategy) => Promise<AutoScheduleResult>; solveScheduleJobs: (objective: ConstraintObjective) => Promise<AutoScheduleResult> }) {
  const [selectedId, setSelectedId] = useState(queue.find((job) => job.stage === "needs scheduling")?.id || queue[0]?.id);
  const [autoPlan, setAutoPlan] = useState<AutoScheduleResult | null>(null);
  const pending = queue.filter((job) => job.stage === "needs slicing" || job.stage === "needs scheduling" || !job.scheduledStart);
  const selected = queue.find((job) => job.id === selectedId) || pending[0] || queue[0];
  const selectedWarnings = selected ? getScheduleWarnings(selected, printers.find((printer) => printer.id === selected.printerId) || printers[0]) : [];
  const scheduleOnPrinter = async (jobId: string, printer: Printer) => {
    const job = queue.find((item) => item.id === jobId);
    if (!job) return;
    const warnings = await scheduleJob(jobId, printer, job.scheduledStart || "13:00");
    addToast(warnings.length ? `Scheduled with warnings: ${warnings.join(", ")}` : `${job.file} scheduled on ${printer.name}`, warnings.length ? "warning" : "success");
  };
  const autoSchedule = async () => {
    const result = await autoScheduleJobs();
    setAutoPlan(result);
    addToast(result.scheduled.length ? `Auto scheduled ${result.scheduled.length} jobs` : "No schedulable jobs found", result.scheduled.length ? "success" : "info");
  };
  const optimize = async (strategy: OptimizeScheduleStrategy) => {
    const result = await optimizeScheduleJobs(strategy);
    setAutoPlan(result);
    const label = strategy === "material-color" ? "Material/color batches" : strategy === "load-balance" ? "Load balance" : "Due priority";
    addToast(result.scheduled.length ? `${label} optimized ${result.scheduled.length} jobs` : `${label} found no schedulable jobs`, result.scheduled.length ? "success" : "info");
  };
  const solve = async (objective: ConstraintObjective) => {
    const result = await solveScheduleJobs(objective);
    setAutoPlan(result);
    const label = objective === "balanced-cost" ? "Constraint solver" : objective === "due-risk" ? "Due-risk solver" : "Changeover solver";
    addToast(result.scheduled.length ? `${label} scheduled ${result.scheduled.length} jobs` : `${label} found no feasible jobs`, result.scheduled.length ? "success" : "info");
  };
  return (
    <Page title="Scheduler" kicker="Task pool, printer capability matching, and production timeline">
      <div className="quickbar">
        <button className="primary" onClick={autoSchedule}><Sparkles size={16} />Auto schedule</button>
        <button onClick={() => optimize("material-color")}>Merge material/color</button>
        <button onClick={() => optimize("load-balance")}>Balance load</button>
        <button onClick={() => solve("balanced-cost")}><Sparkles size={16} />Constraint solve</button>
        <button onClick={() => solve("due-risk")}>Due-risk solve</button>
        <button onClick={() => solve("changeover-min")}>Min changeovers</button>
      </div>
      {autoPlan && (
        <section className="panel auto-plan-panel">
          <PanelTitle title="Auto schedule result" />
          {autoPlan.solver && (
            <div className="solver-summary">
              <span><b>{autoPlan.solver.engine}</b></span>
              <span>Objective {autoPlan.solver.objective}</span>
              <span>{autoPlan.solver.feasible ? "Feasible" : "Infeasible"}</span>
              <span>Cost {Math.round(autoPlan.solver.result)}</span>
              <span>{autoPlan.solver.variables} variables</span>
            </div>
          )}
          {autoPlan.scheduled.length ? (
            <DataTable headers={["Task", "Printer", "Start", "Duration", "Change cost", "Warnings"]}>
              {autoPlan.scheduled.map((item) => <tr key={item.jobId}><td><b>{item.file}</b><small>Score {item.score}{typeof item.slot === "number" ? ` - Slot ${item.slot + 1}` : ""}</small></td><td>{item.printer}</td><td>{item.scheduledStart}</td><td>{item.durationMinutes}m</td><td>{item.changeCost}m</td><td><div className="warning-row">{item.warnings.length ? item.warnings.map((warning) => <em key={warning}>{warning}</em>) : <em className="ok">Clean match</em>}</div></td></tr>)}
            </DataTable>
          ) : (
            <div className="empty-state"><CalendarClock size={24} /><b>No schedulable jobs</b><span>Jobs that still need slicing or already have a slot are left untouched.</span></div>
          )}
          {!!autoPlan.skipped.length && <div className="warning-row persistent-warnings">{autoPlan.skipped.map((item) => <em key={item.jobId}>{item.file}: {item.reason}</em>)}</div>}
        </section>
      )}
      <div className="scheduler-board">
        <section className="panel task-pool">
          <PanelTitle title="Unscheduled tasks" />
          <div className="task-stack">
            {pending.map((job) => {
              const bestPrinter = printers.find((printer) => printer.status !== "offline" && printer.status !== "maintenance") || printers[0];
              const warnings = getScheduleWarnings(job, bestPrinter);
              return (
                <button key={job.id} className={`schedule-task ${selected?.id === job.id ? "selected" : ""}`} draggable onClick={() => setSelectedId(job.id)} onDragStart={(event) => event.dataTransfer.setData("text/plain", job.id)}>
                  <b>{job.file}</b>
                  <span>{job.time} - {job.material} / {job.color}</span>
                  <small>Due {job.due} - {job.stage}</small>
                  <div className="warning-row">{warnings.length ? warnings.map((warning) => <em key={warning}>{warning}</em>) : <em className="ok">Ready</em>}</div>
                </button>
              );
            })}
          </div>
        </section>
        <section className="panel printer-capability-list">
          <PanelTitle title="Printers" />
          {printers.map((printer) => {
            const warnings = selected ? getScheduleWarnings(selected, printer) : [];
            return (
              <div key={printer.id} className="capability-card" onDragOver={(event) => event.preventDefault()} onDrop={(event) => scheduleOnPrinter(event.dataTransfer.getData("text/plain"), printer)}>
                <div><b>{printer.name}</b><StatusPill status={printer.status} /></div>
                <span>{printer.model}</span>
                <small>{printer.compatibleMaterials.join(", ")} - {printer.buildVolume.join(" x ")} mm</small>
                <div className="warning-row">{warnings.length ? warnings.map((warning) => <em key={warning}>{warning}</em>) : <em className="ok">Compatible</em>}</div>
              </div>
            );
          })}
        </section>
        <section className="panel timeline-panel">
          <PanelTitle title="Timeline" />
          <div className="timeline-header">{["08", "10", "12", "14", "16", "18"].map((hour) => <span key={hour}>{hour}:00</span>)}</div>
          <div className="timeline-lanes">
            {printers.map((printer, printerIndex) => (
              <div key={printer.id} className="timeline-lane">
                <b>{printer.name}</b>
                <div className="timeline-track" onDragOver={(event) => event.preventDefault()} onDrop={(event) => scheduleOnPrinter(event.dataTransfer.getData("text/plain"), printer)}>
                  {queue.filter((job) => job.printerId === printer.id && (job.scheduledStart || job.status === "printing" || job.status === "paused")).map((job, jobIndex) => (
                    <button key={job.id} className={`timeline-job ${(job.scheduleWarnings?.length || dueRisk(job)) ? "risk" : ""}`} style={{ gridColumn: `${2 + ((printerIndex + jobIndex) % 4)} / span ${job.time.startsWith("5") ? 3 : 2}` }} onClick={() => setSelectedId(job.id)}>
                      <span>{job.file}</span>
                      <small>{job.time} - {job.material}</small>
                      {!!job.scheduleWarnings?.length && <small>{job.scheduleWarnings.slice(0, 2).join(", ")}</small>}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {selected && (
            <div className="selected-task-strip">
              <PanelTitle title="Selected task" />
              <div className="risk-grid compact-risk-grid">
                <Metric label="Duration" value={selected.time} icon={CalendarClock} />
                <Metric label="Due" value={selected.due} icon={AlertTriangle} tone={dueRisk(selected) ? "red" : "green"} />
                <Metric label="Model size" value={`${selected.dimensions.join("x")} mm`} icon={Box} tone="gray" />
                <Metric label="Owner" value={selected.assignee} icon={Users} tone="teal" />
              </div>
              <div className="warning-row persistent-warnings">{selectedWarnings.length ? selectedWarnings.map((warning) => <em key={warning}>{warning}</em>) : <em className="ok">No active scheduling warnings</em>}</div>
            </div>
          )}
        </section>
      </div>
    </Page>
  );
}

function TodosPage({ todos, queue, printers, currentUser, actOnTodo, addToast }: { todos: Todo[]; queue: QueueItem[]; printers: Printer[]; currentUser: User | null; actOnTodo: (todoId: string, action: TodoAction["action"], payload?: Partial<Pick<TodoAction, "owner" | "note" | "snoozeUntil">>) => Promise<{ action: TodoAction; todo: Todo | null; todos: Todo[]; todoActions: TodoAction[] }>; addToast: (message: string, type?: Toast["type"]) => void }) {
  const [busy, setBusy] = useState("");
  const runAction = async (todo: Todo, action: TodoAction["action"]) => {
    setBusy(`${todo.id}-${action}`);
    const payload = action === "claim"
      ? { owner: currentUser?.name || "Operator", note: "Claimed from Auto Todos" }
      : action === "snooze"
        ? { snoozeUntil: "Tomorrow 09:00", note: "Snoozed for next shift" }
        : { note: "Resolved from Auto Todos" };
    const result = await actOnTodo(todo.id, action, payload);
    setBusy("");
    addToast(`${todo.title} ${result.action.action}`, action === "complete" ? "success" : "info");
  };
  return (
    <Page title="Auto Todos" kicker="Status-driven work instructions for people, not manual task entry">
      <div className="metric-grid">
        <Metric label="Generated todos" value={`${todos.length}`} icon={ListChecks} />
        <Metric label="Claimed" value={`${todos.filter((todo) => todo.status === "claimed").length}`} icon={Users} tone="teal" />
        <Metric label="Need slicing" value={`${todos.filter((todo) => todo.kind === "slicing").length}`} icon={Wand2} tone="orange" />
        <Metric label="Material changes" value={`${todos.filter((todo) => todo.kind === "material").length}`} icon={CircleDot} tone="red" />
        <Metric label="Size conflicts" value={`${todos.filter((todo) => todo.kind === "size").length}`} icon={Box} tone="orange" />
        <Metric label="Exceptions" value={`${todos.filter((todo) => todo.kind === "exception").length}`} icon={AlertTriangle} tone="red" />
        <Metric label="Snoozed" value={`${todos.filter((todo) => todo.status === "snoozed").length}`} icon={CalendarClock} tone="gray" />
      </div>
      <DataTable headers={["Todo", "Owner", "Source task", "Kind", "Severity", "Status", "Due", "Actions"]}>
        {todos.map((todo) => <tr key={todo.id}><td><b>{todo.title}</b><small>{todo.actionNote || "Generated from production state"}</small></td><td>{todo.owner}</td><td>{todo.source}</td><td>{todo.kind}</td><td><StatusPill status={todo.severity} /></td><td><StatusPill status={todo.status || "open"} /></td><td>{todo.due}</td><td><button onClick={() => runAction(todo, "claim")} disabled={busy === `${todo.id}-claim` || todo.status === "claimed"}>Claim</button><button onClick={() => runAction(todo, "snooze")} disabled={busy === `${todo.id}-snooze`}>Snooze</button><button className="primary" onClick={() => runAction(todo, "complete")} disabled={busy === `${todo.id}-complete`}>Complete</button></td></tr>)}
      </DataTable>
      <section className="panel">
        <PanelTitle title="Automation rules" />
        <div className="rule-grid">
          <div className="rule-card"><b>Needs slicing</b><span>When a task enters needs slicing, assign it to the slicing owner.</span><em>{queue.filter((job) => job.stage === "needs slicing").length} active</em></div>
          <div className="rule-card"><b>Needs scheduling</b><span>When a task is ready but unscheduled, notify the scheduler.</span><em>{queue.filter((job) => job.stage === "needs scheduling").length} active</em></div>
          <div className="rule-card"><b>Material mismatch</b><span>When the selected printer cannot run the material, create a change-material todo.</span><em>Auto checked</em></div>
          <div className="rule-card"><b>Build volume mismatch</b><span>When the model exceeds a printer volume, create a scheduler todo before production starts.</span><em>{todos.filter((todo) => todo.kind === "size").length} active</em></div>
          <div className="rule-card"><b>Due risk</b><span>Rush jobs due today create exception todos before they are late.</span><em>{queue.filter(dueRisk).length} risks</em></div>
        </div>
      </section>
    </Page>
  );
}

function SlicerPage({ files, printers, slicerJobs, addToast, runSlicerJob }: { files: PrintFile[]; printers: Printer[]; slicerJobs: SlicerJob[]; addToast: (message: string, type?: Toast["type"]) => void; runSlicerJob: (settings: { fileId: string; printerId: string; material: string; layerHeight: string; infill: number; supports: boolean }) => Promise<{ job: SlicerJob; file?: PrintFile }> }) {
  const [result, setResult] = useState("");
  const [settings, setSettings] = useState({ file: files.find((f) => !f.sliced)?.id || files[0].id, printer: printers[0].id, material: "PLA", layer: "0.20", infill: 18, supports: true });
  const [running, setRunning] = useState(false);
  const run = async () => {
    const file = files.find((f) => f.id === settings.file)!;
    setRunning(true);
    const sliced = await runSlicerJob({ fileId: file.id, printerId: settings.printer, material: settings.material, layerHeight: settings.layer, infill: settings.infill, supports: settings.supports });
    setRunning(false);
    if (sliced.job.status === "complete") {
      const text = `${sliced.job.outputName || file.name.replace(/\.[^.]+$/, ".gcode")} - ${settings.material}, ${settings.layer}mm, ${settings.infill}% infill - ${sliced.job.engine} engine`;
      setResult(text);
      addToast("Slicer job completed");
    } else {
      setResult(`${file.name} slicing failed: ${sliced.job.error || "unknown error"}`);
      addToast("Slicer job failed", "warning");
    }
  };
  return (
    <Page title="Cloud slicer" kicker="API-backed slicer jobs, G-code output, and profile-aware estimates">
      <div className="slicer-layout">
        <section className="panel">
          <PanelTitle title="Slicing setup" />
          <label>Model file<select value={settings.file} onChange={(e) => setSettings({ ...settings, file: e.target.value })}>{files.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          <label>Printer profile<select value={settings.printer} onChange={(e) => setSettings({ ...settings, printer: e.target.value })}>{printers.map((p) => <option key={p.id} value={p.id}>{p.model} - {p.name}</option>)}</select></label>
          <label>Material<select value={settings.material} onChange={(e) => setSettings({ ...settings, material: e.target.value })}>{["PLA", "PETG", "ASA", "TPU", "Resin"].map((m) => <option key={m}>{m}</option>)}</select></label>
          <label>Layer height<select value={settings.layer} onChange={(e) => setSettings({ ...settings, layer: e.target.value })}>{["0.08", "0.12", "0.16", "0.20", "0.28"].map((m) => <option key={m}>{m}</option>)}</select></label>
          <label>Infill {settings.infill}%<input type="range" min="0" max="80" value={settings.infill} onChange={(e) => setSettings({ ...settings, infill: Number(e.target.value) })} /></label>
          <label className="check-row"><input type="checkbox" checked={settings.supports} onChange={(e) => setSettings({ ...settings, supports: e.target.checked })} />Generate supports</label>
          <button className="primary wide" onClick={run} disabled={running}><Wand2 size={16} />{running ? "Slicing..." : "Slice model"}</button>
        </section>
        <section className="panel preview-bed">
          <PanelTitle title="Build plate preview" />
          <div className="build-plate"><div className="model-blob" /></div>
          {result ? <div className="result-card"><b>{result}</b><p>G-code output is stored by the backend. External slicers can be attached with LAYERPILOT_SLICER_CMD and LAYERPILOT_SLICER_ARGS.</p></div> : <p className="muted">Choose a file and settings, then create a backend slicer job.</p>}
          <div className="event-feed">
            {slicerJobs.slice(0, 5).map((job) => <div key={job.id}><StatusDot status={job.status === "complete" ? "complete" : job.status === "failed" ? "failed" : "queued"} /><span>{job.sourceFile} - {job.engine}</span><em>{job.status}{job.outputSize ? ` - ${job.outputSize}` : ""}</em></div>)}
            {!slicerJobs.length && <div><StatusDot status="queued" /><span>No slicer jobs yet</span><em>Run the first slice job</em></div>}
          </div>
        </section>
      </div>
    </Page>
  );
}

function FilamentPage({ spools, purchaseRequests, createSpool, updateSpool, logSpoolUsage, generateSpoolLabels, scanSpool, createPurchaseRequest, generateReorderPlan, updatePurchaseRequest, receivePurchaseRequest, addToast }: { spools: Spool[]; purchaseRequests: PurchaseRequest[]; createSpool: (spool: Omit<Spool, "id">) => Promise<Spool>; updateSpool: (spoolId: string, patch: Partial<Spool>) => Promise<Spool | undefined>; logSpoolUsage: (spoolId: string, grams?: number) => Promise<Spool | undefined>; generateSpoolLabels: (ids?: string[]) => Promise<SpoolLabelExport>; scanSpool: (code: string, options?: { grams?: number; location?: string }) => Promise<SpoolScanResult>; createPurchaseRequest: (request: Omit<PurchaseRequest, "id">) => Promise<PurchaseRequest>; generateReorderPlan: (options?: { thresholdGrams?: number; targetGrams?: number; quantity?: number }) => Promise<ReorderPlanResult>; updatePurchaseRequest: (requestId: string, patch: Partial<PurchaseRequest>) => Promise<PurchaseRequest | undefined>; receivePurchaseRequest: (requestId: string, location?: string) => Promise<PurchaseReceiveResult>; addToast: (message: string, type?: Toast["type"]) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [scanCode, setScanCode] = useState(spools[0]?.nfc || "");
  const [scanLocation, setScanLocation] = useState("");
  const [logUsageOnScan, setLogUsageOnScan] = useState(true);
  const [lastScan, setLastScan] = useState<SpoolScanResult | null>(null);
  const reservedGrams = (spool: Spool) => Math.round(Number(spool.reserved || 0) || (spool.reservations || []).reduce((sum, item) => sum + Number(item.grams || 0), 0));
  const availableGrams = (spool: Spool) => Math.max(0, Math.round(Number(spool.remaining || 0) - reservedGrams(spool)));
  const lowStockSpools = spools.filter((spool) => availableGrams(spool) < 250);
  const openPurchaseRequests = purchaseRequests.filter((request) => request.status === "open" || request.status === "ordered");
  const addSpool = async () => {
    await createSpool({ material: "PLA", color: "#0ea5e9", brand: "Demo", remaining: 1000, weight: 1000, location: "Rack New", dry: true, nfc: "LP-NEW" });
    addToast("Spool added");
  };
  const createManualPurchase = async () => {
    const spool = lowStockSpools[0] || spools[0];
    if (!spool) return addToast("Add a spool before creating a purchase request", "warning");
    setBusy("manual-request");
    const request = await createPurchaseRequest({ spoolId: spool.id, material: spool.material, color: spool.color, brand: spool.brand, quantity: 1, targetGrams: spool.weight || 1000, supplier: "Preferred supplier", priority: "High", status: "open", due: "This week", note: `Manual reorder for ${spool.location}` });
    setBusy(null);
    addToast(`${request.material} purchase request created`);
  };
  const createReorders = async () => {
    setBusy("reorder-plan");
    const result = await generateReorderPlan({ thresholdGrams: 250, targetGrams: 1000, quantity: 1 });
    setBusy(null);
    addToast(`${result.created.length} reorder requests created${result.skipped.length ? `, ${result.skipped.length} skipped` : ""}`, result.created.length ? "success" : "info");
  };
  const markOrdered = async (request: PurchaseRequest) => {
    setBusy(`ordered-${request.id}`);
    await updatePurchaseRequest(request.id, { status: "ordered" });
    setBusy(null);
    addToast(`${request.material} request marked ordered`);
  };
  const receiveRequest = async (request: PurchaseRequest) => {
    setBusy(`receive-${request.id}`);
    const result = await receivePurchaseRequest(request.id, "Rack Receiving");
    setBusy(null);
    addToast(`${result.spools.length} ${request.material} spools received`);
  };
  const downloadLabels = async () => {
    setBusy("labels");
    try {
      const labels = await generateSpoolLabels(spools.map((spool) => spool.id));
      downloadTextFile(`layerpilot-spool-labels-${Date.now()}.html`, labels.html, "text/html");
      addToast(`${labels.count} spool labels generated`);
    } catch {
      addToast("Could not generate spool labels", "warning");
    } finally {
      setBusy(null);
    }
  };
  const runScan = async () => {
    if (!scanCode.trim()) {
      addToast("Enter a spool code first", "warning");
      return;
    }
    setBusy("scan");
    try {
      const result = await scanSpool(scanCode.trim(), { grams: logUsageOnScan ? 20 : undefined, location: scanLocation.trim() || undefined });
      setLastScan(result);
      addToast(result.usageLogged ? `${result.usageLogged}g logged for ${result.spool.material}` : `${result.spool.material} spool scanned`, result.warnings.length ? "warning" : "success");
    } catch {
      addToast("Spool scan did not match inventory", "warning");
    } finally {
      setBusy(null);
    }
  };
  return (
    <Page title="Filament inventory" kicker="Track spools, color, storage, low stock and NFC labels">
      <div className="metric-grid">
        <Metric label="Spools" value={`${spools.length}`} icon={CircleDot} />
        <Metric label="Low stock" value={`${lowStockSpools.length}`} icon={AlertTriangle} tone="orange" />
        <Metric label="Open reorders" value={`${openPurchaseRequests.length}`} icon={ShoppingBag} tone="teal" />
        <Metric label="Reserved" value={`${spools.reduce((sum, spool) => sum + reservedGrams(spool), 0)}g`} icon={Database} tone="gray" />
      </div>
      <div className="quickbar"><button className="primary" onClick={addSpool}><Plus size={16} />Add spool</button><button onClick={downloadLabels} disabled={busy === "labels"}><FileCode2 size={16} />{busy === "labels" ? "Generating labels" : "Generate labels"}</button><button onClick={createReorders} disabled={busy === "reorder-plan"}><ShoppingBag size={16} />{busy === "reorder-plan" ? "Creating reorders" : "Generate reorder plan"}</button><button onClick={createManualPurchase} disabled={busy === "manual-request"}><Plus size={16} />Purchase request</button></div>
      <section className="panel scanner-panel">
        <PanelTitle title="Spool scanner" />
        <div className="settings-grid">
          <label>Scan code<input value={scanCode} onChange={(event) => setScanCode(event.target.value)} placeholder="LP-PLA-001" /></label>
          <label>Move to location<input value={scanLocation} onChange={(event) => setScanLocation(event.target.value)} placeholder="Optional rack/bin" /></label>
          <label className="check-row"><input type="checkbox" checked={logUsageOnScan} onChange={(event) => setLogUsageOnScan(event.target.checked)} />Log 20g usage on scan</label>
        </div>
        <div className="quickbar"><button className="primary" onClick={runScan} disabled={busy === "scan"}><CircleDot size={16} />{busy === "scan" ? "Scanning" : "Scan spool"}</button></div>
        {lastScan && <div className={`notice ${lastScan.warnings.length ? "warning" : "success"}`}><Check size={18} /><span>{lastScan.spool.material} - {lastScan.spool.brand} matched by {lastScan.matchedBy}. Remaining {lastScan.spool.remaining}g. {lastScan.warnings.join(", ")}</span></div>}
      </section>
      <section className="panel">
        <PanelTitle title="Material purchasing" />
        <DataTable headers={["Material", "Supplier", "Qty", "Priority", "Status", "Due", "Actions"]}>
          {purchaseRequests.map((request) => (
            <tr key={request.id}>
              <td><b>{request.material}</b><small>{request.brand} - {request.targetGrams}g - {request.note || "Reorder request"}</small></td>
              <td>{request.supplier}</td>
              <td>{request.quantity}</td>
              <td><StatusPill status={request.priority} /></td>
              <td><StatusPill status={request.status} /></td>
              <td>{request.due}</td>
              <td><button onClick={() => markOrdered(request)} disabled={request.status !== "open" || busy === `ordered-${request.id}`}>{busy === `ordered-${request.id}` ? "Updating" : "Mark ordered"}</button><button className="primary" onClick={() => receiveRequest(request)} disabled={request.status === "received" || request.status === "cancelled" || busy === `receive-${request.id}`}>{busy === `receive-${request.id}` ? "Receiving" : "Receive"}</button></td>
            </tr>
          ))}
        </DataTable>
        {!purchaseRequests.length && <p className="muted">No purchase requests yet. Generate a reorder plan from low-stock spools.</p>}
      </section>
      <div className="spool-grid">
        {spools.map((spool) => {
          const reserved = reservedGrams(spool);
          const available = availableGrams(spool);
          return (
            <div className="spool-card" key={spool.id}>
              <div className="spool-color" style={{ background: spool.color }} />
              <h3>{spool.material} - {spool.brand}</h3>
              <p>{spool.location} - {spool.nfc}</p>
              <div className="progress"><span style={{ width: `${(spool.remaining / spool.weight) * 100}%` }} /></div>
              <strong>{spool.remaining}g / {spool.weight}g</strong>
              <div className="spool-stats">
                <span>Reserved <b>{reserved}g</b></span>
                <span>Available <b>{available}g</b></span>
              </div>
              {available < 150 && <em className="warning-text">{reserved > 0 ? "Low available stock" : "Low stock"}</em>}
              <label className="check-row"><input type="checkbox" checked={spool.dry} onChange={(e) => updateSpool(spool.id, { dry: e.target.checked })} />Dry storage</label>
              <button onClick={() => logSpoolUsage(spool.id, 20).then(() => addToast("20g usage logged"))}>Log 20g usage</button>
            </div>
          );
        })}
      </div>
    </Page>
  );
}

function ProfilesPage({ profiles, profileDefaults, profileMatchingPolicy, createProfile, importProfiles, archiveProfile, setDefaultProfile, saveProfilePolicy, addToast }: { profiles: Profile[]; profileDefaults: ProfileDefaults; profileMatchingPolicy: ProfileMatchingPolicy; createProfile: (draft: Omit<Profile, "id" | "updated">) => Promise<Profile>; importProfiles: (source: Profile["source"], content?: string, profiles?: Array<Omit<Profile, "id" | "updated">>) => Promise<{ imported: Profile[]; skipped: Array<{ name: string; reason: string }>; profiles: Profile[] }>; archiveProfile: (profileId: string) => Promise<boolean>; setDefaultProfile: (profileId: string) => Promise<{ profile: Profile; profileDefaults: ProfileDefaults; profiles: Profile[] } | undefined>; saveProfilePolicy: (patch: Partial<ProfileMatchingPolicy>) => Promise<ProfileMatchingPolicy | undefined>; addToast: (message: string, type?: Toast["type"]) => void }) {
  const [kind, setKind] = useState<"All" | Profile["kind"]>("All");
  const [policyDraft, setPolicyDraft] = useState(profileMatchingPolicy);
  const [busy, setBusy] = useState<"default" | "policy" | null>(null);
  const visible = profiles.filter((profile) => kind === "All" || profile.kind === kind);
  useEffect(() => setPolicyDraft(profileMatchingPolicy), [profileMatchingPolicy]);
  const orcaProfileText = [
    "[print]",
    "name = 0.16mm quality plate",
    "layer_height = 0.16",
    "infill = 18",
    "",
    "[filament]",
    "name = PETG production orange",
    "filament_type = PETG",
    "temperature = 245"
  ].join("\n");
  const importProfile = async (source: Profile["source"]) => {
    if (source === "Manual") {
      const created = await createProfile({ name: "Manual production override", kind: "Filament", target: "Selected spools", source, settings: { notes: "Operator-created default" } });
      addToast(`${created.name} profile created`);
      return;
    }
    const result = source === "Bambu sync"
      ? await importProfiles(source, undefined, [{ name: "A1 high-speed PLA", kind: "Machine", target: "Bambu-style bridge", source, settings: { printer_model: "A1", max_speed: 300 } }])
      : await importProfiles(source, orcaProfileText);
    addToast(`${result.imported.length} profiles imported${result.skipped.length ? `, ${result.skipped.length} skipped` : ""}`, result.imported.length ? "success" : "warning");
  };
  const archive = async (profile: Profile) => {
    const ok = await archiveProfile(profile.id);
    addToast(ok ? `${profile.name} archived` : `${profile.name} archive failed`, ok ? "success" : "warning");
  };
  const makeDefault = async (profile: Profile) => {
    setBusy("default");
    const result = await setDefaultProfile(profile.id);
    setBusy(null);
    addToast(result ? `${profile.name} set as default ${profile.kind} profile` : `${profile.name} default saved locally only`, result ? "success" : "warning");
  };
  const savePolicy = async () => {
    setBusy("policy");
    const saved = await saveProfilePolicy(policyDraft);
    setBusy(null);
    addToast(saved ? "Profile matching policy saved" : "Profile matching policy saved locally only", saved ? "success" : "warning");
  };
  const rulesActive = Object.entries(policyDraft).filter(([key, value]) => typeof value === "boolean" && value && key !== "updatedAt").length;
  return (
    <Page title="Profiles" kicker="Machine, process, filament, and matching rules">
      <div className="metric-grid">
        <Metric label="Machine profiles" value={`${profiles.filter((profile) => profile.kind === "Machine").length}`} icon={Box} />
        <Metric label="Process presets" value={`${profiles.filter((profile) => profile.kind === "Process").length}`} icon={SlidersHorizontal} tone="teal" />
        <Metric label="Filament presets" value={`${profiles.filter((profile) => profile.kind === "Filament").length}`} icon={CircleDot} tone="orange" />
        <Metric label="Sync sources" value="3" icon={Cloud} tone="green" />
        <Metric label="Rules active" value={`${rulesActive}`} icon={Sparkles} tone="gray" />
      </div>
      <div className="toolbar">
        <select value={kind} onChange={(event) => setKind(event.target.value as "All" | Profile["kind"])}>
          <option>All</option>
          <option>Machine</option>
          <option>Process</option>
          <option>Filament</option>
        </select>
        <button className="primary" onClick={() => importProfile("Orca import")}><Upload size={16} />Import Orca profile</button>
        <button onClick={() => importProfile("Bambu sync")}><RefreshCw size={16} />Sync Bambu profiles</button>
        <button onClick={() => importProfile("Manual")}><Plus size={16} />Manual profile</button>
      </div>
      <DataTable headers={["Profile", "Type", "Target", "Source", "Updated", "Actions"]}>
        {visible.map((profile) => (
          <tr key={profile.id}>
            <td><b>{profile.name}</b><small>{profileDefaults[profile.kind] === profile.id ? "Default for this profile type" : "Used by queue matching and slicer defaults"}</small></td>
            <td><StatusPill status={profile.kind} /></td>
            <td>{profile.target}</td>
            <td>{profile.source}</td>
            <td>{profile.updated}</td>
            <td><button onClick={() => makeDefault(profile)} disabled={busy === "default" || profileDefaults[profile.kind] === profile.id}>{profileDefaults[profile.kind] === profile.id ? "Default" : "Set default"}</button><button onClick={() => archive(profile)}>Archive</button></td>
          </tr>
        ))}
      </DataTable>
      <section className="panel">
        <PanelTitle title="Automatic matching policy" action={<button onClick={savePolicy} disabled={busy === "policy"}><Save size={16} />{busy === "policy" ? "Saving" : "Save rules"}</button>} />
        <div className="settings-grid">
          <label className="check-row"><input type="checkbox" checked={policyDraft.materialCompatibility} onChange={(event) => setPolicyDraft({ ...policyDraft, materialCompatibility: event.target.checked })} />Enforce material compatibility</label>
          <label className="check-row"><input type="checkbox" checked={policyDraft.processFallback} onChange={(event) => setPolicyDraft({ ...policyDraft, processFallback: event.target.checked })} />Allow closest process fallback</label>
          <label className="check-row"><input type="checkbox" checked={policyDraft.commercialPriority} onChange={(event) => setPolicyDraft({ ...policyDraft, commercialPriority: event.target.checked })} />Commercial due-date priority</label>
          <label className="check-row"><input type="checkbox" checked={policyDraft.warnBeforeFallback} onChange={(event) => setPolicyDraft({ ...policyDraft, warnBeforeFallback: event.target.checked })} />Warn before fallback starts</label>
          <label>Due window hours<input type="number" min="1" max="168" value={policyDraft.dueWindowHours} onChange={(event) => setPolicyDraft({ ...policyDraft, dueWindowHours: Number(event.target.value) })} /></label>
        </div>
        <div className="rule-grid">
          <div className="rule-card"><b>Material compatibility</b><span>Only match jobs to printers with compatible nozzle, bed, chamber, and loaded spool profile.</span><em>{policyDraft.materialCompatibility ? "Required for auto-queue" : "Operator warning only"}</em></div>
          <div className="rule-card"><b>Process fallback</b><span>Use closest layer-height process when an exact profile is missing.</span><em>{policyDraft.processFallback ? "Fallback enabled" : "Exact profile required"}</em></div>
          <div className="rule-card"><b>Commercial priority</b><span>Paid orders can override classroom and low-priority queues when due dates are close.</span><em>{policyDraft.dueWindowHours}-hour due window</em></div>
        </div>
      </section>
    </Page>
  );
}

function AddonsPage({ addons, updateAddon, addToast, costCatalog, saveCostCatalog }: { addons: Addon[]; updateAddon: (addonId: string, patch: Partial<Pick<Addon, "status" | "enabled" | "config">> & { note?: string }) => Promise<Addon | undefined>; addToast: (message: string, type?: Toast["type"]) => void; costCatalog: CostCatalog; saveCostCatalog: (patch: Partial<CostCatalog>) => Promise<CostCatalog | undefined> }) {
  const [draft, setDraft] = useState(costCatalog);
  const [busyAddon, setBusyAddon] = useState("");
  const mqttAddon = addons.find((addon) => addon.id === "mqtt");
  const [mqttDraft, setMqttDraft] = useState({ brokerUrl: "", topicPrefix: "layerpilot", events: "*", qos: 0, retain: false, username: "", password: "" });
  const fallbackAuditEvents = useMemo<AuditEvent[]>(() => auditSeed.map((message, index) => ({ id: `seed-audit-${index}`, type: "demo.audit", message, at: new Date(Date.now() - (index + 2) * 60_000).toISOString(), data: {} })), []);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(fallbackAuditEvents);
  const [auditTotal, setAuditTotal] = useState(fallbackAuditEvents.length);
  const [auditMatched, setAuditMatched] = useState(fallbackAuditEvents.length);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditFilter, setAuditFilter] = useState("all");
  const [auditSearch, setAuditSearch] = useState("");
  const auditPageSize = 8;
  const enabledCount = addons.filter((addon) => addon.status === "enabled" || addon.enabled).length;
  useEffect(() => setDraft(costCatalog), [costCatalog]);
  useEffect(() => {
    const config = mqttAddon?.config || {};
    const events = Array.isArray(config.events) ? config.events.join(",") : String(config.events || "*");
    setMqttDraft({
      brokerUrl: String(config.brokerUrl || ""),
      topicPrefix: String(config.topicPrefix || "layerpilot"),
      events,
      qos: Number(config.qos || 0),
      retain: config.retain === true,
      username: String(config.username || ""),
      password: ""
    });
  }, [mqttAddon?.config, mqttAddon?.id]);
  useEffect(() => {
    const query = new URLSearchParams({ limit: String(auditPageSize) });
    if (auditFilter !== "all") query.set("type", auditFilter);
    if (auditSearch.trim()) query.set("search", auditSearch.trim());
    setAuditLoading(true);
    apiRequest<AuditResponse>(`/api/audit?${query.toString()}`).then((result) => {
      setAuditTotal(result.total);
      setAuditMatched(result.matched ?? result.events.length);
      setAuditHasMore(Boolean(result.hasMore));
      setAuditEvents(result.events);
    }).catch(() => {
      setAuditTotal(fallbackAuditEvents.length);
      setAuditMatched(fallbackAuditEvents.length);
      setAuditHasMore(false);
      setAuditEvents(fallbackAuditEvents);
    }).finally(() => setAuditLoading(false));
  }, [auditFilter, auditSearch, fallbackAuditEvents]);
  const loadMoreAudit = async () => {
    const query = new URLSearchParams({ limit: String(auditPageSize), offset: String(auditEvents.length) });
    if (auditFilter !== "all") query.set("type", auditFilter);
    if (auditSearch.trim()) query.set("search", auditSearch.trim());
    setAuditLoading(true);
    try {
      const result = await apiRequest<AuditResponse>(`/api/audit?${query.toString()}`);
      setAuditTotal(result.total);
      setAuditMatched(result.matched ?? auditMatched);
      setAuditHasMore(Boolean(result.hasMore));
      setAuditEvents((current) => [...current, ...result.events]);
    } finally {
      setAuditLoading(false);
    }
  };
  const toggle = async (addon: Addon) => {
    const isEnabled = addon.status === "enabled" || addon.enabled;
    setBusyAddon(addon.id);
    const updated = await updateAddon(addon.id, { enabled: !isEnabled, note: "Marketplace toggle" });
    setBusyAddon("");
    addToast(`${addon.name} ${updated ? updated.status : isEnabled ? "disabled locally" : "enabled locally"}`, updated ? "success" : "warning");
  };
  const setRate = (material: string, value: number) => setDraft((current) => ({ ...current, materialRates: { ...current.materialRates, [material]: value } }));
  const saveFormula = async () => {
    const saved = await saveCostCatalog(draft);
    addToast(saved ? "Cost formula saved" : "Cost formula saved locally only", saved ? "success" : "warning");
  };
  const saveMqtt = async () => {
    const config: Record<string, string | number | boolean | string[]> = {
      brokerUrl: mqttDraft.brokerUrl.trim(),
      topicPrefix: mqttDraft.topicPrefix.trim() || "layerpilot",
      events: mqttDraft.events.split(",").map((event) => event.trim()).filter(Boolean),
      qos: Math.min(Math.max(Number(mqttDraft.qos || 0), 0), 2),
      retain: mqttDraft.retain,
      username: mqttDraft.username.trim()
    };
    if (mqttDraft.password) config.password = mqttDraft.password;
    const saved = await updateAddon("mqtt", { enabled: true, config, note: "MQTT broker configured" });
    addToast(saved ? "MQTT event stream configured" : "MQTT settings saved locally only", saved ? "success" : "warning");
    if (saved) setMqttDraft((current) => ({ ...current, password: "" }));
  };
  const exportAudit = async () => {
    const query = new URLSearchParams({ limit: "500" });
    if (auditFilter !== "all") query.set("type", auditFilter);
    if (auditSearch.trim()) query.set("search", auditSearch.trim());
    try {
      const token = typeof window !== "undefined" ? window.localStorage.getItem("layerpilot-token") : "";
      const response = await fetch(`${API_BASE}/api/audit/export?${query.toString()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) throw new Error(`Audit export failed ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `layerpilot-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      addToast("Audit CSV downloaded", "success");
    } catch {
      downloadCsvFile("layerpilot-audit-local.csv", auditEvents.map((event) => ({ id: event.id, type: event.type, message: event.message, at: event.at })));
      addToast("Audit CSV exported from visible records", "warning");
    }
  };
  const auditAge = (at: string) => {
    const diff = Date.now() - new Date(at).getTime();
    if (!Number.isFinite(diff) || diff < 60_000) return "just now";
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };
  return (
    <Page title="Add-ons" kicker="Optional modules for production, commerce, automation, and governance">
      <div className="metric-grid">
        <Metric label="Enabled modules" value={`${enabledCount}`} icon={Store} />
        <Metric label="Commerce channels" value="4" icon={ShoppingBag} tone="green" />
        <Metric label="Audit records" value={auditTotal.toLocaleString()} icon={Shield} tone="teal" />
        <Metric label="Cost models" value="6" icon={Database} tone="orange" />
        <Metric label="Automations" value="12" icon={Sparkles} tone="gray" />
      </div>
      <div className="integration-grid">
        {addons.map((addon) => {
          const isEnabled = addon.status === "enabled" || addon.enabled;
          return (
            <div className="integration-card" key={addon.id}>
              <Store />
              <h3>{addon.name}</h3>
              <p>{addon.description}</p>
              <small>{addon.category}{addon.updatedBy ? ` - updated by ${addon.updatedBy}` : ""}</small>
              <StatusPill status={addon.status} />
              <button className={isEnabled ? "selected" : ""} onClick={() => toggle(addon)} disabled={busyAddon === addon.id}>{busyAddon === addon.id ? "Saving" : isEnabled ? "Disable" : "Enable"}</button>
            </div>
          );
        })}
      </div>
      <section className="panel">
        <PanelTitle title="MQTT event stream" action={<button onClick={saveMqtt}><Save size={16} />Save MQTT</button>} />
        <div className="toolbar">
          <input value={mqttDraft.brokerUrl} onChange={(event) => setMqttDraft({ ...mqttDraft, brokerUrl: event.target.value })} placeholder="mqtt://broker.local:1883" />
          <input value={mqttDraft.topicPrefix} onChange={(event) => setMqttDraft({ ...mqttDraft, topicPrefix: event.target.value })} placeholder="layerpilot" />
          <input value={mqttDraft.events} onChange={(event) => setMqttDraft({ ...mqttDraft, events: event.target.value })} placeholder="*, printer.*, queue.status" />
        </div>
        <div className="toolbar compact">
          <label>QoS<select value={mqttDraft.qos} onChange={(event) => setMqttDraft({ ...mqttDraft, qos: Number(event.target.value) })}><option value={0}>0</option><option value={1}>1</option><option value={2}>2</option></select></label>
          <label className="check-row"><input type="checkbox" checked={mqttDraft.retain} onChange={(event) => setMqttDraft({ ...mqttDraft, retain: event.target.checked })} />Retain messages</label>
          <input value={mqttDraft.username} onChange={(event) => setMqttDraft({ ...mqttDraft, username: event.target.value })} placeholder="Username" />
          <input type="password" value={mqttDraft.password} onChange={(event) => setMqttDraft({ ...mqttDraft, password: event.target.value })} placeholder={mqttAddon?.config?.hasPassword ? "Password stored" : "Password"} />
        </div>
        <p className="muted">Publishes matching production events to <code>{mqttDraft.topicPrefix || "layerpilot"}/events/&lt;event.type&gt;</code> when the MQTT add-on is enabled.</p>
      </section>
      <div className="split">
        <section className="panel">
          <PanelTitle title="Cost catalog" action={<button onClick={saveFormula}><Save size={16} />Save formula</button>} />
          <DataTable headers={["Cost input", "Value", "Applied to"]}>
            {Object.entries(draft.materialRates).map(([material, rate]) => <tr key={material}><td>{material} material</td><td><input type="number" min="0" step="0.01" value={rate} onChange={(event) => setRate(material, Number(event.target.value))} /> / 100g</td><td>FDM, resin, quotes</td></tr>)}
            <tr><td>Machine time</td><td><input type="number" min="0" step="1" value={draft.machineHourlyRate} onChange={(event) => setDraft({ ...draft, machineHourlyRate: Number(event.target.value) })} /> / hour</td><td>Print estimates</td></tr>
            <tr><td>Handling labor</td><td><input type="number" min="0" step="1" value={draft.laborPerOrder} onChange={(event) => setDraft({ ...draft, laborPerOrder: Number(event.target.value) })} /> / order</td><td>Shopify, Etsy, Manual</td></tr>
            <tr><td>Failure reserve</td><td><input type="number" min="0" max="100" step="1" value={draft.failureReservePercent} onChange={(event) => setDraft({ ...draft, failureReservePercent: Number(event.target.value) })} />%</td><td>All production SKUs</td></tr>
            <tr><td>Overhead</td><td><input type="number" min="0" max="100" step="1" value={draft.overheadPercent} onChange={(event) => setDraft({ ...draft, overheadPercent: Number(event.target.value) })} />%</td><td>Workspace-wide</td></tr>
            <tr><td>Minimum quote</td><td><input type="number" min="0" step="1" value={draft.minimumQuote} onChange={(event) => setDraft({ ...draft, minimumQuote: Number(event.target.value) })} /> {draft.currency}</td><td>Every generated quote</td></tr>
          </DataTable>
        </section>
        <section className="panel">
          <PanelTitle title="Audit timeline" action={<button onClick={exportAudit}><Download size={16} />Export</button>} />
          <div className="toolbar compact">
            <select value={auditFilter} onChange={(event) => setAuditFilter(event.target.value)}>
              <option value="all">All events</option>
              <option value="auth">Auth</option>
              <option value="queue">Queue</option>
              <option value="printer">Printers</option>
              <option value="file">Files</option>
              <option value="commerce">Commerce</option>
              <option value="settings">Settings</option>
              <option value="cost_catalog.updated">Cost catalog</option>
            </select>
            <label className="search-box"><Search size={15} /><input value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="Search audit" /></label>
          </div>
          <p className="muted">{auditMatched.toLocaleString()} matching event{auditMatched === 1 ? "" : "s"}{auditMatched !== auditTotal ? ` of ${auditTotal.toLocaleString()} total` : ""}</p>
          <div className="event-feed">
            {auditEvents.map((event, index) => <div key={event.id}><StatusDot status={index === 0 ? "queued" : "complete"} /><span><b>{event.type}</b> - {event.message}</span><em>{auditAge(event.at)}</em></div>)}
            {!auditEvents.length && <div><StatusDot status="queued" /><span>No audit events match the current filters</span><em>0 records</em></div>}
          </div>
          {auditHasMore && <button className="wide-action" onClick={loadMoreAudit} disabled={auditLoading}>{auditLoading ? "Loading" : "Load more audit events"}</button>}
        </section>
      </div>
    </Page>
  );
}

function AnalyticsPage({ addToast }: { addToast: (message: string, type?: Toast["type"]) => void }) {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  useEffect(() => {
    apiRequest<AnalyticsSummary>("/api/analytics").then(setAnalytics).catch(() => undefined);
  }, []);
  const rows = analytics?.daily?.length ? analytics.daily : chartData;
  const mix = analytics
    ? Object.entries(analytics.materialMix).map(([name, value], index) => ({ name, value, color: ["#2563eb", "#f97316", "#14b8a6", "#64748b", "#16a34a"][index % 5] }))
    : materialData;
  const exportCsv = () => {
    const summary = analytics || { jobs: 217, completed: 208, failed: 9, successRate: 96, utilization: 64, cost: 1245, printHours: 337, wasteGrams: 0, wasteCost: 0, active: 0, queued: 0, materialMix: {}, daily: rows };
    downloadCsvFile("layerpilot-analytics.csv", [
      { metric: "jobs", value: summary.jobs },
      { metric: "completed", value: summary.completed },
      { metric: "failed", value: summary.failed },
      { metric: "successRate", value: summary.successRate },
      { metric: "utilization", value: summary.utilization },
      { metric: "cost", value: summary.cost },
      { metric: "printHours", value: summary.printHours },
      { metric: "wasteGrams", value: summary.wasteGrams || 0 },
      { metric: "wasteCost", value: summary.wasteCost || 0 }
    ]);
    addToast("Analytics CSV exported", "info");
  };
  return (
    <Page title="Analytics" kicker="Success, utilization, material, cost and exports">
      <div className="toolbar"><select><option>Past 7 days</option><option>Past month</option><option>Custom range</option></select><select><option>All printers</option><option>Forge A1</option><option>Print Farm</option></select><select><option>All materials</option><option>PLA</option><option>PETG</option></select><button onClick={exportCsv}><Download size={16} />Export CSV</button></div>
      <div className="metric-grid"><Metric label="Print jobs" value={String(analytics?.jobs ?? 217)} icon={ClipboardList} /><Metric label="Success rate" value={`${analytics?.successRate ?? 96}%`} icon={Check} tone="green" /><Metric label="Utilization" value={`${analytics?.utilization ?? 64}%`} icon={Gauge} tone="teal" /><Metric label="Cost" value={`$${analytics?.cost ?? 1245}`} icon={Database} tone="orange" /><Metric label="Waste" value={`${analytics?.wasteGrams ?? 0}g`} icon={AlertTriangle} tone="red" /></div>
      <div className="split">
        <section className="panel"><PanelTitle title="Jobs and print hours" /><ResponsiveContainer width="100%" height={280}><BarChart data={rows}><CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" /><XAxis dataKey="day" /><YAxis /><Tooltip /><Bar dataKey="jobs" fill="#2563eb" /><Bar dataKey="hours" fill="#14b8a6" /></BarChart></ResponsiveContainer></section>
        <section className="panel"><PanelTitle title="Material mix" /><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={mix} dataKey="value" nameKey="name" outerRadius={90} label>{mix.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></section>
      </div>
      <div className="split">
        <section className="panel">
          <PanelTitle title="Failure intelligence" action={<strong>${analytics?.wasteCost ?? 0} waste cost</strong>} />
          <div className="event-feed">
            {(analytics?.rootCauses || []).map((cause) => <div key={cause.label}><StatusDot status="failed" /><span>{cause.label}</span><em>{cause.count} job{cause.count === 1 ? "" : "s"}</em></div>)}
            {!(analytics?.rootCauses || []).length && <div><StatusDot status="queued" /><span>No failure records yet</span><em>Flag failed prints from history</em></div>}
          </div>
        </section>
        <section className="panel">
          <PanelTitle title="Waste by printer" />
          <div className="event-feed">
            {(analytics?.printerReliability || []).slice(0, 6).map((printer) => <div key={printer.printerId}><StatusDot status={printer.successRate >= 95 ? "complete" : "failed"} /><span>{printer.printer}</span><em>{printer.successRate}% success - {printer.wasteGrams}g waste - ${printer.wasteCost}</em></div>)}
          </div>
        </section>
      </div>
      <section className="panel"><PanelTitle title="Success trend" /><ResponsiveContainer width="100%" height={220}><LineChart data={rows}><CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" /><XAxis dataKey="day" /><YAxis domain={[80, 100]} /><Tooltip /><Line type="monotone" dataKey="success" stroke="#16a34a" strokeWidth={3} /></LineChart></ResponsiveContainer></section>
    </Page>
  );
}

function HistoryPage({ setQueue, printers, addToast, setBackendStatus }: { setQueue: React.Dispatch<React.SetStateAction<QueueItem[]>>; printers: Printer[]; addToast: (message: string, type?: Toast["type"]) => void; setBackendStatus: React.Dispatch<React.SetStateAction<"local" | "connected">> }) {
  const [history, setHistory] = useState<HistoryRecord[]>(() => historySeed.map((item, index) => ({ id: `seed-${index}`, ...item, status: item.status as JobStatus })));
  useEffect(() => {
    apiRequest<HistoryRecord[]>("/api/history").then((records) => {
      if (records.length) setHistory(records);
      setBackendStatus("connected");
    }).catch(() => setBackendStatus("local"));
  }, [setBackendStatus]);
  const reprint = async (item: HistoryRecord) => {
    const printer = printers[0];
    if (!item.id.startsWith("seed-")) {
      try {
        const result = await apiRequest<{ job: QueueItem }>(`/api/history/${item.id}/reprint`, {
          method: "POST",
          body: JSON.stringify({ due: "Tomorrow 12:00", priority: "Normal", printerId: printer?.id })
        });
        setQueue((items) => [...items, result.job]);
        setBackendStatus("connected");
        addToast("Reprint added to queue");
        return;
      } catch {
        setBackendStatus("local");
      }
    }
    if (!printer) return addToast("No printer available for reprint", "warning");
    setQueue((items) => [...items, { id: crypto.randomUUID(), fileId: "history", file: item.file, printerId: printer.id, printer: printer.name, status: "queued", priority: "Normal", stage: "needs scheduling", material: item.material, color: "Any", due: "Tomorrow 12:00", dimensions: [120, 90, 45], assignee: "Scheduler", time: item.duration, cost: item.cost, added: "Just now" }]);
    addToast("Reprint added locally");
  };
  const updateHistory = async (item: HistoryRecord, patch: Partial<HistoryRecord>, label: string) => {
    setHistory((records) => records.map((record) => record.id === item.id ? { ...record, ...patch } : record));
    if (item.id.startsWith("seed-")) {
      addToast(`${label} saved locally`, "warning");
      return;
    }
    try {
      const result = await apiRequest<{ historyRecord: HistoryRecord; history: HistoryRecord[] }>(`/api/history/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      if (result.historyRecord) setHistory((records) => records.map((record) => record.id === item.id ? result.historyRecord : record));
      else if (result.history?.length) setHistory(result.history);
      setBackendStatus("connected");
      addToast(`${label} saved`, "success");
    } catch {
      setBackendStatus("local");
      addToast(`${label} could not be saved to history`, "warning");
    }
  };
  const flagIssue = (item: HistoryRecord) => updateHistory(item, {
    issueTag: "Needs review",
    issueSeverity: item.status === "failed" ? "High" : "Medium",
    failureReason: item.failureReason || item.note || "Operator flagged for review",
    failureCategory: item.failureCategory || "Print quality",
    rootCause: item.rootCause || item.failureReason || item.note || "Operator flagged for review",
    correctiveAction: item.correctiveAction || "Review setup, material condition, and first-layer result before reprint",
    wasteGrams: item.wasteGrams || Math.max(1, Math.round(item.cost || 1))
  }, "Issue tag");
  return (
    <Page title="Print history" kicker="Review, annotate, and reprint previous jobs">
      <div className="metric-grid"><Metric label="History jobs" value={String(history.length)} icon={ListChecks} /><Metric label="Flagged" value={String(history.filter((job) => job.issueTag || job.failureReason).length)} icon={AlertTriangle} tone="orange" /><Metric label="Waste" value={`${history.reduce((sum, job) => sum + Number(job.wasteGrams || 0), 0)}g`} icon={Database} tone="red" /><Metric label="Waste cost" value={`$${Math.round(history.reduce((sum, job) => sum + Number(job.wasteCost || 0), 0) * 100) / 100}`} icon={Gauge} tone="orange" /></div>
      <DataTable headers={["File", "Printer", "Status", "Duration", "Material", "Waste", "Root cause", "Date", "Notes", "Actions"]}>
        {history.map((job) => <tr key={job.id}><td><b>{job.file}</b>{job.issueTag && <small>{job.issueTag} - {job.issueSeverity || "Medium"}</small>}</td><td>{job.printer}</td><td><StatusPill status={job.status} /></td><td>{job.duration}</td><td>{job.material}</td><td>{Number(job.wasteGrams || 0)}g<small>${Number(job.wasteCost || 0)}</small></td><td>{job.rootCause || job.failureCategory || "None"}{job.correctiveAction && <small>{job.correctiveAction}</small>}</td><td>{job.date}</td><td><input defaultValue={job.note} onBlur={(event) => event.target.value !== job.note && updateHistory(job, { note: event.target.value }, "History note")} /></td><td><button onClick={() => reprint(job)}>Reprint</button><button onClick={() => flagIssue(job)}>Flag</button></td></tr>)}
      </DataTable>
    </Page>
  );
}

function MaintenancePage({ jobs, templates, reports, createJob, updateJob, saveTemplate, reportProblem, addToast }: { jobs: MaintenanceJob[]; templates: MaintenanceTemplate[]; reports: MaintenanceReport[]; createJob: (job: Omit<MaintenanceJob, "id">) => Promise<MaintenanceJob>; updateJob: (jobId: string, patch: Partial<MaintenanceJob>) => Promise<MaintenanceJob | undefined>; saveTemplate: (draft: Omit<MaintenanceTemplate, "id" | "createdAt" | "updatedAt">) => Promise<MaintenanceTemplate>; reportProblem: (draft: { title: string; printer: string; description: string; severity: MaintenanceJob["severity"]; createJob: boolean }) => Promise<{ report: MaintenanceReport; job?: MaintenanceJob | null; reports: MaintenanceReport[]; maintenance: MaintenanceJob[] }>; addToast: (message: string, type?: Toast["type"]) => void }) {
  const [busy, setBusy] = useState("");
  const add = async () => {
    await createJob({ title: "Extruder calibration", printer: "Forge A1", status: "scheduled", due: "Next week", progress: "0/4", severity: "Medium" });
    addToast("Maintenance job created");
  };
  const complete = async (job: MaintenanceJob) => {
    await updateJob(job.id, { status: "done", progress: "Complete" });
    addToast(`${job.title} completed`);
  };
  const saveDefaultTemplate = async () => {
    setBusy("template");
    const template = await saveTemplate({ title: "Nozzle and motion service", printerModel: "FDM fleet", intervalDays: 30, tasks: ["Inspect nozzle", "Clean extruder gears", "Lubricate rails", "Run calibration print"], severity: "Medium" });
    setBusy("");
    addToast(`${template.title} template saved`);
  };
  const reportDefaultProblem = async () => {
    setBusy("report");
    const result = await reportProblem({ title: "Layer shift reported", printer: "Forge A1", description: "Operator reported layer shift during production; inspect belts and motion system.", severity: "High", createJob: true });
    setBusy("");
    addToast(`${result.report.title} reported${result.job ? " and maintenance job created" : ""}`, "warning");
  };
  return (
    <Page title="Maintenance" kicker="Jobs, templates, schedules, inventory and problems">
      <div className="metric-grid"><Metric label="In maintenance" value={`${jobs.filter((job) => job.status === "in progress").length}`} icon={HardDrive} /><Metric label="Due soon" value={`${jobs.filter((job) => job.due.includes("Today") || job.due.includes("week")).length}`} icon={CalendarClock} tone="orange" /><Metric label="Open problems" value={`${reports.filter((report) => report.status === "open").length}`} icon={AlertTriangle} tone="red" /><Metric label="Templates" value={`${templates.length}`} icon={Archive} tone="gray" /></div>
      <div className="quickbar"><button className="primary" onClick={add}><Plus size={16} />New job</button><button onClick={saveDefaultTemplate} disabled={busy === "template"}>{busy === "template" ? "Saving..." : "Save template"}</button><button onClick={reportDefaultProblem} disabled={busy === "report"}>{busy === "report" ? "Reporting..." : "Report problem"}</button></div>
      <DataTable headers={["Task", "Printer", "Status", "Due", "Progress", "Severity", "Actions"]}>
        {jobs.map((job) => <tr key={job.id}><td><b>{job.title}</b></td><td>{job.printer}</td><td><StatusPill status={job.status} /></td><td>{job.due}</td><td>{job.progress}</td><td>{job.severity}</td><td><button onClick={() => complete(job)}>Complete</button></td></tr>)}
      </DataTable>
      <div className="split"><section className="panel"><PanelTitle title="Active schedules" /><ul className="plain-list">{templates.map((template) => <li key={template.id}>{template.title} - {template.printerModel} - every {template.intervalDays} days</li>)}{!templates.length && <li>No saved templates yet</li>}</ul></section><section className="panel"><PanelTitle title="Open problem reports" /><ul className="plain-list">{reports.slice(0, 6).map((report) => <li key={report.id}>{report.title} - {report.printer} - {report.severity}</li>)}{!reports.length && <li>No open problem reports</li>}</ul></section></div>
    </Page>
  );
}

function TeamPage({ users, createUser, updateUser, resetUserPassword, addToast }: { users: User[]; createUser: (draft: Omit<User, "id" | "lastSeen"> & { password?: string }) => Promise<{ user: User; temporaryPassword?: string }>; updateUser: (userId: string, patch: Partial<User>) => Promise<User | undefined>; resetUserPassword: (userId: string) => Promise<{ user?: User; temporaryPassword?: string }>; addToast: (message: string, type?: Toast["type"]) => void }) {
  const [draft, setDraft] = useState({ name: "New Operator", email: "operator@layerpilot.test", role: "Operator" as Role, location: "Studio North" });
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const invite = async () => {
    const result = await createUser(draft);
    setTemporaryPassword(result.temporaryPassword || "");
    addToast(`${result.user.email} invited as ${result.user.role}`, result.temporaryPassword ? "success" : "warning");
  };
  const updateRole = async (user: User, role: Role) => {
    const updated = await updateUser(user.id, { role });
    addToast(updated ? `${updated.email} role updated` : "Role update failed", updated ? "success" : "warning");
  };
  const updateLocation = async (user: User, location: string) => {
    const updated = await updateUser(user.id, { location });
    addToast(updated ? `${updated.email} location updated` : "Location update failed", updated ? "success" : "warning");
  };
  const resetPassword = async (user: User) => {
    const result = await resetUserPassword(user.id);
    setTemporaryPassword(result.temporaryPassword || "");
    addToast(result.temporaryPassword ? `${user.email} password reset` : "Password reset failed", result.temporaryPassword ? "success" : "warning");
  };
  return (
    <Page title="Team and permissions" kicker="Organization, locations, roles and access">
      <section className="panel">
        <PanelTitle title="Invite teammate" action={<button className="primary" onClick={invite}><Plus size={16} />Invite user</button>} />
        <div className="toolbar">
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Name" />
          <input value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="email@studio.test" />
          <select value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value as Role })}>{roles.map((role) => <option key={role}>{role}</option>)}</select>
          <input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Location" />
        </div>
        {temporaryPassword && <div className="notice success"><KeyRound size={18} /><span>Temporary password for this invite:</span><code>{temporaryPassword}</code></div>}
      </section>
      <DataTable headers={["Name", "Email", "Role", "Location", "Last seen", "Access"]}>{users.map((u) => <tr key={u.id}><td><b>{u.name}</b>{u.passwordResetRequired && <em className="warning-text">Password reset required</em>}</td><td>{u.email}</td><td><select value={u.role} onChange={(e) => updateRole(u, e.target.value as Role)}>{roles.map((r) => <option key={r}>{r}</option>)}</select></td><td><input defaultValue={u.location} onBlur={(event) => event.target.value !== u.location && updateLocation(u, event.target.value)} /></td><td>{u.lastSeen}</td><td><button onClick={() => resetPassword(u)}><KeyRound size={16} />Reset password</button></td></tr>)}</DataTable>
      <section className="panel"><PanelTitle title="Permission matrix" /><DataTable headers={["Capability", "Owner", "Admin", "Operator", "Viewer", "Student"]}>{["Start prints", "Delete files", "Manage billing", "Invite users", "View analytics", "Create maintenance jobs"].map((cap, i) => <tr key={cap}><td>{cap}</td>{roles.map((r, idx) => <td key={r}>{idx <= (i < 2 ? 2 : i === 2 ? 0 : i === 3 ? 1 : 4) ? <Check size={16} /> : "-"}</td>)}</tr>)}</DataTable></section>
    </Page>
  );
}

function IntegrationsPage({ apiKeys, setApiKeys, webhooks, setWebhooks, webhookDeliveries, setWebhookDeliveries, bridges, setBridges, printers, setPrinters, addToast, setBackendStatus }: { apiKeys: ApiKey[]; setApiKeys: React.Dispatch<React.SetStateAction<ApiKey[]>>; webhooks: Webhook[]; setWebhooks: React.Dispatch<React.SetStateAction<Webhook[]>>; webhookDeliveries: WebhookDelivery[]; setWebhookDeliveries: React.Dispatch<React.SetStateAction<WebhookDelivery[]>>; bridges: Bridge[]; setBridges: React.Dispatch<React.SetStateAction<Bridge[]>>; printers: Printer[]; setPrinters: React.Dispatch<React.SetStateAction<Printer[]>>; addToast: (message: string, type?: Toast["type"]) => void; setBackendStatus: React.Dispatch<React.SetStateAction<"local" | "connected">> }) {
  const [bridgeDraft, setBridgeDraft] = useState({ printerId: printers[0]?.id || "", kind: "octoprint" as Bridge["kind"], name: "Production bridge", baseUrl: "http://octopi.local", apiKey: "" });
  const [webhookDraft, setWebhookDraft] = useState({ name: "Production events", url: "https://webhook.site/layerpilot", events: "order.status,order.jobs_generated,queue.status,printer.status,spool.usage" });
  const [apiKeyDraft, setApiKeyDraft] = useState({ name: "Farm scheduler", scopes: "queue:write,files:write,orders:write" });
  const [newApiSecret, setNewApiSecret] = useState("");
  const [bridgeDiagnostic, setBridgeDiagnostic] = useState<BridgeDiagnostic | null>(bridges.find((bridge) => bridge.lastDiagnostics)?.lastDiagnostics || null);
  const adminIdempotencyAttempts = useRef<Record<string, IdempotencyAttempt>>({});
  const idempotencyHeaders = (action: string, payload: unknown) => {
    const result = idempotencyHeadersForAttempt(adminIdempotencyAttempts.current[action] || null, action, payload);
    adminIdempotencyAttempts.current[action] = result.attempt;
    return result.headers;
  };
  const saveBridge = async () => {
    try {
      const saved = await apiRequest<Bridge>("/api/bridges", {
        method: "POST",
        body: JSON.stringify({ ...bridgeDraft, enabled: true })
      });
      setBridges((items) => [...items.filter((item) => item.id !== saved.id && item.printerId !== saved.printerId), saved]);
      addToast(`${saved.name} saved`, "success");
    } catch {
      addToast("Bridge save failed. Check URL, role, or API status.", "warning");
    }
  };
  const testBridge = async (bridge: Bridge) => {
    try {
      const tested = await apiRequest<{ ok: boolean; bridge: Bridge; printer: Printer; diagnostic: BridgeDiagnostic }>(`/api/bridges/${bridge.id}/test`, { method: "POST" });
      setBridges((items) => items.map((item) => item.id === bridge.id ? tested.bridge : item));
      setPrinters((items) => items.map((item) => item.id === tested.printer.id ? tested.printer : item));
      setBridgeDiagnostic(tested.diagnostic);
      addToast(tested.ok ? `${bridge.name} connected` : `${bridge.name} diagnostic failed`, tested.ok ? "success" : "warning");
    } catch {
      setBridges((items) => items.map((item) => item.id === bridge.id ? { ...item, lastStatus: "error" } : item));
      addToast(`${bridge.name} connection failed`, "warning");
    }
  };
  const syncBridges = async () => {
    try {
      const result = await apiRequest<{ bridges: Bridge[]; printers: Printer[]; synced: unknown[]; failed: unknown[] }>("/api/bridges/sync", { method: "POST" });
      setBridges(result.bridges);
      setPrinters(result.printers);
      addToast(`Bridge sync: ${result.synced.length} connected, ${result.failed.length} failed`, result.failed.length ? "warning" : "success");
    } catch {
      addToast("Bridge sync failed. Check API status and bridge credentials.", "warning");
    }
  };
  const saveWebhook = async () => {
    try {
      const saved = await apiRequest<Webhook>("/api/webhooks", {
        method: "POST",
        body: JSON.stringify({ name: webhookDraft.name, url: webhookDraft.url, events: webhookDraft.events.split(",").map((event) => event.trim()).filter(Boolean), enabled: true })
      });
      setWebhooks((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      addToast(`${saved.name} webhook saved`, "success");
    } catch {
      const fallback: Webhook = { id: crypto.randomUUID(), name: webhookDraft.name, url: webhookDraft.url, events: webhookDraft.events.split(",").map((event) => event.trim()).filter(Boolean), enabled: true, lastStatus: "local" };
      setWebhooks((items) => [fallback, ...items]);
      addToast("Webhook saved locally. Check URL, role, or API status.", "warning");
    }
  };
  const toggleWebhook = async (hook: Webhook, enabled: boolean) => {
    setWebhooks((items) => items.map((item) => item.id === hook.id ? { ...item, enabled } : item));
    try {
      const updated = await apiRequest<Webhook>(`/api/webhooks/${hook.id}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
      setWebhooks((items) => items.map((item) => item.id === hook.id ? updated : item));
    } catch {
      addToast("Webhook toggle saved locally only", "warning");
    }
  };
  const testWebhook = async (hook: Webhook) => {
    try {
      const result = await apiRequest<{ webhook: Webhook; delivery: WebhookDelivery }>(`/api/webhooks/${hook.id}/test`, { method: "POST" });
      setWebhooks((items) => items.map((item) => item.id === hook.id ? result.webhook : item));
      setWebhookDeliveries((items) => [result.delivery, ...items.filter((item) => item.id !== result.delivery.id)]);
      addToast(result.delivery.status === "delivered" ? `${hook.name} delivered` : `${hook.name} failed`, result.delivery.status === "delivered" ? "success" : "warning");
    } catch {
      addToast("Webhook test failed. Check URL, role, or API status.", "warning");
    }
  };
  const createApiKey = async () => {
    const payload = { name: apiKeyDraft.name, scopes: apiKeyDraft.scopes.split(",").map((scope) => scope.trim()).filter(Boolean), enabled: true };
    const attemptKey = "admin-api-key-create";
    try {
      const result = await apiRequest<{ apiKey: ApiKey; secret: string }>("/api/apiKeys", {
        method: "POST",
        headers: idempotencyHeaders(attemptKey, payload),
        body: JSON.stringify(payload)
      });
      setApiKeys((items) => [result.apiKey, ...items.filter((item) => item.id !== result.apiKey.id)]);
      setNewApiSecret(result.secret);
      setBackendStatus("connected");
      addToast(`${result.apiKey.name} API key created`);
      delete adminIdempotencyAttempts.current[attemptKey];
    } catch {
      setBackendStatus("local");
      addToast("API key creation failed. Check role or API status.", "warning");
    }
  };
  const toggleApiKey = async (key: ApiKey, enabled: boolean) => {
    const payload = { id: key.id, enabled };
    const attemptKey = `admin-api-key-update:${key.id}`;
    setApiKeys((items) => items.map((item) => item.id === key.id ? { ...item, enabled } : item));
    try {
      const updated = await apiRequest<ApiKey>(`/api/apiKeys/${key.id}`, { method: "PATCH", headers: idempotencyHeaders(attemptKey, payload), body: JSON.stringify({ enabled }) });
      setApiKeys((items) => items.map((item) => item.id === key.id ? updated : item));
      setBackendStatus("connected");
      delete adminIdempotencyAttempts.current[attemptKey];
    } catch {
      setBackendStatus("local");
      addToast("API key update failed. Reverting on next refresh.", "warning");
    }
  };
  return (
    <Page title="Integrations and API" kicker="Connect slicers, printer bridges, alerts and automations">
      <div className="integration-grid">{integrations.map(([name, desc, status]) => <div className="integration-card" key={name}><Code2 /><h3>{name}</h3><p>{desc}</p><StatusPill status={status} /><button onClick={() => addToast(`${name} connector opened`, "info")}>Configure</button></div>)}</div>
      <section className="panel">
        <PanelTitle title="Printer bridges" action={<><button onClick={syncBridges}><RefreshCw size={16} />Sync all</button><button className="primary" onClick={saveBridge}><Save size={16} />Save bridge</button></>} />
        <div className="toolbar">
          <select value={bridgeDraft.printerId} onChange={(event) => setBridgeDraft({ ...bridgeDraft, printerId: event.target.value })}>{printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}</select>
          <select value={bridgeDraft.kind} onChange={(event) => setBridgeDraft({ ...bridgeDraft, kind: event.target.value as Bridge["kind"] })}><option value="octoprint">OctoPrint</option><option value="moonraker">Moonraker</option><option value="prusalink">PrusaLink</option><option value="manual">Manual</option></select>
          <input value={bridgeDraft.name} onChange={(event) => setBridgeDraft({ ...bridgeDraft, name: event.target.value })} placeholder="Bridge name" />
          <input value={bridgeDraft.baseUrl} onChange={(event) => setBridgeDraft({ ...bridgeDraft, baseUrl: event.target.value })} placeholder="http://octopi.local" />
          <input type="password" value={bridgeDraft.apiKey} onChange={(event) => setBridgeDraft({ ...bridgeDraft, apiKey: event.target.value })} placeholder="API key or access token" />
        </div>
        <DataTable headers={["Bridge", "Printer", "Kind", "URL", "Key", "Last status", "Last sync", "Actions"]}>
          {bridges.map((bridge) => <tr key={bridge.id}><td><b>{bridge.name}</b></td><td>{printers.find((printer) => printer.id === bridge.printerId)?.name || bridge.printerId}</td><td><StatusPill status={bridge.kind} /></td><td><code>{bridge.baseUrl}</code></td><td>{bridge.hasApiKey ? "Stored" : "None"}</td><td><StatusPill status={bridge.lastStatus || "not tested"} /></td><td>{bridge.lastSyncAt ? new Date(bridge.lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Never"}</td><td><button onClick={() => testBridge(bridge)}><RefreshCw size={14} />Test sync</button></td></tr>)}
        </DataTable>
        {bridgeDiagnostic && <div className={`diagnostic-card ${bridgeDiagnostic.ok ? "pass" : "fail"}`}>
          <div>
            <b>{bridgeDiagnostic.summary}</b>
            <span>{bridgeDiagnostic.kind} - {bridgeDiagnostic.baseUrl} - {bridgeDiagnostic.latencyMs}ms</span>
          </div>
          <em>{bridgeDiagnostic.recommendation}</em>
          <div className="diagnostic-grid">
            {bridgeDiagnostic.checks.map((check) => <div key={`${check.name}-${check.detail}`} className={`diagnostic-check ${check.status}`}>
              <StatusDot status={check.status === "passed" ? "complete" : check.status === "warning" ? "queued" : "failed"} />
              <span><b>{check.name}</b>{check.detail}</span>
              {check.recommendation && <small>{check.recommendation}</small>}
            </div>)}
          </div>
        </div>}
      </section>
      <div className="split">
        <section className="panel">
          <PanelTitle title="API keys" action={<button className="primary" onClick={createApiKey}><KeyRound size={16} />Create key</button>} />
          <div className="toolbar">
            <input value={apiKeyDraft.name} onChange={(event) => setApiKeyDraft({ ...apiKeyDraft, name: event.target.value })} placeholder="Automation key name" />
            <input value={apiKeyDraft.scopes} onChange={(event) => setApiKeyDraft({ ...apiKeyDraft, scopes: event.target.value })} placeholder="queue:write,files:write" />
          </div>
          {newApiSecret && <div className="notice success"><KeyRound size={18} /><span>Copy this key now. It will only be shown once.</span><code>{newApiSecret}</code></div>}
          <DataTable headers={["Name", "Prefix", "Scopes", "Enabled", "Last used", "Created"]}>{apiKeys.map((key) => <tr key={key.id}><td>{key.name}</td><td><code>{key.prefix}</code></td><td>{key.scopes.join(", ")}</td><td><input type="checkbox" checked={key.enabled} onChange={(event) => toggleApiKey(key, event.target.checked)} /></td><td>{key.lastUsedAt || "Never"}</td><td>{key.createdAt || key.created || "Unknown"}</td></tr>)}</DataTable>
        </section>
        <section className="panel">
          <PanelTitle title="Webhooks" action={<button className="primary" onClick={saveWebhook}><Save size={16} />Save webhook</button>} />
          <div className="toolbar">
            <input value={webhookDraft.name} onChange={(event) => setWebhookDraft({ ...webhookDraft, name: event.target.value })} placeholder="Webhook name" />
            <input value={webhookDraft.url} onChange={(event) => setWebhookDraft({ ...webhookDraft, url: event.target.value })} placeholder="https://automation.local/webhook" />
            <input value={webhookDraft.events} onChange={(event) => setWebhookDraft({ ...webhookDraft, events: event.target.value })} placeholder="order.status,queue.status" />
          </div>
          <DataTable headers={["Name", "URL", "Events", "Status", "Enabled", "Actions"]}>{webhooks.map((hook) => <tr key={hook.id}><td>{hook.name}</td><td><code>{hook.url || "No URL"}</code></td><td>{hook.events.join(", ")}</td><td><StatusPill status={hook.lastStatus || "not sent"} /></td><td><input type="checkbox" checked={hook.enabled} onChange={(e) => toggleWebhook(hook, e.target.checked)} /></td><td><button onClick={() => testWebhook(hook)}>Test send</button></td></tr>)}</DataTable>
        </section>
      </div>
      <section className="panel"><PanelTitle title="Webhook event log" /><div className="event-feed">{webhookDeliveries.slice(0, 8).map((delivery) => <div key={delivery.id}><StatusDot status={delivery.status === "delivered" ? "complete" : delivery.status === "failed" ? "failed" : "queued"} /><span>{delivery.eventType} - {delivery.webhookName}</span><em>{delivery.statusCode || delivery.error || delivery.status} - {delivery.at}</em></div>)}{!webhookDeliveries.length && <div><StatusDot status="queued" /><span>No webhook deliveries yet</span><em>Send a test or trigger a production event</em></div>}</div></section>
    </Page>
  );
}

function NotificationsPage({ notifications, setNotifications, channels, setChannels, deliveries, setDeliveries, addToast }: { notifications: string[]; setNotifications: React.Dispatch<React.SetStateAction<string[]>>; channels: NotificationChannel[]; setChannels: React.Dispatch<React.SetStateAction<NotificationChannel[]>>; deliveries: NotificationDelivery[]; setDeliveries: React.Dispatch<React.SetStateAction<NotificationDelivery[]>>; addToast: (message: string, type?: Toast["type"]) => void }) {
  const [draft, setDraft] = useState({ name: "Operator alerts", type: "slack" as NotificationChannel["type"], url: "https://hooks.slack.test/layerpilot", token: "", events: "printer.status,print.completed,queue.status", recipients: "" });
  const saveChannel = async () => {
    try {
      const saved = await apiRequest<NotificationChannel>("/api/notificationChannels", {
        method: "POST",
        body: JSON.stringify({
          name: draft.name,
          type: draft.type,
          url: draft.url,
          token: draft.token,
          events: draft.events.split(",").map((event) => event.trim()).filter(Boolean),
          recipients: draft.recipients.split(",").map((item) => item.trim()).filter(Boolean),
          enabled: true
        })
      });
      setChannels((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      addToast(`${saved.name} notification channel saved`, "success");
    } catch {
      addToast("Notification channel save failed. Check URL, role, or API status.", "warning");
    }
  };
  const toggleChannel = async (channel: NotificationChannel, enabled: boolean) => {
    setChannels((items) => items.map((item) => item.id === channel.id ? { ...item, enabled } : item));
    try {
      const updated = await apiRequest<NotificationChannel>(`/api/notificationChannels/${channel.id}`, { method: "PATCH", body: JSON.stringify({ enabled }) });
      setChannels((items) => items.map((item) => item.id === channel.id ? updated : item));
    } catch {
      addToast("Notification toggle saved locally only", "warning");
    }
  };
  const testChannel = async (channel: NotificationChannel) => {
    try {
      const result = await apiRequest<{ channel: NotificationChannel; delivery: NotificationDelivery }>(`/api/notificationChannels/${channel.id}/test`, { method: "POST" });
      setChannels((items) => items.map((item) => item.id === channel.id ? result.channel : item));
      setDeliveries((items) => [result.delivery, ...items.filter((item) => item.id !== result.delivery.id)]);
      addToast(result.delivery.status === "delivered" ? `${channel.name} delivered` : `${channel.name} failed`, result.delivery.status === "delivered" ? "success" : "warning");
    } catch {
      addToast("Notification test failed. Check URL, role, or API status.", "warning");
    }
  };
  return (
    <Page title="Notifications" kicker="Notification center and channel preferences">
      <div className="split">
        <section className="panel"><PanelTitle title="Notification center" />{notifications.map((note) => <div className="notice" key={note}><Bell size={16} /><span>{note}</span><button onClick={() => setNotifications((items) => items.filter((x) => x !== note))}><X size={14} /></button></div>)}<button onClick={() => { setNotifications((items) => ["Test alert generated.", ...items]); addToast("Test notification created", "info"); }}>Send test alert</button></section>
        <section className="panel">
          <PanelTitle title="Delivery channel" action={<button className="primary" onClick={saveChannel}><Save size={16} />Save channel</button>} />
          <div className="toolbar">
            <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Channel name" />
            <select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as NotificationChannel["type"] })}><option value="slack">Slack</option><option value="discord">Discord</option><option value="custom">Custom webhook</option><option value="email">Email provider webhook</option></select>
            <input value={draft.url} onChange={(event) => setDraft({ ...draft, url: event.target.value })} placeholder="https://hooks.example/..." />
            <input type="password" value={draft.token} onChange={(event) => setDraft({ ...draft, token: event.target.value })} placeholder="Optional bearer token" />
            <input value={draft.events} onChange={(event) => setDraft({ ...draft, events: event.target.value })} placeholder="printer.status,print.completed" />
            <input value={draft.recipients} onChange={(event) => setDraft({ ...draft, recipients: event.target.value })} placeholder="email recipients, optional" />
          </div>
        </section>
      </div>
      <section className="panel">
        <PanelTitle title="Notification channels" />
        <DataTable headers={["Name", "Type", "URL", "Events", "Status", "Token", "Enabled", "Actions"]}>{channels.map((channel) => <tr key={channel.id}><td><b>{channel.name}</b><small>{channel.recipients?.join(", ") || "No recipients"}</small></td><td><StatusPill status={channel.type} /></td><td><code>{channel.url}</code></td><td>{channel.events.join(", ")}</td><td><StatusPill status={channel.lastStatus || "not sent"} /></td><td>{channel.hasToken ? "Stored" : "None"}</td><td><input type="checkbox" checked={channel.enabled} onChange={(event) => toggleChannel(channel, event.target.checked)} /></td><td><button onClick={() => testChannel(channel)}>Test send</button></td></tr>)}</DataTable>
      </section>
      <section className="panel">
        <PanelTitle title="Notification delivery log" />
        <div className="event-feed">{deliveries.slice(0, 10).map((delivery) => <div key={delivery.id}><StatusDot status={delivery.status === "delivered" ? "complete" : delivery.status === "failed" ? "failed" : "queued"} /><span>{delivery.eventType} - {delivery.channelName}</span><em>{delivery.statusCode || delivery.error || delivery.status} - {delivery.at}</em></div>)}{!deliveries.length && <div><StatusDot status="queued" /><span>No notification deliveries yet</span><em>Send a test or trigger a production event</em></div>}</div>
      </section>
    </Page>
  );
}

function SettingsPage({ settings, setSettings, addToast, setBackendStatus, currentUser, changeOwnPassword, setupTwoFactor, enableTwoFactor, disableTwoFactor }: { settings: WorkspaceSettings; setSettings: React.Dispatch<React.SetStateAction<WorkspaceSettings>>; addToast: (message: string, type?: Toast["type"]) => void; setBackendStatus: React.Dispatch<React.SetStateAction<"local" | "connected">>; currentUser: User | null; changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<User>; setupTwoFactor: () => Promise<TwoFactorSetup>; enableTwoFactor: (secret: string, code: string) => Promise<{ user: User; recoveryCodes: string[] }>; disableTwoFactor: (password: string, code: string) => Promise<User> }) {
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [allowedApiIpsText, setAllowedApiIpsText] = useState(settings.allowedApiIps.join(", "));
  const [passwordDraft, setPasswordDraft] = useState({ current: "", next: "", confirm: "" });
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetup | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorDisableDraft, setTwoFactorDisableDraft] = useState({ password: "", code: "" });
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [restoreBackup, setRestoreBackup] = useState<Record<string, unknown> | null>(null);
  const [restoreSummary, setRestoreSummary] = useState<RestoreSummary | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [supportSnapshot, setSupportSnapshot] = useState<SupportSnapshot | null>(null);
  const [supportBusy, setSupportBusy] = useState(false);
  const governanceIdempotencyAttempts = useRef<Record<string, IdempotencyAttempt>>({});
  const idempotencyHeaders = (action: string, payload: unknown) => {
    const result = idempotencyHeadersForAttempt(governanceIdempotencyAttempts.current[action] || null, action, payload);
    governanceIdempotencyAttempts.current[action] = result.attempt;
    return result.headers;
  };
  const refreshBilling = async () => {
    try {
      const summary = await apiRequest<BillingSummary>("/api/billing");
      setBilling(summary);
      setBackendStatus("connected");
      return summary;
    } catch {
      setBackendStatus("local");
      return null;
    }
  };
  useEffect(() => {
    setAllowedApiIpsText(settings.allowedApiIps.join(", "));
  }, [settings.allowedApiIps]);
  useEffect(() => {
    refreshBilling();
    apiRequest<OnboardingStatus>("/api/onboarding").then((result) => {
      setOnboarding(result);
      setBackendStatus("connected");
    }).catch(() => setBackendStatus("local"));
  }, []);
  const saveSettings = async (patch: Partial<WorkspaceSettings>, label = "Settings") => {
    const payload = { label, patch };
    const attemptKey = `settings:${label}`;
    setSettings((current) => ({ ...current, ...patch }));
    try {
      const updated = await apiRequest<WorkspaceSettings>("/api/workspaceSettings", {
        method: "PATCH",
        headers: idempotencyHeaders(attemptKey, payload),
        body: JSON.stringify(patch)
      });
      setSettings(updated);
      setBackendStatus("connected");
      addToast(`${label} saved`);
      delete governanceIdempotencyAttempts.current[attemptKey];
    } catch {
      setBackendStatus("local");
      addToast(`${label} saved locally only`, "warning");
    }
  };
  const exportWorkspace = async (includeFiles = false) => {
    try {
      const backup = await apiRequest<{ exportedAt: string }>(includeFiles ? "/api/admin/export?includeFiles=true" : "/api/admin/export");
      downloadJsonFile(`layerpilot-${includeFiles ? "full-" : ""}export-${backup.exportedAt.slice(0, 10)}.json`, backup);
      setBackendStatus("connected");
      addToast(includeFiles ? "Full workspace backup exported" : "Workspace backup exported", "success");
    } catch {
      setBackendStatus("local");
      addToast("Backup export requires admin access and live API", "warning");
    }
  };
  const previewRestore = async (file?: File) => {
    if (!file) return;
    setRestoreBusy(true);
    try {
      const backup = JSON.parse(await file.text()) as Record<string, unknown>;
      const summary = await apiRequest<RestoreSummary>("/api/admin/restore", {
        method: "POST",
        body: JSON.stringify({ backup, dryRun: true })
      });
      setRestoreBackup(backup);
      setRestoreSummary(summary);
      setBackendStatus("connected");
      addToast("Restore preview ready", "success");
    } catch {
      setBackendStatus("local");
      setRestoreBackup(null);
      setRestoreSummary(null);
      addToast("Restore preview requires a valid backup and admin access", "warning");
    } finally {
      setRestoreBusy(false);
    }
  };
  const commitRestore = async () => {
    if (!restoreBackup || !restoreSummary) return;
    if (!window.confirm(`Restore ${restoreSummary.printers} printers, ${restoreSummary.queue} jobs, and ${restoreSummary.files} files?`)) return;
    setRestoreBusy(true);
    try {
      const payload = { backup: restoreBackup, dryRun: false, confirm: "RESTORE" };
      const result = await apiRequest<RestoreSummary>("/api/admin/restore", {
        method: "POST",
        headers: idempotencyHeaders("restore:commit", payload),
        body: JSON.stringify(payload)
      });
      setRestoreSummary(result);
      setBackendStatus("connected");
      addToast("Workspace restored. Reloading state.", "success");
      delete governanceIdempotencyAttempts.current["restore:commit"];
      window.setTimeout(() => window.location.reload(), 900);
    } catch {
      setBackendStatus("local");
      addToast("Restore commit requires admin restore access", "warning");
    } finally {
      setRestoreBusy(false);
    }
  };
  const changePassword = async () => {
    if (passwordDraft.next !== passwordDraft.confirm) {
      addToast("New passwords do not match", "warning");
      return;
    }
    try {
      await changeOwnPassword(passwordDraft.current, passwordDraft.next);
      setPasswordDraft({ current: "", next: "", confirm: "" });
      setBackendStatus("connected");
      addToast("Password changed", "success");
    } catch {
      setBackendStatus("local");
      addToast("Password change failed. Check your current password.", "warning");
    }
  };
  const startTwoFactorSetup = async () => {
    try {
      const setup = await setupTwoFactor();
      setTwoFactorSetup(setup);
      setRecoveryCodes([]);
      setBackendStatus("connected");
      addToast("Two-factor setup started", "success");
    } catch {
      setBackendStatus("local");
      addToast("Two-factor setup requires a live signed-in session", "warning");
    }
  };
  const confirmTwoFactor = async () => {
    if (!twoFactorSetup) return;
    try {
      const result = await enableTwoFactor(twoFactorSetup.secret, twoFactorCode);
      setRecoveryCodes(result.recoveryCodes);
      setTwoFactorSetup(null);
      setTwoFactorCode("");
      setBackendStatus("connected");
      addToast("Two-factor authentication enabled", "success");
    } catch {
      setBackendStatus("local");
      addToast("Two-factor code could not be verified", "warning");
    }
  };
  const turnOffTwoFactor = async () => {
    try {
      await disableTwoFactor(twoFactorDisableDraft.password, twoFactorDisableDraft.code);
      setTwoFactorDisableDraft({ password: "", code: "" });
      setRecoveryCodes([]);
      setBackendStatus("connected");
      addToast("Two-factor authentication disabled", "success");
    } catch {
      setBackendStatus("local");
      addToast("Two-factor disable failed. Check password and code.", "warning");
    }
  };
  const changePlan = async (planId: string) => {
    const payload = { planId };
    const attemptKey = "billing-plan";
    try {
      const result = await apiRequest<{ settings: WorkspaceSettings; billing: BillingSummary }>("/api/billing/plan", {
        method: "PATCH",
        headers: idempotencyHeaders(attemptKey, payload),
        body: JSON.stringify(payload)
      });
      setSettings(result.settings);
      setBilling(result.billing);
      setBackendStatus("connected");
      addToast(`${result.billing.plan.name} plan activated`, "success");
      delete governanceIdempotencyAttempts.current[attemptKey];
    } catch {
      setBackendStatus("local");
      addToast("Plan change requires owner/admin access and live API", "warning");
    }
  };
  const managePlan = async () => {
    const payload = { returnUrl: window.location.href };
    const attemptKey = "billing-portal";
    try {
      const result = await apiRequest<{ session: { mode: string; url: string }; billing: BillingSummary }>("/api/billing/portal", {
        method: "POST",
        headers: idempotencyHeaders(attemptKey, payload),
        body: JSON.stringify(payload)
      });
      setBilling(result.billing);
      setBackendStatus("connected");
      if (result.session.url.startsWith("http")) window.open(result.session.url, "_blank", "noopener,noreferrer");
      addToast(result.session.mode === "stripe" ? "Stripe billing opened" : result.session.mode === "external" ? "Billing portal opened" : "Billing session created", "success");
      delete governanceIdempotencyAttempts.current[attemptKey];
    } catch {
      setBackendStatus("local");
      addToast("Billing session could not be created", "warning");
    }
  };
  const updateOnboardingStep = async (step: OnboardingStep, status: OnboardingStep["status"]) => {
    const payload = { id: step.id, status, note: step.note || "" };
    const attemptKey = `onboarding:${step.id}`;
    try {
      const result = await apiRequest<{ settings: WorkspaceSettings; onboarding: OnboardingStatus }>(`/api/onboarding/${step.id}`, {
        method: "PATCH",
        headers: idempotencyHeaders(attemptKey, payload),
        body: JSON.stringify({ status, note: step.note || "" })
      });
      setSettings(result.settings);
      setOnboarding(result.onboarding);
      setBackendStatus("connected");
      addToast(`${step.title} marked ${status}`, status === "complete" ? "success" : "info");
      delete governanceIdempotencyAttempts.current[attemptKey];
    } catch {
      setBackendStatus("local");
      addToast("Go-live checklist update failed. Check role or API status.", "warning");
    }
  };
  const generateSupportSnapshot = async () => {
    setSupportBusy(true);
    const payload = { action: "support-snapshot" };
    const attemptKey = "support-snapshot";
    try {
      const snapshot = await apiRequest<SupportSnapshot>("/api/support/snapshot", { method: "POST", headers: idempotencyHeaders(attemptKey, payload) });
      setSupportSnapshot(snapshot);
      setOnboarding(snapshot.onboarding);
      downloadTextFile(`3dstu-farmflow-support-${Date.now()}.json`, JSON.stringify(snapshot, null, 2), "application/json");
      setBackendStatus("connected");
      addToast("Support snapshot generated", "success");
      delete governanceIdempotencyAttempts.current[attemptKey];
    } catch {
      setBackendStatus("local");
      addToast("Support snapshot failed. Owner/admin export access is required.", "warning");
    } finally {
      setSupportBusy(false);
    }
  };
  const storage = billing?.storage || { used: "0 B", usedGb: 0, limitGb: settings.storageLimitGb, percent: 0, files: 0, storedFiles: 0, usedBytes: 0 };
  const currentPlanId = billing?.plan.id || "";
  const adminTwoFactorRequired = settings.requireAdmin2fa && (currentUser?.role === "Owner" || currentUser?.role === "Admin") && !currentUser?.twoFactor?.enabled;
  return (
    <Page title="Settings" kicker="Organization, billing, storage, units and security">
      {adminTwoFactorRequired && <div className="notice warning"><Shield size={18} /><span>Production admin access requires two-factor authentication. Set up 2FA to unlock protected workspace APIs.</span></div>}
      <div className="settings-grid">
        <section className="panel"><PanelTitle title="Organization" /><label>Name<input value={settings.organizationName} onChange={(event) => setSettings({ ...settings, organizationName: event.target.value })} /></label><label>Default location<input value={settings.defaultLocation} onChange={(event) => setSettings({ ...settings, defaultLocation: event.target.value })} /></label><button onClick={() => saveSettings({ organizationName: settings.organizationName, defaultLocation: settings.defaultLocation }, "Organization settings")}>Save</button></section>
        <section className="panel">
          <PanelTitle title="Plan and storage" action={<button onClick={refreshBilling}><RefreshCw size={16} />Refresh</button>} />
          <div className="plan-row"><b>{billing?.plan.name || settings.plan}</b><span>{storage.limitGb} GB included</span></div>
          <div className="progress"><span style={{ width: `${storage.percent}%` }} /></div>
          <p>{storage.used} of {storage.limitGb} GB used across {storage.files} files</p>
          <label>Plan<select value={currentPlanId} onChange={(event) => event.target.value && changePlan(event.target.value)}>
            <option value={currentPlanId}>{billing?.plan.name || settings.plan}</option>
            {(billing?.tiers || []).map((tier) => <option key={tier.id} value={tier.id}>{tier.name} - {tier.monthlyPrice ? `$${tier.monthlyPrice}/mo` : "Trial"} - {tier.storageLimitGb} GB</option>)}
          </select></label>
          <div className="quickbar"><button onClick={managePlan}>Manage plan</button><button onClick={() => exportWorkspace()}><Download size={16} />Export backup</button><button onClick={() => exportWorkspace(true)}><Download size={16} />Export full backup</button></div>
          {billing?.invoices.length ? <div className="event-feed billing-feed">{billing.invoices.slice(0, 3).map((invoice) => <div key={invoice.id}><StatusDot status={invoice.status === "paid" ? "complete" : "queued"} /><span>{invoice.plan} - {invoice.currency} {invoice.amount}</span><em>{invoice.status} - {invoice.at.slice(0, 10)}</em></div>)}</div> : <p className="muted">No billing records yet.</p>}
        </section>
        <section className="panel">
          <PanelTitle title="Go-live readiness" action={<strong>{onboarding?.progress.percent ?? 0}%</strong>} />
          <div className="progress large"><span style={{ width: `${onboarding?.progress.percent ?? 0}%` }} /></div>
          <div className="event-feed onboarding-feed">
            {(onboarding?.steps || []).map((step) => <div key={step.id}><StatusDot status={step.status === "complete" ? "complete" : step.status === "skipped" ? "queued" : "failed"} /><span><b>{step.title}</b> - {step.description}</span><em>{step.status}{step.note ? ` - ${step.note}` : ""}</em><button onClick={() => updateOnboardingStep(step, step.status === "complete" ? "pending" : "complete")}>{step.status === "complete" ? "Reopen" : "Complete"}</button></div>)}
            {!onboarding && <div><StatusDot status="queued" /><span>Loading go-live checklist</span><em>Workspace readiness will appear here</em></div>}
          </div>
        </section>
        <section className="panel">
          <PanelTitle title="3DSTU support snapshot" action={<button onClick={generateSupportSnapshot} disabled={supportBusy}><Download size={16} />{supportBusy ? "Generating" : "Generate"}</button>} />
          <p>Creates a redacted operational snapshot for support without passwords, tokens, API key hashes, or billing secrets.</p>
          {supportSnapshot && <div className="event-feed billing-feed">
            <div><StatusDot status="complete" /><span>{supportSnapshot.workspace.name}</span><em>{supportSnapshot.generatedAt}</em></div>
            <div><StatusDot status="queued" /><span>{supportSnapshot.counts.printers} printers, {supportSnapshot.counts.files} files, {supportSnapshot.counts.queue} queue jobs</span><em>{supportSnapshot.readiness.onboarding.percent}% go-live ready</em></div>
          </div>}
        </section>
        <section className="panel">
          <PanelTitle title="Backup restore" />
          <label>Restore JSON<input type="file" accept="application/json,.json" disabled={restoreBusy} onChange={(event) => previewRestore(event.currentTarget.files?.[0])} /></label>
          {restoreSummary ? <div className="event-feed billing-feed">
            <div><StatusDot status="complete" /><span>{restoreSummary.printers} printers / {restoreSummary.queue} jobs / {restoreSummary.files} files</span><em>{restoreSummary.dryRun ? "preview" : "restored"}</em></div>
            <div><StatusDot status={restoreSummary.storagePathsStripped ? "queued" : "complete"} /><span>{restoreSummary.storagePathsStripped} storage paths stripped</span><em>{restoreSummary.filePayloadsRestored ?? 0} files restored</em></div>
            {restoreSummary.warnings.slice(0, 3).map((warning) => <div key={warning}><StatusDot status="queued" /><span>{warning}</span><em>restore</em></div>)}
          </div> : <p className="muted">No restore preview loaded.</p>}
          <div className="quickbar"><button onClick={commitRestore} disabled={!restoreBackup || restoreBusy}><RefreshCw size={16} />Commit restore</button></div>
        </section>
        <section className="panel"><PanelTitle title="Units and locale" /><label>Units<select value={settings.units} onChange={(event) => saveSettings({ units: event.target.value as WorkspaceSettings["units"] }, "Units")}><option value="metric">metric</option><option value="imperial">imperial</option></select></label><label>Currency<select value={settings.currency} onChange={(event) => saveSettings({ currency: event.target.value }, "Currency")}><option>USD</option><option>TWD</option><option>EUR</option></select></label><label>Timezone<select value={settings.timezone} onChange={(event) => saveSettings({ timezone: event.target.value }, "Timezone")}><option>Asia/Taipei</option><option>UTC</option><option>America/Los_Angeles</option><option>Europe/Berlin</option></select></label><label>Theme<select value={settings.theme} onChange={(event) => saveSettings({ theme: event.target.value as WorkspaceSettings["theme"] }, "Theme")}><option value="system">system</option><option value="light">light</option><option value="dark">dark</option></select></label></section>
        <section className="panel"><PanelTitle title="Account password" /><label>Current password<input type="password" value={passwordDraft.current} onChange={(event) => setPasswordDraft({ ...passwordDraft, current: event.target.value })} /></label><label>New password<input type="password" value={passwordDraft.next} onChange={(event) => setPasswordDraft({ ...passwordDraft, next: event.target.value })} /></label><label>Confirm new password<input type="password" value={passwordDraft.confirm} onChange={(event) => setPasswordDraft({ ...passwordDraft, confirm: event.target.value })} /></label><button onClick={changePassword}><KeyRound size={16} />Change password</button></section>
        <section className="panel">
          <PanelTitle title="Two-factor authentication" action={<StatusPill status={currentUser?.twoFactor?.enabled ? "enabled" : "disabled"} />} />
          <p>{currentUser?.twoFactor?.enabled ? `Enabled. ${currentUser.twoFactor.recoveryCodesRemaining ?? 0} recovery codes remaining.` : "Protect sign-in with an authenticator app or recovery code."}</p>
          {!currentUser?.twoFactor?.enabled && !twoFactorSetup && <button onClick={startTwoFactorSetup}><Shield size={16} />Set up 2FA</button>}
          {twoFactorSetup && <div className="event-feed billing-feed">
            <div><StatusDot status="queued" /><span>Authenticator secret</span><em><code>{twoFactorSetup.secret}</code></em></div>
            <div><StatusDot status="queued" /><span>otpauth URI</span><em><code>{twoFactorSetup.otpauthUrl}</code></em></div>
          </div>}
          {twoFactorSetup && <label>Authenticator code<input inputMode="numeric" value={twoFactorCode} onChange={(event) => setTwoFactorCode(event.target.value)} placeholder="123456" /></label>}
          {twoFactorSetup && <button onClick={confirmTwoFactor}><Shield size={16} />Enable 2FA</button>}
          {currentUser?.twoFactor?.enabled && <label>Current password<input type="password" value={twoFactorDisableDraft.password} onChange={(event) => setTwoFactorDisableDraft({ ...twoFactorDisableDraft, password: event.target.value })} /></label>}
          {currentUser?.twoFactor?.enabled && <label>2FA or recovery code<input value={twoFactorDisableDraft.code} onChange={(event) => setTwoFactorDisableDraft({ ...twoFactorDisableDraft, code: event.target.value })} placeholder="123456 or lp-xxxxxxxx" /></label>}
          {currentUser?.twoFactor?.enabled && <button onClick={turnOffTwoFactor}><X size={16} />Disable 2FA</button>}
          {recoveryCodes.length > 0 && <div className="notice success"><KeyRound size={18} /><span>Save these recovery codes now:</span><code>{recoveryCodes.join("  ")}</code></div>}
        </section>
        <section className="panel">
          <PanelTitle title="Security" />
          <label className="check-row"><input type="checkbox" checked={settings.requireAdmin2fa} onChange={(event) => setSettings({ ...settings, requireAdmin2fa: event.target.checked })} />Require 2FA for admins</label>
          <label className="check-row"><input type="checkbox" checked={settings.auditLogRetention} onChange={(event) => setSettings({ ...settings, auditLogRetention: event.target.checked })} />Audit log retention</label>
          <label>Audit retention days<input type="number" min={7} max={3650} value={settings.auditLogRetentionDays} onChange={(event) => setSettings({ ...settings, auditLogRetentionDays: Number(event.target.value || 365) })} /></label>
          <label className="check-row"><input type="checkbox" checked={settings.restrictApiByIp} onChange={(event) => setSettings({ ...settings, restrictApiByIp: event.target.checked })} />Restrict API keys by IP</label>
          <label>Allowed API key IPs / CIDR<input value={allowedApiIpsText} onChange={(event) => setAllowedApiIpsText(event.target.value)} placeholder="127.0.0.1, 203.0.113.0/24" /></label>
          <button onClick={() => saveSettings({ requireAdmin2fa: settings.requireAdmin2fa, auditLogRetention: settings.auditLogRetention, auditLogRetentionDays: settings.auditLogRetentionDays, restrictApiByIp: settings.restrictApiByIp, allowedApiIps: allowedApiIpsText.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean) }, "Security policy")}>Save policy</button>
        </section>
      </div>
    </Page>
  );
}

function PrinterDrawer({ printer, onClose, api }: { printer: Printer; onClose: () => void; api: { controlPrinter: (id: string, action: string) => void } }) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="icon close" onClick={onClose}><X size={18} /></button>
        <h2>{printer.name}</h2><p>{printer.model} - {printer.connection}</p><StatusPill status={printer.status} />
        <div className="camera-box"><span>{printer.camera}</span><div className="scanline" /></div>
        <div className="metric-grid small-grid"><Metric label="Progress" value={`${Math.round(printer.progress)}%`} icon={Gauge} /><Metric label="Nozzle" value={`${printer.nozzle}/${printer.targetNozzle}C`} icon={Thermometer} /><Metric label="Bed" value={`${printer.bed}/${printer.targetBed}C`} icon={Thermometer} /><Metric label="Queue" value={`${printer.queue}`} icon={ClipboardList} /></div>
        <div className="progress large"><span style={{ width: `${printer.progress}%` }} /></div>
        <h3>Controls</h3>
        <div className="control-grid">
          <button onClick={() => api.controlPrinter(printer.id, printer.status === "paused" ? "resume" : "pause")}><Pause size={16} />Pause / resume</button>
          <button onClick={() => api.controlPrinter(printer.id, "start")}><Play size={16} />Start</button>
          <button onClick={() => api.controlPrinter(printer.id, "cancel")}><X size={16} />Cancel</button>
          <button onClick={() => api.controlPrinter(printer.id, "home axes")}><Home size={16} />Home axes</button>
          <button onClick={() => api.controlPrinter(printer.id, "preheat")}><Thermometer size={16} />Preheat</button>
          <button onClick={() => api.controlPrinter(printer.id, "cooldown")}><RefreshCw size={16} />Cooldown</button>
        </div>
      </aside>
    </div>
  );
}

function AddPrinterModal({ onClose, onAdd }: { onClose: () => void; onAdd: (p: Omit<Printer, "id" | "job" | "progress" | "uptime" | "utilization" | "queue">) => Promise<void> }) {
  const [method, setMethod] = useState("Klipper / Moonraker");
  const [name, setName] = useState("New Lab Printer");
  const [model, setModel] = useState("CoreXY 300");
  const [location, setLocation] = useState("Studio North");
  const [filament, setFilament] = useState("PLA Matte Black");
  const [materials, setMaterials] = useState("PLA,PETG,TPU");
  const [volume, setVolume] = useState<[number, number, number]>([300, 300, 300]);
  const [step, setStep] = useState(1);
  const create = async () => onAdd({
    name,
    model,
    location,
    status: "idle",
    connection: method,
    nozzle: 24,
    bed: 24,
    targetNozzle: 0,
    targetBed: 0,
    filament,
    compatibleMaterials: materials.split(",").map((item) => item.trim()).filter(Boolean),
    buildVolume: volume,
    camera: method === "Manual" || method === "Manual setup" ? "No camera" : "Setup pending"
  });
  return (
    <div className="drawer-backdrop"><div className="modal"><button className="icon close" onClick={onClose}><X size={18} /></button><h2>Add printer</h2><div className="stepper"><span className={step >= 1 ? "done" : ""}>1 Method</span><span className={step >= 2 ? "done" : ""}>2 Device</span><span className={step >= 3 ? "done" : ""}>3 Capabilities</span></div>{step === 1 && <div className="choice-grid">{["OctoPrint", "Klipper / Moonraker", "Cloud bridge", "Manual setup"].map((m) => <button key={m} className={method === m ? "selected" : ""} onClick={() => setMethod(m)}>{m}</button>)}</div>}{step === 2 && <><label>Printer name<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>Model<input value={model} onChange={(e) => setModel(e.target.value)} /></label><label>Location<input value={location} onChange={(e) => setLocation(e.target.value)} /></label></>}{step === 3 && <><label>Loaded filament<input value={filament} onChange={(e) => setFilament(e.target.value)} /></label><label>Compatible materials<input value={materials} onChange={(e) => setMaterials(e.target.value)} /></label><div className="settings-grid"><label>Width mm<input type="number" value={volume[0]} onChange={(e) => setVolume([Number(e.target.value), volume[1], volume[2]])} /></label><label>Depth mm<input type="number" value={volume[1]} onChange={(e) => setVolume([volume[0], Number(e.target.value), volume[2]])} /></label><label>Height mm<input type="number" value={volume[2]} onChange={(e) => setVolume([volume[0], volume[1], Number(e.target.value)])} /></label></div><div className="notice success"><Check size={18} /><span>This printer will be available for scheduler matching after it is added.</span></div></>}<div className="modal-actions"><button onClick={() => step === 1 ? onClose() : setStep(step - 1)}>Back</button><button className="primary" onClick={() => step === 3 ? create() : setStep(step + 1)}>{step === 3 ? "Add printer" : "Continue"}</button></div></div></div>
  );
}

function Page({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) {
  return <div className="page"><div className="page-header"><div><span>{kicker}</span><h1>{title}</h1></div></div>{children}</div>;
}

function PanelTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return <div className="panel-title"><h2>{title}</h2>{action}</div>;
}

function Metric({ label, value, icon: Icon, tone = "blue" }: { label: string; value: string; icon: typeof Activity; tone?: string }) {
  return <div className={`metric ${tone}`}><Icon size={20} /><span>{label}</span><strong>{value}</strong></div>;
}

function PrinterMini({ printer }: { printer: Printer }) {
  return <div className="printer-mini"><StatusDot status={printer.status} /><b>{printer.name}</b><span>{printer.progress}%</span></div>;
}

function PrinterCard({ printer, onClick }: { printer: Printer; onClick: () => void }) {
  return <button className="printer-card" onClick={onClick}><div><h3>{printer.name}</h3><StatusPill status={printer.status} /></div><p>{printer.model} - {printer.location}</p><div className="temperature"><Thermometer size={15} />{printer.nozzle}/{printer.targetNozzle}C <span>{printer.bed}/{printer.targetBed}C bed</span></div><div className="progress"><span style={{ width: `${printer.progress}%` }} /></div><small>{printer.job || "Idle"} - {printer.filament}</small></button>;
}

function DataTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return <div className="table-wrap"><table><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function StatusDot({ status }: { status: string }) {
  return <i className={`status-dot ${status}`} />;
}

function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill ${status}`}>{status}</span>;
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return <div className="toast-stack">{toasts.map((toast) => <div key={toast.id} className={`toast ${toast.type}`}><Check size={16} />{toast.message}</div>)}</div>;
}

export default App;
