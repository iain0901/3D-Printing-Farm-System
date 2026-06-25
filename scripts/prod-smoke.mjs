const baseUrl = (process.env.LAYERPILOT_SMOKE_URL || "http://127.0.0.1:8797").replace(/\/$/, "");
const email = process.env.LAYERPILOT_SMOKE_EMAIL || process.env.LAYERPILOT_ADMIN_EMAIL || "";
const password = process.env.LAYERPILOT_SMOKE_PASSWORD || process.env.LAYERPILOT_ADMIN_PASSWORD || "";
const metricsToken = process.env.LAYERPILOT_SMOKE_METRICS_TOKEN || process.env.LAYERPILOT_METRICS_TOKEN || "";

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

const health = await request("/api/health");
assert(health.response.ok, `Health check failed with ${health.response.status}`);
assert(health.body?.ok === true, "Health response did not report ok=true");

const readiness = await request("/api/readiness");
assert(readiness.response.ok, `Readiness check failed with ${readiness.response.status}: ${JSON.stringify(readiness.body)}`);
assert(readiness.body?.ok === true, "Readiness response did not report ok=true");

const app = await fetch(`${baseUrl}/`);
const html = await app.text();
assert(app.ok, `Frontend failed with ${app.status}`);
assert(html.includes("3DSTU FarmFlow") || html.includes('id="root"'), "Frontend HTML does not look like 3DSTU FarmFlow");

const result = {
  baseUrl,
  health: health.body,
  readiness: readiness.body,
  frontend: { status: app.status },
  auth: "skipped",
  metrics: "skipped"
};

if (email || password) {
  assert(email && password, "Set both smoke email and password, or neither");
  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  assert(login.response.ok, `Login failed with ${login.response.status}: ${JSON.stringify(login.body)}`);
  assert(login.body?.token, "Login response did not include a token");
  const state = await request("/api/state", {
    headers: { authorization: `Bearer ${login.body.token}` }
  });
  assert(state.response.ok, `Authenticated state failed with ${state.response.status}`);
  assert(Array.isArray(state.body?.printers), "State response did not include printers");
  const integrity = await request("/api/admin/integrity?checkStorage=true", {
    headers: { authorization: `Bearer ${login.body.token}` }
  });
  assert(integrity.response.ok, `Storage-aware integrity check failed with ${integrity.response.status}: ${JSON.stringify(integrity.body)}`);
  assert(integrity.body?.ok === true, `Integrity check reported errors: ${JSON.stringify(integrity.body?.errors || [])}`);
  assert(integrity.body?.storage?.checked === true, "Integrity response did not include storage coverage");
  assert(integrity.body?.storage?.complete === true, `Integrity storage.complete is false: ${JSON.stringify(integrity.body?.storage?.missing || [])}`);
  result.auth = { email, role: login.body.user?.role || "unknown", printers: state.body.printers.length };
  result.integrity = {
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
  };
}

if (metricsToken) {
  const metrics = await request("/api/metrics", {
    headers: { "x-layerpilot-metrics-token": metricsToken }
  });
  assert(metrics.response.ok, `Metrics check failed with ${metrics.response.status}: ${JSON.stringify(metrics.body)}`);
  assert(String(metrics.body).includes("layerpilot_up 1"), "Metrics response did not include layerpilot_up");
  result.metrics = "ok";
}

console.log(JSON.stringify(result, null, 2));
