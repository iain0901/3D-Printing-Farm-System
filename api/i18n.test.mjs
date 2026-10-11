import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Traditional Chinese Vue frontend", () => {
  it("uses the Traditional Chinese Element Plus locale and Traditional Chinese shared UI copy", async () => {
    const elementPlugin = await readFile(new URL("../frontend-vue/src/plugins/element.js", import.meta.url), "utf8");
    const login = await readFile(new URL("../frontend-vue/src/views/login/index.vue", import.meta.url), "utf8");
    const router = await readFile(new URL("../frontend-vue/src/router/index.js", import.meta.url), "utf8");
    const request = await readFile(new URL("../frontend-vue/src/utils/request.js", import.meta.url), "utf8");
    const theme = await readFile(new URL("../frontend-vue/src/layouts/components/VabTheme/index.vue", import.meta.url), "utf8");

    expect(elementPlugin).toContain("element-plus/es/locale/lang/zh-tw");
    expect(elementPlugin).not.toContain("locale/lang/zh-cn");
    expect(login).toContain("歡迎回來");
    expect(login).toContain("請輸入電子郵件");
    expect(login).not.toContain("欢迎回来");
    expect(router).toContain("title: '生產總覽'");
    expect(router).toContain("title: '訂單'");
    expect(router).not.toContain("title: '生产总览'");
    expect(request).toContain("登入狀態已失效，請重新登入");
    expect(theme).toContain("主題設定");
    expect(theme).toContain("儲存設定");
  });

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
