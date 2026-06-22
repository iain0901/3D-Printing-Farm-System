import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("3DSTU FarmFlow license", () => {
  it("documents the customer-use permission and resale restrictions", async () => {
    const [license, readme, packageJson, licenseZhTw, licenseZhCn] = await Promise.all([
      readFile("LICENSE.md", "utf8"),
      readFile("README.md", "utf8"),
      readFile("package.json", "utf8"),
      readFile("LICENSE.zh-TW.md", "utf8"),
      readFile("LICENSE.zh-CN.md", "utf8")
    ]);
    const pkg = JSON.parse(packageJson);

    expect(pkg.name).toBe("3dstu-farmflow");
    expect(pkg.license).toBe("SEE LICENSE IN LICENSE.md");
    expect(pkg.author).toBe("3DSTU <support@3dstu.com>");
    expect(pkg.bugs.email).toBe("support@3dstu.com");
    expect(license).toContain("3DSTU Farm Customer Source-Available License");
    expect(license).toContain("source-available license, not an open source license");
    expect(license).toContain("3DSTU farm customers");
    expect(license).toContain("earn revenue from physical printed parts");
    expect(license).toContain("sell, rent, lease, sublicense, publish, distribute");
    expect(license).toContain("hosted service, managed service, SaaS product");
    expect(license).toContain("support@3dstu.com");
    expect(readme).toContain("free SaaS platform for 3DSTU farm customers");
    expect(readme).toContain("may not sell, redistribute, rebrand, host, white-label");
    expect(readme).toContain("README.zh-TW.md");
    expect(readme).toContain("README.zh-CN.md");
    expect(readme).toContain("support@3dstu.com");
    expect(licenseZhTw).toContain("如果需要專業技術支援或安裝設定服務");
    expect(licenseZhCn).toContain("如果需要专业技术支持或安装设置服务");
  });
});
