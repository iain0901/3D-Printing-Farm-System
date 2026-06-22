import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const docs = [
  ["README.zh-TW.md", "如果需要專業技術支援或安裝設定服務"],
  ["README.zh-CN.md", "如果需要专业技术支持或安装设置服务"],
  ["LICENSE.zh-TW.md", "3DSTU 農場客戶 Source-Available 授權"],
  ["LICENSE.zh-CN.md", "3DSTU 农场客户 Source-Available 许可"],
  ["deploy/ubuntu/README.zh-TW.md", "3DSTU FarmFlow Ubuntu 部署"],
  ["deploy/ubuntu/README.zh-CN.md", "3DSTU FarmFlow Ubuntu 部署"]
];

describe("localized repository documentation", () => {
  it("ships Traditional Chinese and Simplified Chinese docs with support contact", async () => {
    for (const [path, phrase] of docs) {
      const content = await readFile(path, "utf8");
      expect(content).toContain(phrase);
      expect(content).toContain("support@3dstu.com");
      expect(content).toContain("3DSTU FarmFlow");
    }
  });
});
