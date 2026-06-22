function cleanBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
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

export async function sendBridgeCommand(bridge, action, options = {}) {
  if (bridge.kind === "octoprint") return sendOctoPrintCommand({ ...bridge, action, ...options });
  if (bridge.kind === "moonraker") return sendMoonrakerCommand({ ...bridge, action, ...options });
  return { ok: true, skipped: true };
}
