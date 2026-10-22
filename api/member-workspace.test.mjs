import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer, openDatabase } from "./server.mjs";
import { createObjectStorage } from "./object-storage.mjs";
import { inspectMemberStl } from "./member-workspace.mjs";
import { createPaymentProvider } from "./payment-providers.mjs";
import { createHmac } from "node:crypto";

const cleanups = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  while (cleanups.length) await cleanups.pop()();
});
async function fixture() {
  const directory = await mkdtemp(path.join(tmpdir(), "3drfm-member-"));
  const db = await openDatabase(path.join(directory, "state.json"));
  const app = await buildServer({
    db,
    serveStatic: false,
    objectStorageAdapter: createObjectStorage({
      provider: "local",
      root: path.join(directory, "storage"),
    }),
  });
  cleanups.push(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const register = async (name) => {
    const result = await app.inject({
      method: "POST",
      url: "/api/customer-auth/register",
      payload: {
        name,
        email: `${name}@example.test`,
        password: "member-test-123",
        phone: "0912345678",
      },
    });
    expect(result.statusCode).toBe(201);
    const value = result.json();
    return { ...value, headers: { authorization: `Bearer ${value.token}` } };
  };
  const a = await register("member-a"),
    b = await register("member-b");
  const staff = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "demo@layerpilot.test", password: "layerpilot" },
  });
  const staffHeaders = { authorization: `Bearer ${staff.json().token}` };
  const api = (customer, method, suffix, payload) =>
    app.inject({
      method,
      url: `/api/customer/workspace${suffix}`,
      headers: customer.headers,
      payload,
    });
  return { app, db, a, b, api, staffHeaders };
}
function mesh() {
  const bytes = Buffer.alloc(184);
  bytes.writeUInt32LE(2, 80);
  const triangles = [
    [
      [0, 0, 0],
      [20, 0, 0],
      [0, 30, 40],
    ],
    [
      [20, 0, 0],
      [20, 30, 40],
      [0, 30, 40],
    ],
  ];
  triangles.forEach((triangle, i) =>
    triangle
      .flat()
      .forEach((value, j) =>
        bytes.writeFloatLE(value, 84 + i * 50 + 12 + j * 4)
      )
  );
  return bytes;
}
function form(payload, files = []) {
  const boundary = "3drfm-test-boundary";
  const chunks = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${JSON.stringify(
        payload
      )}\r\n`
    ),
  ];
  for (const file of files)
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${
          file.field || "files"
        }"; filename="${
          file.name || "part.stl"
        }"\r\nContent-Type: application/octet-stream\r\n\r\n`
      ),
      file.bytes,
      Buffer.from("\r\n")
    );
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat(chunks),
  };
}
function draftPayload() {
  return {
    name: "測試上色草稿",
    manifest: {
      schemaVersion: "3drfm.quote-workspace.v2",
      settings: {
        material: "PETG",
        colorMode: "single",
        layerHeight: 0.2,
        infill: 15,
        walls: 2,
        autoSupports: true,
        autoOrient: false,
        autoArrange: false,
        dueDate: "",
        rush: false,
        notes: "保留製作需求",
      },
      colorSlots: [{ id: "slot-1", label: "森林綠", hex: "#38745a" }],
      models: [
        {
          id: "1",
          name: "part.stl",
          fileIndex: 0,
          dimensions: [20, 30, 40],
          sourceTransform: { scale: 100, x: 0, y: 0, z: 0, layFlat: false },
          placement: { x: 130, y: 130 },
          quantity: 2,
          baseSlotId: "slot-1",
          heightBands: [],
          surfacePaint: null,
        },
      ],
    },
  };
}
async function saveDraft(f, payload = draftPayload(), id = "", revision) {
  if (revision !== undefined) payload.revision = revision;
  const body = form(payload, [
    { bytes: mesh() },
    { field: "sources", bytes: mesh() },
  ]);
  return f.app.inject({
    method: id ? "PUT" : "POST",
    url: `/api/customer/workspace/drafts${id ? `/${id}` : ""}`,
    headers: { ...f.a.headers, ...body.headers },
    payload: body.payload,
  });
}

describe("member workspace ownership and durable workflows", () => {
  it("persists model versions, archives, favorites and cloud drafts without leaking file payloads or duplicating autosaves", async () => {
    const f = await fixture();
    const created = await saveDraft(f);
    expect(created.statusCode, created.body).toBe(200);
    const draft = created.json().draft;
    const raw = await f.api(f.a, "GET", `/models/${draft.modelIds[0]}/file`);
    expect(raw.rawPayload).toEqual(mesh());
    expect(
      (await f.api(f.b, "GET", `/models/${draft.modelIds[0]}/file`)).statusCode
    ).toBe(404);
    expect((await f.api(f.b, "GET", `/drafts/${draft.id}`)).statusCode).toBe(
      404
    );
    const updated = await saveDraft(f, draftPayload(), draft.id, 1);
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json().draft.revision).toBe(2);
    expect(f.db.data.memberModels.length).toBe(1);
    expect((await saveDraft(f, draftPayload(), draft.id, 1)).statusCode).toBe(
      409
    );
    await f.api(f.a, "PATCH", `/models/${draft.modelIds[0]}`, {
      favorite: true,
      archived: true,
    });
    const state = await f.api(f.a, "GET", "");
    expect(state.json().models[0]).toMatchObject({ favorite: true });
    expect(state.json().models[0].archivedAt).toBeTruthy();
    expect(state.json().models[0]).not.toHaveProperty("fileId");
    await f.db.read();
    expect(
      (await f.api(f.a, "GET", `/drafts/${draft.id}`)).json().draft.revision
    ).toBe(2);
    const malformed = form({}, [{ bytes: Buffer.from("not a model") }]);
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/customer/workspace/models",
          headers: { ...f.a.headers, ...malformed.headers },
          payload: malformed.payload,
        })
      ).statusCode
    ).toBe(400);
  });
  it("binds triangle paint to exact geometry and rejects invalid faces, slots, dimensions and stale revisions", async () => {
    const f = await fixture();
    const input = draftPayload();
    input.manifest.settings.colorMode = "multi";
    const info = inspectMemberStl(mesh());
    input.manifest.models[0].surfacePaint = {
      encoding: "stl-triangle-slot-v1",
      geometrySha256: info.sha256,
      triangleCount: 2,
      priority: "surface-over-height-over-base",
      faces: [[0, "slot-1"]],
    };
    expect((await saveDraft(f, input)).statusCode).toBe(200);
    input.manifest.models[0].surfacePaint.faces = [[2, "slot-1"]];
    expect((await saveDraft(f, input)).statusCode).toBe(400);
    input.manifest.models[0].surfacePaint.faces = [[0, "slot-deleted"]];
    expect((await saveDraft(f, input)).statusCode).toBe(400);
    input.manifest.models[0].surfacePaint.faces = [[0, "slot-1"]];
    input.manifest.models[0].surfacePaint.geometrySha256 = "0".repeat(64);
    expect((await saveDraft(f, input)).statusCode).toBe(400);
    expect(f.db.data.memberDrafts).toHaveLength(1);
  });
  it("submits an immutable case once and connects private conversation, staff replies, requests and issued PDFs", async () => {
    const f = await fixture();
    const draft = (await saveDraft(f)).json().draft;
    const result = await f.api(f.a, "POST", `/drafts/${draft.id}/submit`, {
      checksAccepted: true,
      deliveryMethod: "pickup",
    });
    expect(result.statusCode, result.body).toBe(201);
    const id = result.json().case.id;
    expect(result.json().case.project).toMatch(/\d{8}・member-a・模型001/);
    expect(
      (
        await f.api(f.a, "POST", `/drafts/${draft.id}/submit`, {
          checksAccepted: true,
          deliveryMethod: "pickup",
        })
      ).json().case.id
    ).toBe(id);
    expect((await saveDraft(f, draftPayload(), draft.id, 1)).statusCode).toBe(
      409
    );
    expect((await f.api(f.b, "GET", `/cases/${id}`)).statusCode).toBe(404);
    await f.api(f.a, "POST", `/cases/${id}/messages`, {
      body: "請確認支撐位置",
    });
    const reply = await f.app.inject({
      method: "POST",
      url: `/api/member-service/cases/${id}/messages`,
      headers: f.staffHeaders,
      payload: { body: "將提供方向與支撐建議" },
    });
    expect(reply.statusCode, reply.body).toBe(200);
    expect(
      (await f.api(f.a, "GET", `/cases/${id}`)).json().messages
    ).toHaveLength(2);
    const request = await f.api(f.a, "POST", "/requests", {
      type: "defect",
      caseId: id,
      note: "請確認表面",
    });
    expect(request.statusCode).toBe(201);
    expect(
      (
        await f.api(f.a, "POST", "/requests", {
          type: "defect",
          caseId: id,
          note: "重複送出",
        })
      ).statusCode
    ).toBe(409);
    expect(
      (
        await f.api(f.b, "POST", "/requests", {
          type: "refund",
          caseId: id,
          note: "其他人的案件",
        })
      ).statusCode
    ).toBe(404);
    const resolution = await f.app.inject({
      method: "PATCH",
      url: `/api/member-service/requests/${request.json().request.id}`,
      headers: f.staffHeaders,
      payload: { status: "processing", note: "已受理，將確認" },
    });
    expect(resolution.statusCode).toBe(200);
    const pdf = Buffer.from("%PDF-1.4\nissued invoice fixture");
    const upload = form(
      {
        customerId: f.a.customer.id,
        title: "已開立收據",
        number: "R-001",
        kind: "receipt",
      },
      [{ name: "receipt.pdf", bytes: pdf }]
    );
    const doc = await f.app.inject({
      method: "POST",
      url: "/api/member-service/documents",
      headers: { ...f.staffHeaders, ...upload.headers },
      payload: upload.payload,
    });
    expect(doc.statusCode, doc.body).toBe(201);
    const url = `/documents/issued/${doc.json().document.id}`;
    expect((await f.api(f.a, "GET", url)).rawPayload).toEqual(pdf);
    expect((await f.api(f.b, "GET", url)).statusCode).toBe(404);
  });
  it("requires accepted collaboration invitations and revokes model access when a member is removed", async () => {
    const f = await fixture();
    const project = (
      await f.api(f.a, "POST", "/projects", { name: "實驗室", type: "lab" })
    ).json().project;
    const payload = draftPayload();
    payload.projectId = project.id;
    const saved = (await saveDraft(f, payload)).json().draft;
    expect(
      (await f.api(f.b, "GET", `/projects/${project.id}`)).statusCode
    ).toBe(404);
    expect(
      (
        await f.api(f.a, "POST", `/projects/${project.id}/invitations`, {
          email: f.b.customer.email,
        })
      ).statusCode
    ).toBe(200);
    expect(
      (await f.api(f.b, "GET", `/projects/${project.id}`)).statusCode
    ).toBe(404);
    expect(
      (await f.api(f.b, "POST", `/projects/${project.id}/accept`, {}))
        .statusCode
    ).toBe(200);
    expect(
      (
        await f.api(
          f.b,
          "GET",
          `/projects/${project.id}/models/${saved.modelIds[0]}/file`
        )
      ).rawPayload
    ).toEqual(mesh());
    expect(
      (
        await f.api(f.b, "PATCH", `/models/${saved.modelIds[0]}`, {
          name: "不能修改",
        })
      ).statusCode
    ).toBe(404);
    await f.api(
      f.a,
      "DELETE",
      `/projects/${project.id}/members/${f.b.customer.id}`
    );
    expect(
      (
        await f.api(
          f.b,
          "GET",
          `/projects/${project.id}/models/${saved.modelIds[0]}/file`
        )
      ).statusCode
    ).toBe(404);
  });
  it("locks free applications to a station and single-color PETG and publishes pickup codes only after staff review", async () => {
    const f = await fixture();
    const draft = (await saveDraft(f)).json().draft;
    const payload = {
      stationId: "nthu-shuimu",
      draftId: draft.id,
      termsAccepted: true,
    };
    const application = await f.api(f.a, "POST", "/free-print", payload);
    expect(application.statusCode, application.body).toBe(201);
    expect(application.json().application).toMatchObject({
      status: "pending",
      material: "3DSTU_PETG",
      pickupCode: null,
    });
    expect((await f.api(f.a, "POST", "/free-print", payload)).statusCode).toBe(
      409
    );
    expect((await f.api(f.b, "POST", "/free-print", payload)).statusCode).toBe(
      404
    );
    const update = await f.app.inject({
      method: "PATCH",
      url: `/api/member-service/requests/${application.json().application.id}`,
      headers: f.staffHeaders,
      payload: { status: "ready_for_pickup", note: "列印完成，請到站點取件" },
    });
    expect(update.json().request.pickupCode).toMatch(/^[A-F0-9-]{8}$/);
    expect((await f.api(f.a, "GET", "")).json().requests[0]).not.toHaveProperty(
      "manifest"
    );
  });
  it("changes profile, revokes other sessions, handles deletion requests and isolates notification read state", async () => {
    const f = await fixture();
    const another = await f.app.inject({
      method: "POST",
      url: "/api/customer-auth/login",
      payload: { email: f.a.customer.email, password: "member-test-123" },
    });
    const profile = await f.api(f.a, "PATCH", "/preferences", {
      name: "小林",
      phone: "0900000000",
      company: "",
      school: "清華大學",
      department: "機械系",
      billingTitle: "清華大學",
      taxId: "",
      notifications: { email: false, line: false },
    });
    expect(profile.statusCode).toBe(200);
    expect(
      (
        await f.api(f.a, "POST", "/password", {
          currentPassword: "wrong",
          newPassword: "new-member-123",
        })
      ).statusCode
    ).toBe(403);
    expect(
      (
        await f.api(f.a, "POST", "/password", {
          currentPassword: "member-test-123",
          newPassword: "new-member-123",
        })
      ).statusCode
    ).toBe(200);
    expect(
      (
        await f.app.inject({
          method: "GET",
          url: "/api/customer/workspace",
          headers: { authorization: `Bearer ${another.json().token}` },
        })
      ).statusCode
    ).toBe(401);
    expect((await f.api(f.a, "GET", "/sessions")).json().sessions).toHaveLength(
      1
    );
    expect(
      (
        await f.api(f.a, "POST", "/deletion-request", {
          password: "new-member-123",
        })
      ).statusCode
    ).toBe(200);
    expect((await f.api(f.b, "GET", "")).json().requests).toHaveLength(0);
  });
});

describe("LINE Pay signing and server verification", () => {
  it("does not burn excess loyalty points or count coupon retries twice", async () => {
    const f = await fixture();
    f.db.data.customers.find(
      (c) => c.id === f.a.customer.id
    ).loyaltyPoints = 100;
    f.db.data.orders.push({
      id: "member-discount-order",
      customerId: f.a.customer.id,
      workspaceId: f.a.customer.workspaceId || "ws-default",
      value: 2,
      status: "received",
    });
    f.db.data.coupons.push({
      id: "coupon-member",
      workspaceId: f.a.customer.workspaceId || "ws-default",
      code: "MEMBER10",
      enabled: true,
      type: "percent",
      value: 10,
      minOrderValue: 0,
      usedCount: 0,
    });
    const post = (path, payload) =>
      f.app.inject({
        method: "POST",
        url: `/api/customer/orders/member-discount-order/${path}`,
        headers: f.a.headers,
        payload,
      });
    const first = await post("apply-coupon", { code: "MEMBER10" });
    expect(first.statusCode).toBe(200);
    expect((await post("apply-coupon", { code: "MEMBER10" })).statusCode).toBe(
      200
    );
    expect(f.db.data.coupons.at(-1).usedCount).toBe(1);
    const excess = await post("redeem-points", { points: 100 });
    expect(excess.statusCode).toBe(400);
    expect(
      f.db.data.customers.find((c) => c.id === f.a.customer.id).loyaltyPoints
    ).toBe(100);
    const valid = await post("redeem-points", { points: 10 });
    expect(valid.statusCode).toBe(200);
    expect(valid.json().remainingPoints).toBe(90);
    f.db.data.coupons.push({
      id: "other-coupon",
      workspaceId: f.a.customer.workspaceId || "ws-default",
      code: "OTHER",
      enabled: true,
      type: "percent",
      value: 5,
    });
    expect((await post("apply-coupon", { code: "OTHER" })).statusCode).toBe(
      409
    );
  });
  it("links an accepted quote to one checkout order and records verified payment on both order and case", async () => {
    const f = await fixture();
    const draft = (await saveDraft(f)).json().draft;
    const created = await f.api(f.a, "POST", `/drafts/${draft.id}/submit`, {
      checksAccepted: true,
      deliveryMethod: "pickup",
    });
    const id = created.json().case.id;
    expect(
      (await f.api(f.a, "POST", `/cases/${id}/checkout-order`, {})).statusCode
    ).toBe(409);
    const item = f.db.data.cases.find((c) => c.id === id);
    item.status = "under_review";
    const quote = await f.app.inject({
      method: "POST",
      url: `/api/cases/${id}/quotes`,
      headers: f.staffHeaders,
      payload: { breakdown: { material: 200 }, send: true },
    });
    expect(quote.statusCode, quote.body).toBe(201);
    expect(
      (await f.api(f.a, "POST", `/cases/${id}/checkout-order`, {})).statusCode
    ).toBe(409);
    const accepted = await f.app.inject({
      method: "POST",
      url: `/api/customer/cases/${id}/decision`,
      headers: f.a.headers,
      payload: { decision: "accepted" },
    });
    expect(accepted.statusCode, accepted.body).toBe(200);
    const order = (
      await f.api(f.a, "POST", `/cases/${id}/checkout-order`, {})
    ).json().order;
    expect(
      (await f.api(f.a, "POST", `/cases/${id}/checkout-order`, {})).json().order
        .id
    ).toBe(order.id);
    expect(
      (await f.api(f.b, "POST", `/cases/${id}/checkout-order`, {})).statusCode
    ).toBe(404);
    vi.stubEnv("LAYERPILOT_LINEPAY_CHANNEL_ID", "channel");
    vi.stubEnv("LAYERPILOT_LINEPAY_CHANNEL_SECRET", "secret");
    vi.stubEnv("LAYERPILOT_PUBLIC_URL", "https://example.test");
    let calls = 0;
    vi.stubGlobal("fetch", async (url, options) => {
      expect(new URL(url).hostname).toBe("api-pay.line.me");
      calls++;
      return new Response(
        JSON.stringify({
          returnCode: "0000",
          info:
            calls === 1
              ? {
                  transactionId: "2023042201206549310",
                  paymentUrl: { web: "https://web-pay.line.me/pay/test" },
                }
              : {
                  transactionId: "2023042201206549310",
                  orderId: order.id,
                  payInfo: [{ amount: 200 }],
                },
        })
      );
    });
    const checkout = await f.app.inject({
      method: "POST",
      url: `/api/customer/orders/${order.id}/checkout`,
      headers: f.a.headers,
      payload: { paymentMethod: "linepay" },
    });
    expect(checkout.statusCode, checkout.body).toBe(200);
    expect(checkout.json().payment.status).toBe("pending");
    const confirmBody = {
      orderId: order.id,
      transactionId: "2023042201206549310",
    };
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/customer/payments/linepay/confirm",
          headers: f.b.headers,
          payload: confirmBody,
        })
      ).statusCode
    ).toBe(404);
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: `/api/customer/orders/${order.id}/apply-coupon`,
          headers: f.a.headers,
          payload: { code: "any" },
        })
      ).statusCode
    ).toBe(409);
    const confirmation = await f.app.inject({
      method: "POST",
      url: "/api/customer/payments/linepay/confirm",
      headers: f.a.headers,
      payload: confirmBody,
    });
    expect(confirmation.statusCode, confirmation.body).toBe(200);
    expect(confirmation.json().payment.status).toBe("paid");
    expect(item.paymentStatus).toBe("paid");
    expect(item.payments).toHaveLength(1);
    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/customer/payments/linepay/confirm",
          headers: f.a.headers,
          payload: confirmBody,
        })
      ).statusCode
    ).toBe(200);
    expect(calls).toBe(2);
    expect(
      (await f.api(f.a, "GET", `/documents/payment/${order.id}`)).json().amount
    ).toBe(200);
    expect(
      (await f.api(f.b, "GET", `/documents/payment/${order.id}`)).statusCode
    ).toBe(404);
  });
  it("signs requests and confirms exact order, amount and 64-bit transaction IDs", async () => {
    const env = {
      LAYERPILOT_LINEPAY_CHANNEL_ID: "channel",
      LAYERPILOT_LINEPAY_CHANNEL_SECRET: "secret",
      LAYERPILOT_LINEPAY_SANDBOX: "true",
    };
    let calls = 0;
    const provider = createPaymentProvider("linepay", env, {
      fetchImpl: async (url, options) => {
        const uri = new URL(url).pathname;
        expect(new URL(url).hostname).toBe("sandbox-api-pay.line.me");
        expect(options.headers["X-LINE-Authorization"]).toBe(
          createHmac("sha256", "secret")
            .update(
              "secret" +
                uri +
                options.body +
                options.headers["X-LINE-Authorization-Nonce"]
            )
            .digest("base64")
        );
        calls++;
        return new Response(
          calls === 1
            ? '{"returnCode":"0000","info":{"transactionId":2023042201206549310,"paymentUrl":{"web":"https://web-pay.line.me/pay/test"}}}'
            : '{"returnCode":"0000","info":{"transactionId":2023042201206549310,"orderId":"order-1","payInfo":[{"amount":200}]}}'
        );
      },
    });
    const payment = await provider.createPayment({
      orderId: "order-1",
      amount: 200,
      returnUrl: "https://example.test/return",
    });
    expect(payment.transactionId).toBe("2023042201206549310");
    expect(
      (
        await provider.verifyCallback({
          orderId: "order-1",
          amount: 200,
          transactionId: payment.transactionId,
        })
      ).status
    ).toBe("paid");
    expect(
      (
        await provider.verifyCallback({
          orderId: "wrong",
          amount: 200,
          transactionId: payment.transactionId,
        })
      ).ok
    ).toBe(false);
    expect(
      (
        await provider.verifyCallback({
          orderId: "order-1",
          amount: 199,
          transactionId: payment.transactionId,
        })
      ).ok
    ).toBe(false);
    expect(
      createPaymentProvider("jkopay", {
        LAYERPILOT_JKOPAY_STORE_ID: "x",
        LAYERPILOT_JKOPAY_API_KEY: "y",
      }).configured
    ).toBe(false);
  });
});
