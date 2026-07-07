const baseUrl = (process.env.LAYERPILOT_OPS_URL || process.env.LAYERPILOT_PUBLIC_URL || "http://127.0.0.1:8797").replace(/\/$/, "");
const email = process.env.LAYERPILOT_OPS_EMAIL || process.env.LAYERPILOT_SMOKE_EMAIL || process.env.LAYERPILOT_ADMIN_EMAIL || "";
const password = process.env.LAYERPILOT_OPS_PASSWORD || process.env.LAYERPILOT_SMOKE_PASSWORD || process.env.LAYERPILOT_ADMIN_PASSWORD || "";
const metricsToken = process.env.LAYERPILOT_OPS_METRICS_TOKEN || process.env.LAYERPILOT_SMOKE_METRICS_TOKEN || process.env.LAYERPILOT_METRICS_TOKEN || "";

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (!email || !password) {
  console.error("Set LAYERPILOT_OPS_EMAIL/LAYERPILOT_OPS_PASSWORD or LAYERPILOT_ADMIN_EMAIL/LAYERPILOT_ADMIN_PASSWORD to run authenticated ops checks.");
  process.exit(2);
}

const login = await request("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password })
});
assert(login.response.ok, `Login failed with ${login.response.status}: ${JSON.stringify(login.body)}`);
assert(login.body?.token, "Login response did not include a token");

const headers = { authorization: `Bearer ${login.body.token}` };
const state = await request("/api/state", { headers });
assert(state.response.ok, `Authenticated state failed with ${state.response.status}`);
assert(Array.isArray(state.body?.printers), "State response did not include printers");
assert(Array.isArray(state.body?.queue), "State response did not include queue");

const audit = await request("/api/audit?limit=5", { headers });
assert(audit.response.ok, `Audit check failed with ${audit.response.status}: ${JSON.stringify(audit.body)}`);
assert(Array.isArray(audit.body?.events), "Audit response did not include events");

const integrity = await request("/api/admin/integrity?checkStorage=true", { headers });
assert(integrity.response.ok, `Storage-aware integrity check failed with ${integrity.response.status}: ${JSON.stringify(integrity.body)}`);
assert(integrity.body?.ok === true, `Integrity check reported errors: ${JSON.stringify(integrity.body?.errors || [])}`);
assert(integrity.body?.storage?.checked === true, "Integrity response did not include storage coverage");
assert(integrity.body?.storage?.complete === true, `Integrity storage.complete is false: ${JSON.stringify(integrity.body?.storage?.missing || [])}`);

const result = {
  baseUrl,
  auth: { email, role: login.body.user?.role || "unknown" },
  state: { printers: state.body.printers.length, queue: state.body.queue.length },
  audit: { total: audit.body.total, returned: audit.body.returned },
  integrity: {
    ok: integrity.body.ok,
    schemaVersion: integrity.body.schemaVersion,
    warnings: integrity.body.warnings?.length || 0,
    storage: {
      complete: integrity.body.storage.complete,
      expected: integrity.body.storage.expected,
      present: integrity.body.storage.present,
      missing: integrity.body.storage.missing?.length || 0,
      bytes: integrity.body.storage.bytes
    }
  },
  metrics: "skipped"
};

if (metricsToken) {
  const metrics = await request("/api/metrics", {
    headers: { "x-layerpilot-metrics-token": metricsToken }
  });
  assert(metrics.response.ok, `Metrics check failed with ${metrics.response.status}: ${JSON.stringify(metrics.body)}`);
  assert(String(metrics.body).includes("layerpilot_up 1"), "Metrics response did not include layerpilot_up");
  result.metrics = "ok";
}

console.log(JSON.stringify(result, null, 2));
