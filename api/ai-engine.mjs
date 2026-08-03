function asText(value) {
  return String(value || "").trim();
}

export function buildAiSystemPrompt(context = {}) {
  const knowledge = Array.isArray(context.knowledge) ? context.knowledge.slice(0, 4) : [];
  return [
    "你是 3DRFM 的 3D 列印客服助理，使用繁體中文回答。",
    "可以自然回答材料、檔案格式、建模、列印、付款、交期、運送與案件進度的問題，並協助收集需求。",
    "報價、保證交期、G-code 核准、付款確認與技術可行性必須依案件規則或交由專員。",
    "當資訊不足、涉及正式承諾、客訴、退款、異常檔案或客戶要求真人時，請明確標記 handoff。",
    context.caseNo ? `目前案件：${context.caseNo}，狀態：${context.status || "未知"}。` : "目前尚未連結案件。",
    knowledge.length ? `可引用的內部知識（只在適用時使用，不得虛構未列資訊）：\n${knowledge.map((item, index) => `${index + 1}. ${asText(item.title)}｜${asText(item.content).slice(0, 1400)}`).join("\n")}` : "目前沒有符合此問題的內部知識條目。"
  ].join("\n");
}

export function normalizeAiAnswer(value = {}) {
  const content = asText(value.content || value.answer || value.message);
  const confidence = Math.max(0, Math.min(1, Number(value.confidence ?? 0)));
  return {
    content,
    confidence,
    handoff: Boolean(value.handoff) || confidence < 0.78 || !content,
    summary: asText(value.summary).slice(0, 1000),
    intents: Array.isArray(value.intents) ? value.intents.map((item) => asText(item)).filter(Boolean).slice(0, 12) : []
  };
}

export function createAiEngine(options = {}) {
  const provider = asText(options.provider || process.env.AI_PROVIDER || "disabled").toLowerCase();
  const model = asText(options.model || process.env.AI_MODEL);
  const baseUrl = asText(options.baseUrl || process.env.AI_API_BASE_URL).replace(/\/+$/, "");
  const apiKey = asText(options.apiKey || process.env.AI_API_KEY);
  const fetchImpl = options.fetchImpl || fetch;
  const threshold = Number(options.confidenceThreshold || process.env.AI_CONFIDENCE_THRESHOLD || 0.78);
  return {
    provider,
    configured: provider !== "disabled" && Boolean(baseUrl && apiKey && model),
    async answer(input = {}) {
      if (provider === "disabled" || !baseUrl || !apiKey || !model) {
        return { content: "", confidence: 0, handoff: true, summary: "AI 引擎尚未設定，請由專員接手。", intents: [] };
      }
      const messages = [
        { role: "system", content: buildAiSystemPrompt({ ...(input.case || {}), knowledge: input.knowledge || [] }) },
        ...(Array.isArray(input.messages) ? input.messages.slice(-12).map((message) => ({ role: message.role === "assistant" ? "assistant" : "user", content: asText(message.content).slice(0, 4000) })) : [])
      ];
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, temperature: 0.3, response_format: { type: "json_object" }, messages })
      });
      if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
      const payload = await response.json();
      const raw = payload.choices?.[0]?.message?.content || "{}";
      let decoded;
      try { decoded = JSON.parse(raw); } catch { decoded = { content: raw, confidence: 0.5, handoff: true }; }
      const answer = normalizeAiAnswer(decoded);
      if (answer.confidence < threshold) answer.handoff = true;
      return answer;
    }
  };
}
