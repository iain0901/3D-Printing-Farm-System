import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("unified integration traceability", () => {
  it("documents the confirmed ownership boundaries and links them to maintained implementation", async () => {
    const [traceability, chatwootModule, caseModule, compose] = await Promise.all([
      readFile("docs/INTEGRATION_TRACEABILITY.md", "utf8"),
      readFile("api/chatwoot-module.mjs", "utf8"),
      readFile("api/cases-module.mjs", "utf8"),
      readFile("docker-compose.yml", "utf8")
    ]);
    expect(traceability).toContain("Chatwoot remains the source of truth");
    expect(traceability).toContain("Customer cancellation is handled by a specialist through Chatwoot/LINE");
    expect(traceability).toContain("OrcaSlicer runs separately");
    expect(chatwootModule).toContain('app.post("/api/integrations/chatwoot/cases"');
    expect(caseModule).toContain('z.enum(["accepted", "revision"])');
    expect(compose).toContain("orca-worker:");
  });
});
