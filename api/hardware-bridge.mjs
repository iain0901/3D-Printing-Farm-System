function cleanBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function publicStatus(status = {}) {
  const { raw, ...safeStatus } = status || {};
  return safeStatus;
}

function normalizeStatus(value) {
  const state = String(value || "").toLowerCase();
  if (state.includes("print")) return "printing";
  if (state.includes("pause")) return "paused";
  if (state.includes("operational") || state.includes("ready") || state.includes("standby")) return "idle";
  if (state.includes("error") || state.includes("shutdown")) return "error";
  if (state.includes("maintenance")) return "maintenance";
  return "offline";
}

async function readJson(response) {
  if (!response.ok) throw new Error(`Bridge HTTP ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}

function octoHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { "X-Api-Key": apiKey } : {})
  };
}

function moonrakerHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    ...(apiKey ? { "X-Api-Key": apiKey } : {})
  };
}

export async function fetchOctoPrintStatus({ baseUrl, apiKey, fetchImpl = fetch }) {
  const base = cleanBaseUrl(baseUrl);
  const [printer, job] = await Promise.all([
    fetchImpl(`${base}/api/printer`, { headers: octoHeaders(apiKey) }).then(readJson),
    fetchImpl(`${base}/api/job`, { headers: octoHeaders(apiKey) }).then(readJson).catch(() => ({}))
  ]);
  const stateText = printer?.state?.text || printer?.state?.flags && Object.entries(printer.state.flags).find(([, enabled]) => enabled)?.[0];
  const tool = printer?.temperature?.tool0 || {};
  const bed = printer?.temperature?.bed || {};
  const progress = Math.round(Number(job?.progress?.completion || 0));
  return {
    status: normalizeStatus(stateText),
    progress: Number.isFinite(progress) ? progress : 0,
    nozzle: Math.round(Number(tool.actual || 0)),
    bed: Math.round(Number(bed.actual || 0)),
    targetNozzle: Math.round(Number(tool.target || 0)),
    targetBed: Math.round(Number(bed.target || 0)),
    job: job?.job?.file?.display || job?.job?.file?.name,
    raw: { printer, job }
  };
}

export async function sendOctoPrintCommand({ baseUrl, apiKey, action, fetchImpl = fetch }) {
  const base = cleanBaseUrl(baseUrl);
  if (["start", "cancel"].includes(action)) {
    const response = await fetchImpl(`${base}/api/job`, {
      method: "POST",
      headers: octoHeaders(apiKey),
      body: JSON.stringify({ command: action })
    });
    if (!response.ok && response.status !== 204) throw new Error(`Bridge HTTP ${response.status}`);
    return { ok: true };
  }
  if (["pause", "resume"].includes(action)) {
    const response = await fetchImpl(`${base}/api/job`, {
      method: "POST",
      headers: octoHeaders(apiKey),
      body: JSON.stringify({ command: "pause", action })
    });
    if (!response.ok && response.status !== 204) throw new Error(`Bridge HTTP ${response.status}`);
    return { ok: true };
  }
  if (action === "home axes") {
    const response = await fetchImpl(`${base}/api/printer/printhead`, {
      method: "POST",
      headers: octoHeaders(apiKey),
      body: JSON.stringify({ command: "home", axes: ["x", "y", "z"] })
    });
    if (!response.ok && response.status !== 204) throw new Error(`Bridge HTTP ${response.status}`);
    return { ok: true };
  }
  if (action === "preheat" || action === "cooldown") {
    const target = action === "preheat" ? 210 : 0;
    const bedTarget = action === "preheat" ? 60 : 0;
    const [tool, bed] = await Promise.all([
      fetchImpl(`${base}/api/printer/tool`, { method: "POST", headers: octoHeaders(apiKey), body: JSON.stringify({ command: "target", targets: { tool0: target } }) }),
      fetchImpl(`${base}/api/printer/bed`, { method: "POST", headers: octoHeaders(apiKey), body: JSON.stringify({ command: "target", target: bedTarget }) })
    ]);
    if ((!tool.ok && tool.status !== 204) || (!bed.ok && bed.status !== 204)) throw new Error("Bridge temperature command failed");
    return { ok: true };
  }
  return { ok: true, skipped: true };
}

export async function fetchMoonrakerStatus({ baseUrl, apiKey, fetchImpl = fetch }) {
  const base = cleanBaseUrl(baseUrl);
  const [info, objects] = await Promise.all([
    fetchImpl(`${base}/printer/info`, { headers: moonrakerHeaders(apiKey) }).then(readJson),
    fetchImpl(`${base}/printer/objects/query?print_stats&extruder&heater_bed`, { headers: moonrakerHeaders(apiKey) }).then(readJson).catch(() => ({}))
  ]);
  const status = objects?.result?.status || {};
  const printStats = status.print_stats || {};
  const extruder = status.extruder || {};
  const bed = status.heater_bed || {};
  const rawState = printStats.state || info?.result?.state || info?.state;
  return {
    status: normalizeStatus(rawState),
    progress: rawState === "printing" ? 50 : 0,
    nozzle: Math.round(Number(extruder.temperature || 0)),
    bed: Math.round(Number(bed.temperature || 0)),
    targetNozzle: Math.round(Number(extruder.target || 0)),
    targetBed: Math.round(Number(bed.target || 0)),
    job: printStats.filename,
    raw: { info, objects }
  };
}

export async function sendMoonrakerCommand({ baseUrl, apiKey, action, fetchImpl = fetch }) {
  const base = cleanBaseUrl(baseUrl);
  const endpointByAction = {
    start: "/printer/print/start",
    pause: "/printer/print/pause",
    resume: "/printer/print/resume",
    cancel: "/printer/print/cancel"
  };
  if (endpointByAction[action]) {
    const response = await fetchImpl(`${base}${endpointByAction[action]}`, { method: "POST", headers: moonrakerHeaders(apiKey) });
    if (!response.ok) throw new Error(`Bridge HTTP ${response.status}`);
    return { ok: true };
  }
  const scriptByAction = {
    "home axes": "G28",
    preheat: "M104 S210\nM140 S60",
    cooldown: "M104 S0\nM140 S0"
  };
  if (scriptByAction[action]) {
    const response = await fetchImpl(`${base}/printer/gcode/script`, {
      method: "POST",
      headers: moonrakerHeaders(apiKey),
      body: JSON.stringify({ script: scriptByAction[action] })
    });
    if (!response.ok) throw new Error(`Bridge HTTP ${response.status}`);
    return { ok: true };
  }
  return { ok: true, skipped: true };
}

export async function fetchBridgeStatus(bridge, options = {}) {
  if (bridge.kind === "octoprint") return fetchOctoPrintStatus({ ...bridge, ...options });
  if (bridge.kind === "moonraker") return fetchMoonrakerStatus({ ...bridge, ...options });
  return { status: "idle", progress: 0, nozzle: 0, bed: 0, targetNozzle: 0, targetBed: 0, job: undefined, raw: {} };
}

export async function diagnoseBridge(bridge, options = {}) {
  const started = Date.now();
  const base = cleanBaseUrl(bridge.baseUrl);
  const checks = [];
  const addCheck = (name, status, detail, recommendation = "") => checks.push({ name, status, detail, recommendation });
  const diagnostic = {
    ok: false,
    generatedAt: new Date().toISOString(),
    kind: bridge.kind,
    baseUrl: base,
    latencyMs: 0,
    status: null,
    checks,
    summary: "",
    recommendation: ""
  };
  if (bridge.kind === "manual") {
    addCheck("Adapter", "passed", "Manual bridge does not require network diagnostics.");
    diagnostic.ok = true;
    diagnostic.status = publicStatus(await fetchBridgeStatus(bridge, options));
    diagnostic.summary = "Manual bridge is configured.";
    diagnostic.recommendation = "Use manual controls or attach a hardware adapter when this printer is ready for live sync.";
    diagnostic.latencyMs = Date.now() - started;
    return diagnostic;
  }
  if (!["octoprint", "moonraker"].includes(bridge.kind)) {
    addCheck("Adapter", "failed", `Unsupported bridge kind: ${bridge.kind}`, "Choose OctoPrint, Moonraker, or Manual.");
    diagnostic.summary = "Unsupported bridge adapter.";
    diagnostic.recommendation = "Choose a supported connector type before testing again.";
    diagnostic.latencyMs = Date.now() - started;
    return diagnostic;
  }
  try {
    const parsedUrl = new URL(base);
    const protocolOk = ["http:", "https:"].includes(parsedUrl.protocol);
    addCheck("Base URL", protocolOk ? "passed" : "failed", protocolOk ? `${parsedUrl.protocol}//${parsedUrl.host}` : `Unsupported protocol ${parsedUrl.protocol}`, "Use a reachable http:// or https:// URL from the server.");
    if (!protocolOk) {
      diagnostic.summary = "Bridge URL protocol is not supported.";
      diagnostic.recommendation = "Use a reachable http:// or https:// printer bridge URL.";
      diagnostic.latencyMs = Date.now() - started;
      return diagnostic;
    }
  } catch {
    addCheck("Base URL", "failed", "Bridge URL is not a valid URL.", "Enter the full URL, for example http://octopi.local or http://192.168.1.25.");
    diagnostic.summary = "Bridge URL is invalid.";
    diagnostic.recommendation = "Enter a valid bridge URL before testing again.";
    diagnostic.latencyMs = Date.now() - started;
    return diagnostic;
  }
  if (bridge.kind === "octoprint" && !bridge.apiKey) {
    addCheck("Authentication", "warning", "No OctoPrint API key is stored.", "Most OctoPrint instances require an API key for status and job control.");
  } else if (bridge.apiKey) {
    addCheck("Authentication", "passed", "A credential is stored without being exposed in diagnostics.");
  } else {
    addCheck("Authentication", "passed", "No credential required by this adapter configuration.");
  }
  try {
    const status = await fetchBridgeStatus(bridge, options);
    diagnostic.status = publicStatus(status);
    diagnostic.ok = true;
    addCheck("Status endpoint", "passed", `Printer reported ${status.status || "unknown"} state.`);
    diagnostic.summary = `${bridge.name || "Bridge"} responded successfully.`;
    diagnostic.recommendation = "Bridge can be used for polling and printer actions.";
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bridge request failed";
    addCheck("Status endpoint", "failed", message, "Verify the bridge URL, LAN/firewall access from the server, and printer API credentials.");
    diagnostic.summary = `${bridge.name || "Bridge"} did not respond successfully.`;
    diagnostic.recommendation = "Check network reachability, API credentials, and whether the printer bridge service is online.";
  }
  diagnostic.latencyMs = Date.now() - started;
  return diagnostic;
}

export async function sendBridgeCommand(bridge, action, options = {}) {
  if (bridge.kind === "octoprint") return sendOctoPrintCommand({ ...bridge, action, ...options });
  if (bridge.kind === "moonraker") return sendMoonrakerCommand({ ...bridge, action, ...options });
  return { ok: true, skipped: true };
}
