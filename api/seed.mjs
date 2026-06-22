export const seedData = {
  printers: [
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
      connection: "Manual bridge",
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
  ],
  files: [
    { id: "f1", name: "Aero duct v3.gcode", type: "GCODE", folder: "Production", size: "28 MB", material: "PLA", tags: ["airflow", "verified"], sliced: true, status: "approved", version: 4, dimensions: [126, 88, 42], thumbnail: "duct", estimateGrams: 84, estimateMinutes: 198, quote: 72, printTime: "3h 18m", cost: 72, layerHeight: "0.20", usage: 84 },
    { id: "f2", name: "Camera mount.3mf", type: "3MF", folder: "Fixtures", size: "12 MB", material: "PETG", tags: ["mount"], sliced: false, status: "needs review", version: 2, dimensions: [92, 68, 56], thumbnail: "mount", estimateGrams: 42, estimateMinutes: 102, quote: 38, printTime: "1h 42m", cost: 38, layerHeight: "0.16", usage: 42 },
    { id: "f3", name: "Student badge tray.stl", type: "STL", folder: "Education", size: "6 MB", material: "PLA", tags: ["school", "batch"], sliced: false, status: "uploaded", version: 1, dimensions: [235, 180, 16], thumbnail: "tray", estimateGrams: 50, estimateMinutes: 124, quote: 44, printTime: "2h 04m", cost: 44, layerHeight: "0.20", usage: 50 }
  ],
  fileFolders: [
    { id: "folder-production", name: "Production", parent: "", purpose: "production", fileCount: 1 },
    { id: "folder-fixtures", name: "Fixtures", parent: "", purpose: "production", fileCount: 1 },
    { id: "folder-education", name: "Education", parent: "", purpose: "review", fileCount: 1 }
  ],
  queue: [
    { id: "q1", fileId: "f1", file: "Aero duct v3.gcode", printerId: "p1", printer: "Forge A1", status: "printing", stage: "printing", priority: "High", material: "PLA", color: "Black", due: "Today 16:00", dimensions: [126, 88, 42], assignee: "Noah", scheduledStart: "09:00", time: "3h 18m", cost: 72, added: "Today 09:18" },
    { id: "q2", fileId: "f2", file: "Camera mount.3mf", printerId: "p3", printer: "Campus MK4", status: "queued", stage: "needs scheduling", priority: "Normal", material: "PETG", color: "Orange", due: "Today 18:00", dimensions: [92, 68, 56], assignee: "Iain", time: "1h 42m", cost: 38, added: "Today 11:03" },
    { id: "q3", fileId: "f3", file: "Student badge tray.stl", printerId: "p2", printer: "Resin Bay", status: "queued", stage: "needs slicing", priority: "Low", material: "PLA", color: "Any", due: "Tomorrow 08:00", dimensions: [235, 180, 16], assignee: "Maya", time: "2h 04m", cost: 44, added: "Tomorrow 08:00" }
  ],
  todoActions: [],
  spools: [
    { id: "s1", material: "PLA", color: "#111827", remaining: 742, location: "Rack A2" },
    { id: "s2", material: "PETG", color: "#f97316", remaining: 318, location: "Rack B1" }
  ],
  purchaseRequests: [
    { id: "pr-1", spoolId: "s2", material: "PETG", color: "#f97316", brand: "Prusament", quantity: 2, targetGrams: 1000, supplier: "Preferred supplier", priority: "High", status: "open", due: "This week", note: "Demo reorder request for production stock" }
  ],
  maintenance: [
    { id: "m1", title: "Nozzle inspection", printer: "Forge A1", status: "in progress", due: "Today" }
  ],
  maintenanceTemplates: [
    { id: "mt1", title: "Nozzle inspection", printerModel: "FDM fleet", intervalDays: 30, tasks: ["Inspect nozzle", "Cold pull if needed", "Run extrusion test"], severity: "Medium" }
  ],
  maintenanceReports: [],
  users: [
    { id: "u1", name: "Production Owner", email: "owner@layerpilot.test", role: "Owner", location: "HQ", lastSeen: "Now" },
    { id: "u2", name: "Maya Lin", email: "maya@layerpilot.test", role: "Admin", location: "Studio North", lastSeen: "13m ago" }
  ],
  parts: [
    { id: "part-1", name: "Aero duct assembly", fileId: "f1", material: "PLA", process: "0.20mm Production", variants: ["Black", "Blue"], status: "ready" },
    { id: "part-2", name: "Camera mount kit", fileId: "f2", material: "PETG", process: "0.16mm Detail", variants: ["Orange", "Carbon"], status: "ready" }
  ],
  skus: [
    { id: "sku-1", sku: "DUCT-KIT-BLK", title: "Aero Duct Kit", parts: ["Aero duct assembly"], price: 680, stock: 14, channel: "Shopify" },
    { id: "sku-2", sku: "CAM-MOUNT-ORG", title: "Camera Mount Pack", parts: ["Camera mount kit"], price: 420, stock: 8, channel: "Etsy" }
  ],
  productionTemplates: [
    { id: "pt-1", name: "Aero duct replenishment", sku: "DUCT-KIT-BLK", fileId: "f1", material: "PLA", color: "Black", priority: "Normal", stage: "needs scheduling", printerId: "p1", process: "0.20mm Production", dueOffsetDays: 2, quantity: 2, time: "3h 18m", cost: 72, notes: "Standard replenishment batch", runCount: 0 }
  ],
  orders: [
    { id: "ord-1048", source: "Shopify", customer: "M. Rivera", items: ["DUCT-KIT-BLK x2"], status: "queued", due: "Jun 14", value: 1360 },
    { id: "ord-1049", source: "Etsy", customer: "A. Wood", items: ["CAM-MOUNT-ORG x1"], status: "received", due: "Jun 15", value: 420 }
  ],
  profiles: [
    { id: "prof-1", name: "CoreXY Pro 300", kind: "Machine", target: "Forge A1", source: "Manual", updated: "Today" },
    { id: "prof-2", name: "0.20mm Production", kind: "Process", target: "FDM fleet", source: "Orca import", updated: "Yesterday" }
  ],
  profileDefaults: {
    Machine: "prof-1",
    Process: "prof-2",
    Filament: ""
  },
  profileMatchingPolicy: {
    materialCompatibility: true,
    processFallback: true,
    commercialPriority: true,
    warnBeforeFallback: true,
    dueWindowHours: 2,
    updatedAt: "",
    updatedBy: ""
  },
  addons: [
    { id: "commerce", name: "Commerce Connectors", description: "Import Shopify, Etsy, eBay, and manual orders into production.", category: "Commerce", status: "enabled", enabled: true, config: {} },
    { id: "cost", name: "Cost Catalog", description: "Calculate material, labor, overhead, and SKU margin.", category: "Finance", status: "enabled", enabled: true, config: {} },
    { id: "audit", name: "Audit Timeline", description: "Track who changed printers, orders, queue, profiles, and settings.", category: "Governance", status: "enabled", enabled: true, config: {} },
    { id: "maintenance", name: "Maintenance Tracker", description: "Schedule recurring tasks from print hours and job counts.", category: "Operations", status: "enabled", enabled: true, config: {} },
    { id: "mqtt", name: "MQTT Event Stream", description: "Broadcast realtime printer and order events to automations.", category: "Automation", status: "beta", enabled: false, config: {} },
    { id: "pwa", name: "PWA Mobile Console", description: "Installable tablet and phone operations interface.", category: "Mobile", status: "available", enabled: false, config: {} }
  ],
  webhooks: [
    { id: "w1", name: "Slack alerts", enabled: true, events: ["print.failed", "printer.offline"] }
  ],
  notificationChannels: [
    { id: "nc1", name: "Operator Slack", type: "slack", url: "https://hooks.slack.test/layerpilot", token: "", enabled: false, events: ["printer.status", "print.completed", "queue.status"], recipients: [], lastStatus: "not sent" },
    { id: "nc2", name: "Discord production room", type: "discord", url: "https://discord.test/api/webhooks/layerpilot", token: "", enabled: false, events: ["*"], recipients: [], lastStatus: "not sent" }
  ],
  notificationDeliveries: [],
  commerceConnectors: [
    { id: "cc1", name: "Shopify JSON feed", source: "Shopify", url: "https://example.com/layerpilot/shopify-orders.json", token: "", enabled: false, mapping: {}, lastStatus: "not synced" },
    { id: "cc2", name: "Etsy CSV feed", source: "Etsy", url: "https://example.com/layerpilot/etsy-orders.csv", token: "", enabled: false, mapping: {}, lastStatus: "not synced" }
  ],
  commerceImports: [],
  apiKeys: [],
  slicerJobs: [],
  materialMappings: [],
  materialMapRuns: [],
  costCatalog: {
    currency: "USD",
    materialRates: { PLA: 0.82, PETG: 1.05, ASA: 1.28, TPU: 1.5, Resin: 2.1 },
    machineHourlyRate: 18,
    laborPerOrder: 35,
    failureReservePercent: 6,
    minimumQuote: 18,
    overheadPercent: 8
  },
  workspaceSettings: {
    organizationName: "North Campus Lab",
    defaultLocation: "Studio North",
    units: "metric",
    currency: "USD",
    timezone: "Asia/Taipei",
    theme: "system",
    requireAdmin2fa: true,
    auditLogRetention: true,
    restrictApiByIp: false,
    allowedApiIps: [],
    storageLimitGb: 10,
    plan: "Print Farm Trial"
  },
  bridges: [
    { id: "b1", printerId: "p1", kind: "moonraker", name: "Forge A1 Moonraker", baseUrl: "http://moonraker.local", apiKey: "", enabled: false, lastStatus: "not tested" },
    { id: "b2", printerId: "p3", kind: "octoprint", name: "Campus MK4 OctoPrint", baseUrl: "http://octopi.local", apiKey: "", enabled: false, lastStatus: "not tested" }
  ],
  events: [
    { id: "e1", type: "system.boot", message: "3DSTU FarmFlow API started", at: new Date().toISOString() }
  ]
};
