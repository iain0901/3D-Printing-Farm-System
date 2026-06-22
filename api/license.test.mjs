import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("3DSTUXXX license", () => {
  it("documents the customer-use permission and resale restrictions", async () => {
    const [license, readme, packageJson] = await Promise.all([
      readFile("LICENSE.md", "utf8"),
      readFile("README.md", "utf8"),
      readFile("package.json", "utf8")
    ]);
    const pkg = JSON.parse(packageJson);

    expect(pkg.name).toBe("3dstuxxx");
    expect(pkg.license).toBe("SEE LICENSE IN LICENSE.md");
    expect(license).toContain("3DSTU Farm Customer Source-Available License");
    expect(license).toContain("source-available license, not an open source license");
    expect(license).toContain("3DSTU farm customers");
    expect(license).toContain("earn revenue from physical printed parts");
    expect(license).toContain("sell, rent, lease, sublicense, publish, distribute");
    expect(license).toContain("hosted service, managed service, SaaS product");
    expect(readme).toContain("free SaaS platform for 3DSTU farm customers");
    expect(readme).toContain("may not sell, redistribute, rebrand, host, white-label");
  });
});
