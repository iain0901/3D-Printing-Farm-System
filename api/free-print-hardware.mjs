// Only server-built commands reach the printer. No member-supplied G-code,
// URLs, temperatures, filenames, or API credentials are accepted here.
export async function stationHardwareCommand(
  bridge,
  command,
  { fetchImpl = fetch } = {}
) {
  const base = bridge.baseUrl.replace(/\/+$/, "");
  const headers = {
    "X-Api-Key": bridge.apiKey || "",
    "Content-Type": "application/json",
  };
  async function post(path, payload, multipart = false) {
    const response = await fetchImpl(base + path, {
      method: "POST",
      headers: multipart ? { "X-Api-Key": bridge.apiKey || "" } : headers,
      body: multipart ? payload : JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`機台未接受操作（${response.status}）`);
    return response;
  }
  if (!["octoprint", "moonraker"].includes(bridge.kind))
    throw new Error("此機台連線尚不支援會員操作。");
  if (command.action === "start") {
    const form = new FormData();
    form.append(
      "file",
      new Blob([command.bytes], { type: "text/plain" }),
      command.filename
    );
    if (bridge.kind === "octoprint") {
      form.append("select", "true");
      form.append("print", "true");
      await post("/api/files/local", form, true);
    } else {
      form.append("root", "gcodes");
      await post("/server/files/upload", form, true);
      await post("/printer/print/start", { filename: command.filename });
    }
    return;
  }
  if (["pause", "resume", "cancel"].includes(command.action)) {
    if (bridge.kind === "moonraker")
      await post(`/printer/print/${command.action}`, {});
    else
      await post(
        "/api/job",
        command.action === "cancel"
          ? { command: "cancel" }
          : { command: "pause", action: command.action }
      );
    return;
  }
  if (bridge.kind === "octoprint") {
    if (command.action === "home")
      await post("/api/printer/printhead", {
        command: "home",
        axes: ["x", "y", "z"],
      });
    else if (command.action === "jog")
      await post("/api/printer/printhead", {
        command: "jog",
        absolute: false,
        [command.axis]: command.distance,
        speed: 600,
      });
    else if (command.action === "preheat" || command.action === "cooldown") {
      await post("/api/printer/tool", {
        command: "target",
        targets: { tool0: command.nozzle },
      });
      await post("/api/printer/bed", {
        command: "target",
        target: command.bed,
      });
    } else if (command.action === "load" || command.action === "unload")
      await post("/api/printer/tool", {
        command: "extrude",
        amount: command.action === "load" ? 10 : -10,
        speed: 120,
      });
    else throw new Error("不支援此操作");
  } else {
    let script;
    if (command.action === "home") script = "G28";
    else if (command.action === "jog")
      script = `SAVE_GCODE_STATE NAME=RFM_MEMBER\nG91\nG1 ${command.axis.toUpperCase()}${
        command.distance
      } F600\nRESTORE_GCODE_STATE NAME=RFM_MEMBER`;
    else if (command.action === "preheat" || command.action === "cooldown")
      script = `M104 S${command.nozzle}\nM140 S${command.bed}`;
    else if (command.action === "load" || command.action === "unload")
      script = `SAVE_GCODE_STATE NAME=RFM_MEMBER\nM83\nG1 E${
        command.action === "load" ? 10 : -10
      } F120\nRESTORE_GCODE_STATE NAME=RFM_MEMBER`;
    else throw new Error("不支援此操作");
    await post("/printer/gcode/script", { script });
  }
}
