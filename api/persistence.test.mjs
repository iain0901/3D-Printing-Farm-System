import { describe, expect, it } from "vitest";
import { PostgresJSONAdapter } from "./persistence.mjs";

describe("PostgreSQL persistence adapter", () => {
  it("creates the JSONB document store and round-trips state", async () => {
    let stored = null;
    const queries = [];
    const pool = {
      async query(sql, values = []) {
        queries.push({ sql, values });
        if (/SELECT value/i.test(sql)) return { rows: stored ? [{ value: stored }] : [] };
        if (/INSERT INTO/i.test(sql)) stored = JSON.parse(values[1]);
        return { rows: [] };
      }
    };
    const adapter = new PostgresJSONAdapter({ pool, schema: "farmflow" });
    expect(await adapter.read()).toBeNull();
    await adapter.write({ cases: [{ id: "case-1" }] });
    expect(await adapter.read()).toEqual({ cases: [{ id: "case-1" }] });
    expect(queries.some(({ sql }) => sql.includes('CREATE TABLE IF NOT EXISTS "farmflow".layerpilot_documents'))).toBe(true);
  });

  it("rejects unsafe schema identifiers", async () => {
    const adapter = new PostgresJSONAdapter({ pool: { query: async () => ({ rows: [] }) }, schema: "public;drop table" });
    await expect(adapter.read()).rejects.toThrow("Invalid PostgreSQL schema name");
  });
});
