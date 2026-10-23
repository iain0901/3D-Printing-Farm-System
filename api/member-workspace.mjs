import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { createCaseFromIntake, publicCase } from "./cases-module.mjs";
import { advancedSlicerSchema } from "./studio-settings.mjs";
import {
  caseIntakeSchema,
  publicQuoteVersion,
  CASE_STATUS_LABELS,
} from "./case-domain.mjs";

const stamp = () => new Date().toISOString();
const uid = () => randomUUID();
const text = (max = 200) => z.string().trim().max(max);
const key = z.string().min(1).max(100);
export const MEMBER_COLLECTIONS = [
  "memberModels",
  "memberDrafts",
  "memberProjects",
  "memberNotifications",
  "memberRequests",
  "memberMessages",
  "memberPreferences",
  "memberDocuments",
  "memberPointLedger",
];
const scope = (item, customer) =>
  item.customerId === customer.id &&
  (item.workspaceId || "ws-default") === (customer.workspaceId || "ws-default");
const scoped = (data, collection, customer) =>
  data[collection].filter((item) => scope(item, customer));
const owner = (customer) => ({
  customerId: customer.id,
  workspaceId: customer.workspaceId || "ws-default",
});
export function draftLayoutIssues(manifest) {
  const models = manifest.models;
  const boxes = models.map((m) => ({
    x1: m.placement.x - m.dimensions[0] / 2,
    x2: m.placement.x + m.dimensions[0] / 2,
    y1: m.placement.y - m.dimensions[1] / 2,
    y2: m.placement.y + m.dimensions[1] / 2,
  }));
  if (
    boxes.some(
      (b, i) =>
        b.x1 < 4.99 ||
        b.y1 < 4.99 ||
        b.x2 > 255.01 ||
        b.y2 > 255.01 ||
        models[i].dimensions[2] > 260
    )
  )
    return ["草稿已保存；送出前請將模型移回平台範圍。"];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j];
      if (
        a.x1 < b.x2 + 1.99 &&
        a.x2 + 1.99 > b.x1 &&
        a.y1 < b.y2 + 1.99 &&
        a.y2 + 1.99 > b.y1
      )
        return ["送出前請移開重疊模型，至少保留 2 mm 間距。"];
    }
  return [];
}
function fail(statusCode, message) {
  throw Object.assign(new Error(message), { statusCode });
}
function find(data, collection, customer, id) {
  const item = scoped(data, collection, customer).find(
    (record) => record.id === id
  );
  if (!item) fail(404, "找不到這筆資料");
  return item;
}
function ownedCase(data, customer, id) {
  // Member resources are linked by immutable customer ID, never by a caller-supplied email.
  const item = (data.cases || []).find(
    (item) => item.id === id && scope(item, customer)
  );
  if (!item) fail(404, "找不到這個案件");
  return item;
}
function ownedOrder(data, customer, id) {
  const linked = new Set(
    (data.quoteRequests || [])
      .filter((q) => scope(q, customer))
      .map((q) => q.orderId)
  );
  const item = (data.orders || []).find(
    (item) =>
      item.id === id &&
      (item.workspaceId || "ws-default") ===
        (customer.workspaceId || "ws-default") &&
      (item.customerId === customer.id || linked.has(item.id))
  );
  if (!item) fail(404, "找不到這筆訂單");
  return item;
}
function notify(data, customer, title, body, link = "/portal/workspace") {
  data.memberNotifications.unshift({
    id: uid(),
    ...owner(customer),
    title,
    body,
    link,
    createdAt: stamp(),
    readAt: null,
  });
}
const vec = z.object({ x: z.number().finite(), y: z.number().finite() });
const transform = z.object({
  scale: z.number().min(1).max(1000),
  x: z.number().min(-360).max(360),
  y: z.number().min(-360).max(360),
  z: z.number().min(-360).max(360),
  layFlat: z.boolean(),
  scaleX: z.number().min(1).max(1000).optional(),
  scaleY: z.number().min(1).max(1000).optional(),
  scaleZ: z.number().min(1).max(1000).optional(),
  mirrorX: z.boolean().optional(),
  mirrorY: z.boolean().optional(),
  mirrorZ: z.boolean().optional(),
});
const settingsSchema = z.object({
  advanced: advancedSlicerSchema.optional(),
  material: z.enum(["PETG", "PLA", "ABS", "ASA", "TPU", "Nylon"]),
  colorMode: z.enum(["single", "multi"]),
  layerHeight: z.union([
    z.literal(0.12),
    z.literal(0.16),
    z.literal(0.2),
    z.literal(0.28),
  ]),
  infill: z.number().int().min(0).max(100),
  walls: z.number().int().min(1).max(12),
  autoSupports: z.boolean(),
  autoOrient: z.boolean(),
  autoArrange: z.boolean(),
  dueDate: text(10),
  rush: z.boolean(),
  notes: text(4000),
});
const paintSchema = z
  .object({
    encoding: z.literal("stl-triangle-slot-v1"),
    geometrySha256: z.string().regex(/^[0-9a-f]{64}$/),
    triangleCount: z.number().int().positive().max(200000),
    priority: z.literal("surface-over-height-over-base"),
    faces: z.array(z.tuple([z.number().int().nonnegative(), key])).max(200000),
  })
  .nullable();
const draftSchema = z.object({
  name: text(120).min(1),
  revision: z.number().int().nonnegative().optional(),
  projectId: text(100).default(""),
  manifest: z.object({
    schemaVersion: z.literal("3drfm.quote-workspace.v2"),
    settings: settingsSchema,
    colorSlots: z
      .array(
        z.object({
          id: key,
          label: text(60).min(1),
          hex: z.string().regex(/^#[0-9a-f]{6}$/i),
        })
      )
      .min(1)
      .max(8),
    models: z
      .array(
        z.object({
          id: key,
          name: text(180).min(1),
          fileIndex: z.number().int().min(0).max(4),
          dimensions: z
            .array(z.number().finite().positive().max(1000))
            .length(3),
          sourceTransform: transform,
          hidden: z.boolean().optional(),
          placement: vec,
          quantity: z.number().int().min(1).max(10000),
          baseSlotId: key,
          heightBands: z
            .array(
              z.object({
                from: z.number().nonnegative(),
                to: z.number().positive(),
                slotId: key,
              })
            )
            .max(8),
          surfacePaint: paintSchema,
        })
      )
      .min(1)
      .max(5),
  }),
});

export function inspectMemberStl(buffer) {
  if (!buffer.length || buffer.length > 10 * 1024 * 1024)
    fail(400, "STL 大小須介於 1 byte 與 10 MB");
  let triangles = 0;
  const bounds = [
    [Infinity, Infinity, Infinity],
    [-Infinity, -Infinity, -Infinity],
  ];
  const point = (xyz) =>
    xyz.forEach((v, axis) => {
      if (!Number.isFinite(v) || Math.abs(v) > 1e6) fail(400, "模型座標無效");
      bounds[0][axis] = Math.min(bounds[0][axis], v);
      bounds[1][axis] = Math.max(bounds[1][axis], v);
    });
  if (
    buffer.length >= 84 &&
    84 + buffer.readUInt32LE(80) * 50 === buffer.length
  ) {
    triangles = buffer.readUInt32LE(80);
    if (!triangles || triangles > 200000)
      fail(400, "模型須有 1–200000 個三角面");
    for (let i = 0; i < triangles; i++)
      for (let j = 0; j < 3; j++)
        point(
          [0, 1, 2].map((axis) =>
            buffer.readFloatLE(84 + i * 50 + 12 + j * 12 + axis * 4)
          )
        );
  } else {
    const contents = buffer.toString("utf8");
    if (!/^\s*solid\b/i.test(contents) || !/endsolid\b/i.test(contents))
      fail(400, "請上傳有效 STL 模型");
    const vertices = [
      ...contents.matchAll(
        /\bvertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g
      ),
    ];
    triangles = vertices.length / 3;
    if (!Number.isInteger(triangles) || !triangles || triangles > 200000)
      fail(400, "STL 三角面格式無效");
    vertices.forEach((match) => point(match.slice(1).map(Number)));
  }
  return {
    triangleCount: triangles,
    dimensions: bounds[1].map(
      (v, i) => Math.round((v - bounds[0][i]) * 1000) / 1000
    ),
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}
const safeModel = ({ fileId, sourceFileId, ...item }) => item;
const safeRequest = ({ attachments, manifest, ...item }) => ({
  ...item,
  attachments: (attachments || []).map(({ fileId, ...meta }) => meta),
});

export async function registerMemberWorkspace(
  app,
  {
    database,
    customerFromRequest,
    createPasswordHash,
    verifyPassword,
    sanitizeCustomer,
    storeFile,
    readFile,
    sensitiveRateLimit,
    emailClient = null,
    lineClient = null,
  }
) {
  // Database reload/restore can replace its data object while the server is running.
  const data = new Proxy(
    {},
    {
      get: (_, name) => database.data[name],
      set: (_, name, value) => {
        database.data[name] = value;
        return true;
      },
    }
  );
  for (const name of MEMBER_COLLECTIONS) data[name] ||= [];
  // Serialize member writes, including quota checks, optimistic revisions, and duplicate requests.
  let tail = Promise.resolve();
  function route(method, suffix, handler, options = {}) {
    app.route({
      method,
      url: `/api/customer/workspace${suffix}`,
      ...options,
      handler: async (request, reply) => {
        const execute = async () => {
          for (const name of MEMBER_COLLECTIONS) data[name] ||= [];
          const auth = customerFromRequest(database, request);
          if (!auth.customer)
            return reply.code(401).send({ error: "請先登入會員" });
          request.memberCustomer = auth.customer;
          try {
            return await handler(request, reply, auth.customer, auth);
          } catch (error) {
            if (error instanceof z.ZodError || error instanceof SyntaxError)
              return reply
                .code(400)
                .send({ error: "資料格式不正確，請檢查欄位後重試" });
            if (error.statusCode)
              return reply
                .code(error.statusCode)
                .send({ error: error.message });
            request.log.error(error);
            return reply
              .code(500)
              .send({ error: "暫時無法完成操作，請稍後重試" });
          }
        };
        if (method === "GET") return execute();
        const result = tail.then(execute);
        tail = result.catch(() => {});
        return result;
      },
    });
  }
  function preferences(customer) {
    let item = scoped(data, "memberPreferences", customer)[0];
    if (!item) {
      item = {
        id: uid(),
        ...owner(customer),
        school: "",
        department: "",
        taxId: "",
        billingTitle: "",
        notifications: { email: true, line: false },
        deletionRequestedAt: null,
      };
      data.memberPreferences.push(item);
    }
    return item;
  }
  function projectAccess(customer, id, write = false) {
    const project = data.memberProjects.find(
      (p) =>
        p.id === id &&
        (p.workspaceId || "ws-default") ===
          (customer.workspaceId || "ws-default") &&
        (p.customerId === customer.id ||
          (!write && p.members?.includes(customer.id)))
    );
    if (!project) fail(404, "找不到這個專案");
    return project;
  }
  function checkQuota(customer, bytes) {
    const used = scoped(data, "memberModels", customer).reduce(
      (n, m) => n + m.bytes,
      0
    );
    if (
      used + bytes > 100 * 1024 * 1024 ||
      scoped(data, "memberModels", customer).length >= 100
    )
      fail(409, "模型庫已達 100 MB 或 100 個版本上限，請聯絡專員協助整理");
  }
  async function saveModel(customer, upload, metadata = {}) {
    if (!/\.stl$/i.test(upload.filename)) fail(400, "模型庫目前支援 STL");
    const inspection = inspectMemberStl(upload.buffer);
    const result = await storeFile({
      filename: upload.filename,
      buffer: upload.buffer,
      material: "PETG",
      workspaceId: customer.workspaceId || "ws-default",
    });
    const model = {
      id: uid(),
      ...owner(customer),
      fileId: result.file.id,
      sourceFileId: result.file.id,
      name: upload.filename.slice(0, 180),
      bytes: upload.buffer.length,
      ...inspection,
      rootId: "",
      version: 1,
      projectId: "",
      favorite: false,
      archivedAt: null,
      createdAt: stamp(),
      ...metadata,
    };
    model.rootId ||= model.id;
    data.memberModels.unshift(model);
    return model;
  }
  async function multipart(request) {
    if (!request.isMultipart()) fail(400, "請使用檔案上傳格式");
    let payload = {},
      total = 0;
    const uploads = [];
    for await (const part of request.parts({
      limits: {
        fileSize: 10 * 1024 * 1024,
        files: 10,
        fieldSize: 16 * 1024 * 1024,
        fields: 1,
      },
    })) {
      if (part.type === "file") {
        const buffer = await part.toBuffer();
        total += buffer.length;
        if (total > 20 * 1024 * 1024) fail(413, "本次上傳總大小超過 20 MB");
        uploads.push({
          field: part.fieldname,
          filename: part.filename,
          buffer,
        });
      } else if (part.fieldname === "payload") payload = JSON.parse(part.value);
    }
    return { payload, uploads, total };
  }
  function syncNotifications(customer) {
    const states = [
      ...(data.cases || [])
        .filter((i) => scope(i, customer))
        .map((i) => ({
          key: `case:${i.id}:${i.status}:${i.currentQuoteVersionId || ""}`,
          title: "案件進度更新",
          body: `${i.project}：${CASE_STATUS_LABELS[i.status] || "進度已更新"}`,
          link: `/portal/workspace?section=case&id=${i.id}`,
        })),
      ...(data.orders || [])
        .filter((i) => scope(i, customer))
        .map((i) => ({
          key: `order:${i.id}:${i.status}:${i.payment?.status || ""}`,
          title: "訂單進度更新",
          body: `${i.id} 的製作或付款狀態已更新`,
          link: "/portal/dashboard?tab=orders",
        })),
      ...(data.quoteRequests || [])
        .filter((i) => scope(i, customer))
        .map((i) => ({
          key: `quote:${i.id}:${i.status}:${i.messages?.at(-1)?.id || ""}`,
          title: "報價與訊息更新",
          body: `${i.project || "您的報價"} 有新的進度`,
          link: "/portal/dashboard?tab=quotes",
        })),
    ];
    for (const state of states)
      if (
        !scoped(data, "memberNotifications", customer).some(
          (n) => n.sourceKey === state.key
        )
      ) {
        notify(data, customer, state.title, state.body, state.link);
        data.memberNotifications[0].sourceKey = state.key;
      }
  }
  route("GET", "", async (request, reply, customer) => {
    syncNotifications(customer);
    preferences(customer);
    await database.write();
    return {
      customer: sanitizeCustomer(customer),
      preferences: preferences(customer),
      models: scoped(data, "memberModels", customer).map(safeModel),
      drafts: scoped(data, "memberDrafts", customer).map(
        ({ manifest, ...draft }) => ({
          ...draft,
          modelCount: manifest.models.length,
          material: manifest.settings.material,
          colorMode: manifest.settings.colorMode,
        })
      ),
      projects: data.memberProjects
        .filter(
          (p) =>
            (p.workspaceId || "ws-default") ===
              (customer.workspaceId || "ws-default") &&
            (p.customerId === customer.id || p.members?.includes(customer.id))
        )
        .map((p) => ({ ...p, isOwner: p.customerId === customer.id })),
      notifications: scoped(data, "memberNotifications", customer).slice(
        0,
        200
      ),
      requests: scoped(data, "memberRequests", customer).map(safeRequest),
      documents: scoped(data, "memberDocuments", customer),
      capabilities: {
        cloudDrafts: true,
        automatedPaidSlicing: false,
        stationId: "nthu-shuimu",
        stationName: "清華大學水木書苑",
        stationMaterial: "3DSTU_PETG",
        externalNotifications: !!emailClient || !!lineClient?.configured,
        emailNotifications: !!emailClient,
        lineNotifications: !!lineClient?.configured,
      },
      storage: {
        usedBytes: scoped(data, "memberModels", customer).reduce(
          (n, m) => n + m.bytes,
          0
        ),
        maxBytes: 100 * 1024 * 1024,
      },
    };
  });
  route("POST", "/models", async (request, reply, customer) => {
    const { payload, uploads, total } = await multipart(request);
    const meta = z
      .object({ parentId: key.optional(), projectId: text(100).optional() })
      .parse(payload);
    if (uploads.length !== 1) fail(400, "請一次上傳一個模型版本");
    if (meta.projectId) projectAccess(customer, meta.projectId, true);
    const parent = meta.parentId
      ? find(data, "memberModels", customer, meta.parentId)
      : null;
    checkQuota(customer, total);
    const version = parent
      ? 1 +
        Math.max(
          ...scoped(data, "memberModels", customer)
            .filter((m) => m.rootId === parent.rootId)
            .map((m) => m.version)
        )
      : 1;
    const model = await saveModel(customer, uploads[0], {
      rootId: parent?.rootId || "",
      version,
      projectId: meta.projectId || parent?.projectId || "",
    });
    await database.write();
    return reply.code(201).send({ model: safeModel(model) });
  });
  route("PATCH", "/models/:id", async (request, reply, customer) => {
    const update = z
      .object({
        name: text(180).min(1).optional(),
        favorite: z.boolean().optional(),
        archived: z.boolean().optional(),
        projectId: text(100).optional(),
      })
      .parse(request.body);
    const model = find(data, "memberModels", customer, request.params.id);
    if (update.projectId) projectAccess(customer, update.projectId, true);
    if (update.archived !== undefined) {
      model.archivedAt = update.archived ? stamp() : null;
      delete update.archived;
    }
    Object.assign(model, update);
    await database.write();
    return { model: safeModel(model) };
  });
  route("GET", "/models/:id/file", async (request, reply, customer) => {
    const model = find(data, "memberModels", customer, request.params.id);
    const file = data.files.find(
      (f) =>
        f.id ===
          (request.query.source === "1" ? model.sourceFileId : model.fileId) &&
        (f.workspaceId || "ws-default") ===
          (customer.workspaceId || "ws-default")
    );
    if (!file) fail(404, "模型檔案不存在");
    reply
      .header("cache-control", "private, no-store")
      .type("application/octet-stream");
    return reply.send(await readFile(file));
  });
  async function saveDraft(request, reply, customer) {
    const { payload, uploads, total } = await multipart(request);
    const parsed = draftSchema.parse(payload),
      manifest = parsed.manifest;
    // Keep the handoff contract explicit and server-owned; no client estimate/profile is trusted.
    Object.assign(manifest, {
      purpose: "paid-quote",
      status: "awaiting_machine_profile",
      machineProfileId: null,
      materialProfileId: null,
      estimate: null,
      referenceBed: {
        width: 260,
        depth: 260,
        height: 260,
        unit: "mm",
        isProductionBed: false,
      },
      geometry: {
        bakedScaleAndRotation: true,
        localOrigin: "xy-centered-z-grounded",
        placements: "plate-center-mm",
        quantityLayout: "one-copy-preview-per-model",
      },
    });
    const existing = request.params.id
      ? find(data, "memberDrafts", customer, request.params.id)
      : null;
    if (existing?.caseId) fail(409, "已送出的草稿不可覆寫，請另存新草稿");
    if (existing && parsed.revision !== existing.revision)
      fail(409, "此草稿已在其他視窗更新，請重新開啟後編輯");
    if (parsed.projectId) projectAccess(customer, parsed.projectId, true);
    const files = uploads.filter((f) => f.field === "files"),
      sources = uploads.filter((f) => f.field === "sources");
    if (
      files.length !== manifest.models.length ||
      sources.length !== files.length ||
      files.length + sources.length !== uploads.length
    )
      fail(400, "模型與原始檔案數量不一致");
    if (
      new Set(manifest.colorSlots.map((s) => s.id)).size !==
        manifest.colorSlots.length ||
      new Set(manifest.models.map((m) => m.id)).size !== manifest.models.length
    )
      fail(400, "模型或色槽編號重複");
    const slots = new Set(manifest.colorSlots.map((s) => s.id));
    for (const [i, model] of manifest.models.entries()) {
      const info = inspectMemberStl(files[i].buffer);
      inspectMemberStl(sources[i].buffer);
      if (model.fileIndex !== i || !slots.has(model.baseSlotId))
        fail(400, "模型或基底色設定不一致");
      // A draft may be unfinished. Validate placement when submitting, not saving.
      const sorted = [...model.heightBands].sort((a, b) => a.from - b.from);
      if (
        sorted.some(
          (b, j) =>
            b.to <= b.from ||
            b.to > info.dimensions[2] + 0.01 ||
            !slots.has(b.slotId) ||
            (j && b.from < sorted[j - 1].to)
        )
      )
        fail(400, "換色高度設定無效");
      const paint = model.surfacePaint;
      if (
        paint &&
        (paint.geometrySha256 !== info.sha256 ||
          paint.triangleCount !== info.triangleCount ||
          new Set(paint.faces.map((f) => f[0])).size !== paint.faces.length ||
          paint.faces.some(
            ([face, slot]) => face >= info.triangleCount || !slots.has(slot)
          ))
      )
        fail(400, "上色資料與模型不符，請重新保存");
      model.dimensions = info.dimensions;
    }
    const reusable = files.map((file, i) => {
      const sourceSha = createHash("sha256")
        .update(sources[i].buffer)
        .digest("hex");
      const sha = createHash("sha256").update(file.buffer).digest("hex");
      return scoped(data, "memberModels", customer).find(
        (m) =>
          !m.archivedAt &&
          m.sha256 === sha &&
          m.sourceSha256 === sourceSha &&
          m.projectId === parsed.projectId
      );
    });
    const newBytes = files.reduce(
      (n, f, i) =>
        n + (reusable[i] ? 0 : f.buffer.length + sources[i].buffer.length),
      0
    );
    if (newBytes) checkQuota(customer, newBytes);
    if (
      scoped(data, "memberModels", customer).length +
        reusable.filter((m) => !m).length >
      100
    )
      fail(409, "模型版本數量已達上限");
    const modelIds = [];
    for (const [i, file] of files.entries()) {
      if (reusable[i]) {
        modelIds.push(reusable[i].id);
        continue;
      }
      const oldIndex = existing?.manifest.models.findIndex(
        (m) => m.id === manifest.models[i].id
      );
      const oldModel =
        existing && oldIndex >= 0
          ? data.memberModels.find((m) => m.id === existing.modelIds[oldIndex])
          : null;
      const version = oldModel
        ? 1 +
          Math.max(
            ...scoped(data, "memberModels", customer)
              .filter((m) => m.rootId === oldModel.rootId)
              .map((m) => m.version)
          )
        : 1;
      const saved = await saveModel(customer, file, {
        projectId: parsed.projectId,
        bytes: file.buffer.length + sources[i].buffer.length,
        rootId: oldModel?.rootId || "",
        version,
        sourceSha256: createHash("sha256")
          .update(sources[i].buffer)
          .digest("hex"),
      });
      const source = await storeFile({
        filename: sources[i].filename,
        buffer: sources[i].buffer,
        workspaceId: customer.workspaceId || "ws-default",
        material: manifest.settings.material,
      });
      saved.sourceFileId = source.file.id;
      modelIds.push(saved.id);
    }
    const draft = existing || {
      id: uid(),
      ...owner(customer),
      createdAt: stamp(),
      revision: 0,
    };
    Object.assign(draft, {
      name: parsed.name,
      projectId: parsed.projectId,
      manifest,
      modelIds,
      revision: draft.revision + 1,
      updatedAt: stamp(),
    });
    if (!existing) data.memberDrafts.unshift(draft);
    await database.write();
    return { draft };
  }
  route("POST", "/drafts", saveDraft);
  route("PUT", "/drafts/:id", saveDraft);
  route("GET", "/drafts/:id", async (request, reply, customer) => ({
    draft: find(data, "memberDrafts", customer, request.params.id),
  }));
  route("DELETE", "/drafts/:id", async (request, reply, customer) => {
    const draft = find(data, "memberDrafts", customer, request.params.id);
    data.memberDrafts.splice(data.memberDrafts.indexOf(draft), 1);
    await database.write();
    return { ok: true };
  });
  route("POST", "/drafts/:id/submit", async (request, reply, customer) => {
    const draft = find(data, "memberDrafts", customer, request.params.id);
    if (draft.caseId)
      return { case: publicCase(ownedCase(data, customer, draft.caseId)) };
    const input = z
      .object({
        checksAccepted: z.literal(true),
        deliveryMethod: z.enum(["delivery", "pickup"]),
        addressId: text(100).default(""),
      })
      .parse(request.body);
    const address =
      input.deliveryMethod === "delivery"
        ? (customer.addresses || []).find((a) => a.id === input.addressId)
        : null;
    if (input.deliveryMethod === "delivery" && !address)
      fail(400, "請先設定並選擇收件地址");
    const manifest = draft.manifest,
      modelRecords = draft.modelIds.map((id) =>
        find(data, "memberModels", customer, id)
      );
    if (draftLayoutIssues(manifest).length)
      fail(400, draftLayoutIssues(manifest)[0]);
    const intake = caseIntakeSchema.parse({
      mode: "agent",
      source: "website",
      hasModel: true,
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone || "",
        company: customer.company || "",
      },
      project: draft.name,
      notes: manifest.settings.notes,
      defaults: {
        material: manifest.settings.material,
        quantity: 1,
        quality: "Custom",
        layerHeight: String(manifest.settings.layerHeight),
        infill: manifest.settings.infill,
        walls: manifest.settings.walls,
        support: manifest.settings.autoSupports ? "Auto" : "None",
      },
      dueDate: manifest.settings.dueDate,
      fileIds: modelRecords.map((m) => m.fileId),
      parts: manifest.models.map((m, i) => ({
        name: m.name,
        fileId: modelRecords[i].fileId,
        quantity: m.quantity,
        material: manifest.settings.material,
        color:
          manifest.settings.colorMode === "multi"
            ? `多色：${manifest.colorSlots
                .map((s) => s.label)
                .join("／")}`.slice(0, 80)
            : manifest.colorSlots.find((s) => s.id === m.baseSlotId)?.label ||
              "",
      })),
    });
    const result = createCaseFromIntake(database, intake, {
      workspaceId: customer.workspaceId || "ws-default",
      systemGeneratedProject: true,
    });
    result.caseRecord.workspaceDraft = structuredClone(manifest);
    result.caseRecord.workspaceModelIds = [...draft.modelIds];
    result.caseRecord.memberProjectId = draft.projectId;
    result.caseRecord.deliveryPreference = {
      method: input.deliveryMethod,
      address: address ? structuredClone(address) : null,
    };
    result.caseRecord.customerRiskAcceptance = {
      acceptedAt: stamp(),
      referenceBedOnly: true,
      manualQuoteRequired: true,
    };
    draft.caseId = result.caseRecord.id;
    notify(
      data,
      customer,
      "已收到製作需求",
      "模型與配色已送交專員確認，報價確認後才安排製作。",
      `/portal/workspace?section=case&id=${draft.caseId}`
    );
    await database.write();
    return reply.code(201).send({ case: publicCase(result.caseRecord) });
  });
  route("GET", "/cases/:id", async (request, reply, customer) => {
    const item = ownedCase(data, customer, request.params.id);
    return {
      case: {
        ...publicCase(item),
        notes: item.notes,
        memberProjectId: item.memberProjectId || "",
        workspaceDraft: item.workspaceDraft || null,
        history: (item.statusHistory || []).map((h) => ({
          id: h.id,
          from: h.from,
          to: h.to,
          createdAt: h.at,
        })),
        quotes: (item.quoteVersions || [])
          .filter((q) => q.sentAt)
          .map(publicQuoteVersion),
        deliveryPreference: item.deliveryPreference || null,
      },
      messages: scoped(data, "memberMessages", customer).filter(
        (m) => m.caseId === item.id
      ),
      requests: scoped(data, "memberRequests", customer)
        .filter((r) => r.caseId === item.id)
        .map(safeRequest),
    };
  });
  route(
    "POST",
    "/cases/:id/reorder-draft",
    async (request, reply, customer) => {
      const item = ownedCase(data, customer, request.params.id);
      if (!item.workspaceDraft)
        fail(409, "此舊案件尚無可還原的模型設定，請重新上傳或聯絡專員");
      const existing = scoped(data, "memberDrafts", customer).find(
        (d) => d.reorderedFromCaseId === item.id && !d.caseId
      );
      if (existing) return { draft: existing };
      const modelIds =
        item.workspaceModelIds ||
        item.fileIds.map(
          (id) =>
            scoped(data, "memberModels", customer).find((m) => m.fileId === id)
              ?.id
        );
      if (modelIds.some((id) => !id))
        fail(409, "模型版本已無法完整還原，請聯絡專員");
      const draft = {
        id: uid(),
        ...owner(customer),
        name: `${item.project}・再次製作`.slice(0, 120),
        manifest: structuredClone(item.workspaceDraft),
        projectId: item.memberProjectId || "",
        modelIds: [...modelIds],
        revision: 1,
        createdAt: stamp(),
        updatedAt: stamp(),
        reorderedFromCaseId: item.id,
      };
      data.memberDrafts.unshift(draft);
      await database.write();
      return reply.code(201).send({ draft });
    }
  );
  route("POST", "/cases/:id/messages", async (request, reply, customer) => {
    const item = ownedCase(data, customer, request.params.id);
    const body = z.object({ body: text(2000).min(1) }).parse(request.body);
    const message = {
      id: uid(),
      ...owner(customer),
      caseId: item.id,
      body: body.body,
      author: "customer",
      authorName: customer.name,
      createdAt: stamp(),
    };
    data.memberMessages.push(message);
    await database.write();
    return reply.code(201).send({ message });
  });
  route(
    "POST",
    "/cases/:id/checkout-order",
    async (request, reply, customer) => {
      const item = ownedCase(data, customer, request.params.id);
      const quote = (item.quoteVersions || []).find(
        (q) => q.id === item.currentQuoteVersionId
      );
      if (
        !quote ||
        quote.status !== "accepted" ||
        !["accepted", "awaiting_payment"].includes(item.status) ||
        item.paymentStatus === "paid"
      )
        fail(409, "請先接受有效的正式報價，已付款案件不需重複結帳");
      if (
        !Number.isFinite(Date.parse(quote.validUntil)) ||
        Date.parse(quote.validUntil) < Date.now()
      )
        fail(409, "報價已過期，請專員更新報價");
      const existing = (data.orders || []).find(
        (o) =>
          scope(o, customer) &&
          o.caseId === item.id &&
          o.quoteVersionId === quote.id
      );
      if (existing) return { order: existing };
      const order = {
        id: `ord-${uid()}`,
        ...owner(customer),
        caseId: item.id,
        quoteVersionId: quote.id,
        source: "Manual",
        customer: customer.name,
        items: item.parts.map((p) => `${p.name} × ${p.quantity}`),
        value: quote.customerTotal,
        currency: "TWD",
        discount: 0,
        status: "received",
        due: item.dueDate || "待確認",
        deliveryPreference: structuredClone(item.deliveryPreference || null),
        createdAt: stamp(),
        updatedAt: stamp(),
      };
      data.orders.unshift(order);
      item.memberOrderId = order.id;
      notify(
        data,
        customer,
        "已建立付款訂單",
        "正式報價已確認，可前往訂單與配送完成付款。",
        "/portal/dashboard?tab=orders"
      );
      await database.write();
      return reply.code(201).send({ order });
    }
  );
  route("POST", "/requests", async (request, reply, customer) => {
    const { payload, uploads } = request.isMultipart()
      ? await multipart(request)
      : { payload: request.body, uploads: [] };
    const input = z
      .object({
        type: z.enum([
          "cancellation",
          "reprint",
          "defect",
          "delivery",
          "refund",
          "other",
        ]),
        caseId: key.optional(),
        orderId: key.optional(),
        note: text(2000).min(1),
      })
      .parse(payload);
    if (!input.caseId && !input.orderId) fail(400, "請選擇案件或訂單");
    const target = input.caseId
      ? ownedCase(data, customer, input.caseId)
      : ownedOrder(data, customer, input.orderId);
    if (
      input.type === "cancellation" &&
      [
        "printing",
        "in_production",
        "completed",
        "shipped",
        "delivered",
        "cancelled",
      ].includes(target.status)
    )
      fail(409, "此階段無法直接申請取消，請改用問題回報聯絡專員");
    if (uploads.length > 3) fail(400, "最多附加三張照片");
    for (const image of uploads)
      if (
        !/\.(png|jpe?g|webp)$/i.test(image.filename) ||
        image.buffer.length > 5 * 1024 * 1024
      )
        fail(400, "照片僅支援 PNG、JPEG、WebP，每張上限 5 MB");
    if (
      scoped(data, "memberRequests", customer).some(
        (r) =>
          r.type === input.type &&
          r.caseId === input.caseId &&
          r.orderId === input.orderId &&
          ["pending", "processing"].includes(r.status)
      )
    )
      fail(409, "已有相同申請處理中");
    const record = {
      id: uid(),
      ...owner(customer),
      ...input,
      status: "pending",
      createdAt: stamp(),
      updatedAt: stamp(),
      replies: [],
      attachments: [],
    };
    for (const image of uploads) {
      const saved = await storeFile({
        ...image,
        workspaceId: customer.workspaceId || "ws-default",
      });
      record.attachments.push({
        id: uid(),
        name: image.filename,
        fileId: saved.file.id,
      });
    }
    data.memberRequests.unshift(record);
    notify(
      data,
      customer,
      "已收到您的申請",
      "專員會確認申請內容，結果將保留於會員中心。",
      "/portal/workspace?section=support"
    );
    await database.write();
    return reply.code(201).send({ request: safeRequest(record) });
  });
  route(
    "GET",
    "/requests/:id/attachments/:attachmentId",
    async (request, reply, customer) => {
      const item = find(data, "memberRequests", customer, request.params.id);
      const attachment = item.attachments?.find(
        (a) => a.id === request.params.attachmentId
      );
      if (!attachment) fail(404, "找不到附件");
      const file = data.files.find((f) => f.id === attachment.fileId);
      reply
        .type("application/octet-stream")
        .header(
          "content-disposition",
          `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`
        )
        .header("cache-control", "no-store");
      return reply.send(await readFile(file));
    }
  );
  route("PATCH", "/preferences", async (request, reply, customer) => {
    const update = z
      .object({
        name: text(120).min(1),
        phone: text(60),
        company: text(120),
        school: text(120),
        department: text(120),
        billingTitle: text(120),
        taxId: z.union([z.literal(""), z.string().regex(/^\d{8}$/)]),
        notifications: z.object({ email: z.boolean(), line: z.boolean() }),
      })
      .parse(request.body);
    Object.assign(customer, {
      name: update.name,
      phone: update.phone,
      company: update.company,
      updatedAt: stamp(),
    });
    Object.assign(preferences(customer), {
      school: update.school,
      department: update.department,
      billingTitle: update.billingTitle,
      taxId: update.taxId,
      notifications: update.notifications,
    });
    await database.write();
    return {
      customer: sanitizeCustomer(customer),
      preferences: preferences(customer),
    };
  });
  route(
    "POST",
    "/password",
    async (request, reply, customer, auth) => {
      const input = z
        .object({
          currentPassword: z.string().min(1).max(256),
          newPassword: z.string().min(8).max(256),
        })
        .parse(request.body);
      if (!verifyPassword(input.currentPassword, customer.passwordHash))
        fail(403, "目前密碼不正確");
      customer.passwordHash = createPasswordHash(input.newPassword);
      customer.resetTokenHash = "";
      customer.resetTokenExpiresAt = "";
      data.customerSessions = data.customerSessions.filter(
        (s) => s.customerId !== customer.id || s.id === auth.session.id
      );
      await database.write();
      return { ok: true };
    },
    { config: { rateLimit: sensitiveRateLimit } }
  );
  route("GET", "/sessions", async (request, reply, customer, auth) => ({
    sessions: data.customerSessions
      .filter((s) => scope(s, customer))
      .map((s) => ({
        id: s.id,
        current: s.id === auth.session.id,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        expiresAt: s.expiresAt,
        device: s.device || "未記錄裝置資訊",
      })),
  }));
  route("DELETE", "/sessions/:id", async (request, reply, customer, auth) => {
    const session = data.customerSessions.find(
      (s) => s.id === request.params.id && scope(s, customer)
    );
    if (!session) fail(404, "找不到登入紀錄");
    data.customerSessions.splice(data.customerSessions.indexOf(session), 1);
    await database.write();
    return { ok: true, signedOut: session.id === auth.session.id };
  });
  route(
    "POST",
    "/deletion-request",
    async (request, reply, customer) => {
      const input = z
        .object({ password: z.string().min(1).max(256) })
        .parse(request.body);
      if (!verifyPassword(input.password, customer.passwordHash))
        fail(403, "密碼不正確");
      preferences(customer).deletionRequestedAt ||= stamp();
      const exists = scoped(data, "memberRequests", customer).some(
        (r) => r.type === "account_deletion" && r.status === "pending"
      );
      if (!exists)
        data.memberRequests.unshift({
          id: uid(),
          ...owner(customer),
          type: "account_deletion",
          note: "會員申請刪除帳號與個人資料",
          status: "pending",
          createdAt: stamp(),
          updatedAt: stamp(),
          replies: [],
        });
      await database.write();
      return {
        ok: true,
        requestedAt: preferences(customer).deletionRequestedAt,
      };
    },
    { config: { rateLimit: sensitiveRateLimit } }
  );
  route("PATCH", "/notifications", async (request, reply, customer) => {
    const { id } = z.object({ id: key.optional() }).parse(request.body);
    const list = id
      ? [find(data, "memberNotifications", customer, id)]
      : scoped(data, "memberNotifications", customer);
    list.forEach((n) => (n.readAt ||= stamp()));
    await database.write();
    return { ok: true };
  });
  route("POST", "/projects", async (request, reply, customer) => {
    const input = z
      .object({
        name: text(120).min(1),
        type: z.enum(["personal", "school", "lab", "business"]),
        reference: text(120).default(""),
      })
      .parse(request.body);
    if (scoped(data, "memberProjects", customer).length >= 50)
      fail(409, "專案數量已達上限");
    const project = {
      id: uid(),
      ...owner(customer),
      ...input,
      members: [],
      invitations: [],
      createdAt: stamp(),
    };
    data.memberProjects.unshift(project);
    await database.write();
    return reply.code(201).send({ project });
  });
  route(
    "POST",
    "/projects/:id/invitations",
    async (request, reply, customer) => {
      const project = projectAccess(customer, request.params.id, true);
      const { email } = z.object({ email: z.email() }).parse(request.body);
      const target = data.customers.find(
        (c) =>
          c.email?.toLowerCase() === email.toLowerCase() &&
          (c.workspaceId || "ws-default") ===
            (customer.workspaceId || "ws-default")
      );
      if (!target || target.id === customer.id)
        fail(400, "請填寫另一位已註冊會員的電子郵件");
      if (
        !project.invitations.includes(target.id) &&
        !project.members.includes(target.id)
      ) {
        project.invitations.push(target.id);
        notify(
          data,
          target,
          "專案協作邀請",
          `${customer.name} 邀請您檢視「${project.name}」的共用模型與專案資料。`,
          `/portal/workspace?section=projects&invitation=${project.id}`
        );
      }
      await database.write();
      return { ok: true };
    }
  );
  route("GET", "/invitations", async (request, reply, customer) => ({
    invitations: data.memberProjects
      .filter(
        (p) =>
          p.invitations?.includes(customer.id) &&
          (p.workspaceId || "ws-default") ===
            (customer.workspaceId || "ws-default")
      )
      .map((p) => ({ id: p.id, name: p.name })),
  }));
  route("POST", "/projects/:id/accept", async (request, reply, customer) => {
    const project = data.memberProjects.find(
      (p) =>
        p.id === request.params.id &&
        p.invitations?.includes(customer.id) &&
        (p.workspaceId || "ws-default") ===
          (customer.workspaceId || "ws-default")
    );
    if (!project) fail(404, "找不到邀請");
    project.invitations = project.invitations.filter(
      (id) => id !== customer.id
    );
    project.members.push(customer.id);
    await database.write();
    return { ok: true };
  });
  route(
    "DELETE",
    "/projects/:id/members/:memberId",
    async (request, reply, customer) => {
      const project = projectAccess(customer, request.params.id, true);
      project.members = project.members.filter(
        (id) => id !== request.params.memberId
      );
      project.invitations = project.invitations.filter(
        (id) => id !== request.params.memberId
      );
      await database.write();
      return { ok: true };
    }
  );
  route("GET", "/projects/:id", async (request, reply, customer) => {
    const project = projectAccess(customer, request.params.id);
    return {
      project,
      models: data.memberModels
        .filter(
          (m) =>
            m.projectId === project.id &&
            m.customerId === project.customerId &&
            !m.archivedAt
        )
        .map(safeModel),
      cases: (data.cases || [])
        .filter(
          (c) =>
            c.memberProjectId === project.id &&
            c.customerId === project.customerId
        )
        .map(publicCase),
    };
  });
  route(
    "GET",
    "/projects/:id/models/:modelId/file",
    async (request, reply, customer) => {
      const project = projectAccess(customer, request.params.id);
      const model = data.memberModels.find(
        (m) =>
          m.id === request.params.modelId &&
          m.projectId === project.id &&
          m.customerId === project.customerId &&
          !m.archivedAt
      );
      if (!model) fail(404, "找不到共用模型");
      return reply
        .type("application/octet-stream")
        .header("cache-control", "private, no-store")
        .send(await readFile(data.files.find((f) => f.id === model.fileId)));
    }
  );
  route("POST", "/free-print", async (request, reply, customer) => {
    const input = z
      .object({
        stationId: z.literal("nthu-shuimu"),
        draftId: key,
        note: text(2000).default(""),
        termsAccepted: z.literal(true),
      })
      .parse(request.body);
    const draft = find(data, "memberDrafts", customer, input.draftId);
    if (draftLayoutIssues(draft.manifest).length)
      fail(400, draftLayoutIssues(draft.manifest)[0]);
    if (
      draft.manifest.settings.material !== "PETG" ||
      draft.manifest.settings.colorMode !== "single"
    )
      fail(400, "免費列印僅限單色 3DSTU_PETG，請調整草稿設定");
    const pending = scoped(data, "memberRequests", customer).filter(
      (r) =>
        r.type === "free_print" &&
        ["pending", "processing", "approved", "ready_for_pickup"].includes(
          r.status
        )
    );
    if (pending.length) fail(409, "您已有免費列印申請處理中，請完成後再申請");
    const application = {
      id: uid(),
      ...owner(customer),
      type: "free_print",
      stationId: input.stationId,
      stationName: "清華大學水木書苑",
      material: "3DSTU_PETG",
      draftId: draft.id,
      manifest: structuredClone(draft.manifest),
      modelIds: [...draft.modelIds],
      note: input.note,
      status: "pending",
      createdAt: stamp(),
      updatedAt: stamp(),
      replies: [],
      pickupCode: null,
      termsAcceptedAt: stamp(),
    };
    data.memberRequests.unshift(application);
    notify(
      data,
      customer,
      "免費列印申請已送出",
      "水木書苑站點將確認資格與可用時段，尚未保留機台或名額。",
      "/portal/workspace?section=free-print"
    );
    await database.write();
    return reply.code(201).send({ application: safeRequest(application) });
  });
  route("GET", "/rewards", async (request, reply, customer) => {
    const earned = (data.orders || [])
      .filter((o) => scope(o, customer) && o.pointsEarned)
      .map((o) => ({
        id: `earned-${o.id}`,
        points: o.pointsEarned,
        reason: `訂單 ${o.id} 完成回饋`,
        createdAt: o.completedAt,
      }));
    const entries = [...scoped(data, "memberPointLedger", customer), ...earned];
    const events = (data.events || []).filter(
      (e) =>
        e.data?.customerId === customer.id &&
        (e.workspaceId || e.data?.workspaceId || "ws-default") ===
          (customer.workspaceId || "ws-default") &&
        e.type === "order.points_redeemed"
    );
    return {
      balance: customer.loyaltyPoints || 0,
      entries: [
        ...entries,
        ...events.map((e) => ({
          id: e.id,
          points: -Number(e.data.points || 0),
          reason: `訂單 ${e.data.orderId} 折抵`,
          createdAt: e.createdAt,
        })),
      ],
      coupons: (data.coupons || [])
        .filter(
          (c) =>
            (c.workspaceId || "ws-default") ===
              (customer.workspaceId || "ws-default") &&
            c.enabled &&
            (!c.validUntil || Date.parse(c.validUntil) > Date.now())
        )
        .map((c) => ({
          code: c.code,
          type: c.type,
          value: c.value,
          minOrderValue: c.minOrderValue,
          validUntil: c.validUntil || null,
        })),
      expirationNote: "目前未設定點數到期日；優惠是否適用以結帳時確認為準。",
    };
  });
  route("GET", "/billing", async (request, reply, customer) => ({
    orders: (data.orders || [])
      .filter((o) => scope(o, customer))
      .map((o) => ({
        id: o.id,
        value: o.value,
        discount: o.discount || 0,
        status: o.status,
        payment: o.payment || null,
        pointsRedeemed: o.pointsRedeemed || 0,
      })),
    documents: scoped(data, "memberDocuments", customer),
  }));
  route("GET", "/documents/:kind/:id", async (request, reply, customer) => {
    const { kind, id } = request.params;
    if (kind === "issued") {
      const doc = find(data, "memberDocuments", customer, id);
      const file = data.files.find((f) => f.id === doc.fileId);
      if (!file) fail(404, "找不到單據檔案");
      return reply
        .type("application/pdf")
        .header("content-disposition", "attachment; filename=document.pdf")
        .header("cache-control", "private, no-store")
        .send(await readFile(file));
    }
    if (kind === "quote") {
      const item = ownedCase(data, customer, id);
      const quote = item.quoteVersions?.find(
        (q) => q.id === item.currentQuoteVersionId
      );
      if (!quote?.sentAt) fail(404, "尚無正式報價單");
      return {
        kind,
        title: "3DRFM 報價單",
        reference: item.caseNo,
        project: item.project,
        customerName: customer.name,
        billingTitle: preferences(customer).billingTitle,
        taxId: preferences(customer).taxId,
        quote: publicQuoteVersion(quote),
        createdAt: quote.createdAt,
        notice: "本文件為報價資料，非付款證明或統一發票。",
      };
    }
    if (kind === "payment") {
      const order = ownedOrder(data, customer, id);
      if (order.payment?.status !== "paid") fail(409, "尚無已驗證付款紀錄");
      return {
        kind,
        title: "3DRFM 付款紀錄",
        reference: order.id,
        amount:
          order.payment.amount ??
          Math.max(0, Number(order.value || 0) - Number(order.discount || 0)),
        paidAt: order.payment.paidAt,
        transactionId: order.payment.transactionId,
        notice: "本文件為付款紀錄，非統一發票。",
      };
    }
    fail(404, "找不到文件");
  });
  // Operations staff can answer customer requests and publish issued document references.
  app.get("/api/member-service", async (request) => {
    if (!["Owner", "Admin", "Operator"].includes(request.user.role))
      fail(403, "沒有處理權限");
    const workspace = request.user.workspaceId || "ws-default";
    return {
      requests: data.memberRequests
        .filter((r) => r.workspaceId === workspace)
        .map(safeRequest),
      messages: data.memberMessages.filter((m) => m.workspaceId === workspace),
      deletions: data.memberPreferences.filter(
        (p) => p.workspaceId === workspace && p.deletionRequestedAt
      ),
    };
  });
  app.patch("/api/member-service/requests/:id", async (request, reply) => {
    if (
      !request.user.permissions?.includes?.("*") &&
      !["Owner", "Admin", "Operator"].includes(request.user.role)
    )
      return reply.code(403).send({ error: "沒有處理權限" });
    const item = data.memberRequests.find(
      (r) =>
        r.id === request.params.id &&
        r.workspaceId === (request.user.workspaceId || "ws-default")
    );
    if (!item) return reply.code(404).send({ error: "找不到申請" });
    const parsed = z
      .object({
        status: z.enum([
          "pending",
          "processing",
          "approved",
          "rejected",
          "ready_for_pickup",
          "completed",
        ]),
        note: text(2000).min(1),
      })
      .safeParse(request.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "請填寫處理狀態與回覆" });
    item.status = parsed.data.status;
    item.updatedAt = stamp();
    item.replies.push({
      id: uid(),
      body: parsed.data.note,
      createdAt: stamp(),
      authorName: request.user.name,
    });
    if (item.type === "free_print" && item.status === "ready_for_pickup")
      item.pickupCode ||= randomUUID().slice(0, 8).toUpperCase();
    const customer = data.customers.find((c) => c.id === item.customerId);
    if (customer)
      notify(
        data,
        customer,
        "申請處理進度更新",
        parsed.data.note,
        "/portal/workspace?section=support"
      );
    await database.write();
    return { request: safeRequest(item) };
  });
  app.post("/api/member-service/cases/:id/messages", async (request, reply) => {
    if (!["Owner", "Admin", "Operator"].includes(request.user.role))
      return reply.code(403).send({ error: "沒有回覆權限" });
    const item = (data.cases || []).find(
      (c) =>
        c.id === request.params.id &&
        c.workspaceId === (request.user.workspaceId || "ws-default")
    );
    const parsed = z
      .object({ body: text(2000).min(1) })
      .safeParse(request.body);
    if (!item || !parsed.success)
      return reply.code(400).send({ error: "案件或訊息無效" });
    const customer = data.customers.find((c) => c.id === item.customerId);
    const message = {
      id: uid(),
      ...owner(customer),
      caseId: item.id,
      ...parsed.data,
      author: "staff",
      authorName: "3DRFM 專員",
      createdAt: stamp(),
    };
    data.memberMessages.push(message);
    notify(
      data,
      customer,
      "專員回覆了案件",
      parsed.data.body,
      `/portal/workspace?section=case&id=${item.id}`
    );
    await database.write();
    return { message };
  });
  app.post("/api/member-service/documents", async (request, reply) => {
    if (!["Owner", "Admin", "Operator"].includes(request.user.role))
      return reply.code(403).send({ error: "沒有處理權限" });
    try {
      const { payload, uploads } = await multipart(request);
      const input = z
        .object({
          customerId: key,
          title: text(120).min(1),
          number: text(60).min(1),
          kind: z.enum(["invoice", "receipt"]),
        })
        .parse(payload);
      const customer = data.customers.find(
        (c) =>
          c.id === input.customerId &&
          (c.workspaceId || "ws-default") ===
            (request.user.workspaceId || "ws-default")
      );
      if (!customer) fail(404, "找不到會員");
      if (
        uploads.length !== 1 ||
        uploads[0].buffer.subarray(0, 5).toString() !== "%PDF-" ||
        !/\.pdf$/i.test(uploads[0].filename)
      )
        fail(400, "請上傳已開立的 PDF 單據");
      const file = await storeFile({
        ...uploads[0],
        workspaceId: customer.workspaceId || "ws-default",
      });
      const document = {
        id: uid(),
        ...owner(customer),
        title: input.title,
        kind: input.kind,
        number: input.number,
        fileId: file.file.id,
        createdAt: stamp(),
      };
      data.memberDocuments.unshift(document);
      notify(
        data,
        customer,
        "單據已開立",
        `${input.title} 已可下載。`,
        "/portal/workspace?section=billing"
      );
      await database.write();
      return reply.code(201).send({ document });
    } catch (error) {
      return reply.code(error.statusCode || 400).send({
        error: error.statusCode ? error.message : "單據資料格式不正確",
      });
    }
  });
  app.get("/api/member-service/models/:id/file", async (request, reply) => {
    if (!["Owner", "Admin", "Operator"].includes(request.user.role))
      return reply.code(403).send({ error: "沒有處理權限" });
    const model = data.memberModels.find(
      (m) =>
        m.id === request.params.id &&
        m.workspaceId === (request.user.workspaceId || "ws-default")
    );
    if (!model) return reply.code(404).send({ error: "找不到模型" });
    return reply
      .type("application/octet-stream")
      .send(await readFile(data.files.find((f) => f.id === model.fileId)));
  });
  app.get(
    "/api/member-service/requests/:id/attachments/:attachmentId",
    async (request, reply) => {
      if (!["Owner", "Admin", "Operator"].includes(request.user.role))
        return reply.code(403).send({ error: "沒有處理權限" });
      const item = data.memberRequests.find(
        (r) =>
          r.id === request.params.id &&
          r.workspaceId === (request.user.workspaceId || "ws-default")
      );
      const attachment = item?.attachments?.find(
        (a) => a.id === request.params.attachmentId
      );
      if (!attachment) return reply.code(404).send({ error: "找不到附件" });
      return reply
        .type("application/octet-stream")
        .header("content-disposition", "attachment; filename=attachment")
        .send(
          await readFile(data.files.find((f) => f.id === attachment.fileId))
        );
    }
  );

  // Generate in-app notifications when staff changes a case/order/quote, without waiting for the member to visit.
  // Only server-side records determine recipients; never accept a notification recipient from request data.
  app.addHook("onSend", async (request, reply, payload) => {
    if (reply.getHeader("x-layerpilot-idempotent-replay")) return payload;
    if (
      reply.statusCode >= 400 ||
      !["POST", "PATCH", "PUT", "DELETE"].includes(request.method)
    )
      return payload;
    const affected = new Set();
    if (request.memberCustomer) affected.add(request.memberCustomer.id);
    const id = request.params?.id;
    if (id)
      for (const collection of [
        "cases",
        "orders",
        "quoteRequests",
        "memberRequests",
      ]) {
        const item = (data[collection] || []).find((i) => i.id === id);
        if (item?.customerId) affected.add(item.customerId);
        if (collection === "cases" && item?.memberOrderId) {
          const order = (data.orders || []).find(
            (o) =>
              o.id === item.memberOrderId && o.workspaceId === item.workspaceId
          );
          if (order && request.url.split("?")[0].endsWith("/payments")) {
            const payment = item.payments?.[0];
            if (payment)
              order.payment = {
                provider: payment.method,
                status: payment.status,
                amount: payment.amount,
                currency: "TWD",
                transactionId: payment.reference,
                paidAt: payment.status === "paid" ? payment.recordedAt : null,
                updatedAt: stamp(),
              };
          }
          if (order && item.delivery) {
            order.carrier = item.delivery.carrier || "";
            order.trackingNumber = item.delivery.trackingNumber || "";
            order.delivery = structuredClone(item.delivery);
          }
        }
      }
    if (!affected.size) return payload;
    for (const customerId of affected) {
      const customer = (data.customers || []).find((c) => c.id === customerId);
      if (!customer) continue;
      syncNotifications(customer);
      const prefs = preferences(customer);
      for (const notification of scoped(
        data,
        "memberNotifications",
        customer
      ).slice(0, 50)) {
        notification.delivery ||= {};
        const channels = [
          {
            id: "email",
            enabled:
              prefs.notifications.email && !!emailClient && !!customer.email,
            send: () =>
              emailClient.send({
                to: customer.email,
                subject: `3DRFM｜${notification.title}`,
                text: `${notification.body}\n\n請登入 3DRFM 會員中心查看完整內容。`,
              }),
          },
          {
            id: "line",
            enabled:
              prefs.notifications.line &&
              !!lineClient?.configured &&
              /^U[0-9a-f]{32}$/i.test(customer.lineUserId || ""),
            send: async () => {
              const result = await lineClient.push(
                customer.lineUserId,
                `3DRFM｜${notification.title}\n${notification.body}`
              );
              if (!result.sent) throw new Error("send_failed");
            },
          },
        ];
        for (const channel of channels) {
          // Legacy quote-ready/message notifications already have their own transactional delivery.
          if (
            notification.sourceKey?.startsWith("quote:") ||
            notification.sourceKey?.startsWith("free-print:")
          )
            continue;
          if (!channel.enabled || notification.delivery[channel.id]) continue;
          // Claim before asynchronous delivery: concurrent requests must not send the same notification twice.
          notification.delivery[channel.id] = {
            status: "sending",
            at: stamp(),
          };
          await database.write();
          try {
            await channel.send();
            notification.delivery[channel.id] = { status: "sent", at: stamp() };
          } catch {
            notification.delivery[channel.id] = {
              status: "failed",
              at: stamp(),
            };
          }
        }
      }
    }
    await database.write();
    return payload;
  });
}
