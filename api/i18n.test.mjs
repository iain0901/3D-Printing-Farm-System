import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Traditional Chinese Vue frontend", () => {
  it("ships the unified case and customer portal UI in Traditional Chinese", async () => {
    const cases = await readFile(new URL("../frontend-vue/src/views/cases/index.vue", import.meta.url), "utf8");
    const portal = await readFile(new URL("../frontend-vue/src/views/portal/Case.vue", import.meta.url), "utf8");
    expect(cases).toContain("3DRFM 案件中心");
    expect(cases).toContain("OrcaSlicer 切片");
    expect(cases).toContain("登錄付款");
    expect(portal).toContain("目前總價");
    expect(portal).toContain("所有客服對話會保留在 Chatwoot");
  });

  it("uses the Vue router as the single maintained browser frontend", async () => {
    const router = await readFile(new URL("../frontend-vue/src/router/index.js", import.meta.url), "utf8");
    const config = await readFile(new URL("../frontend-vue/src/config/setting.config.js", import.meta.url), "utf8");
    expect(router).toContain("name: 'Cases'");
    expect(router).toContain("name: 'AiKnowledge'");
    expect(config).toContain("routerMode: 'hash'");
    expect(config).toContain("tokenTableName: 'layerpilot-token'");
  });
});
