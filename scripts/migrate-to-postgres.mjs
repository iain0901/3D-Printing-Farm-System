import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPersistenceAdapter, PostgresJSONAdapter } from "../api/persistence.mjs";

function option(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const apply = process.argv.includes("--apply");
const source = path.resolve(option("source", process.env.LAYERPILOT_DB_PATH || path.join(process.cwd(), "api", "data", "layerpilot.db.json")));
const sourceAdapterName = option("source-adapter", /\.(sqlite|sqlite3|db)$/i.test(source) ? "sqlite" : "json");
const targetUrl = option("target-url", process.env.DATABASE_URL || process.env.LAYERPILOT_DATABASE_URL || "");
const targetSchema = option("target-schema", process.env.LAYERPILOT_POSTGRES_SCHEMA || "public");
const targetKey = option("target-key", process.env.LAYERPILOT_POSTGRES_DOCUMENT_KEY || "state");

if (!targetUrl) throw new Error("DATABASE_URL or --target-url is required");

const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sourceAdapter = createPersistenceAdapter(source, { adapter: sourceAdapterName });
const state = await sourceAdapter.read();
await sourceAdapter.close?.();
if (!state || typeof state !== "object") throw new Error(`No state document found in ${source}`);

const arrays = Object.entries(state).filter(([, value]) => Array.isArray(value));
const summary = {
  source,
  sourceAdapter: sourceAdapterName,
  target: "PostgreSQL",
  targetSchema,
  targetKey,
  schemaVersion: Number(state.dataMeta?.schemaVersion || 0),
  documentSha256: digest(state),
  collections: Object.fromEntries(arrays.map(([key, value]) => [key, value.length])),
  mode: apply ? "apply" : "dry-run"
};

if (!apply) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write("Dry-run complete. Add --apply to write and verify the PostgreSQL document.\n");
  process.exit(0);
}

const target = new PostgresJSONAdapter({ connectionString: targetUrl, schema: targetSchema, documentKey: targetKey });
try {
  await target.write(state);
  const verified = await target.read();
  const verifiedDigest = digest(verified);
  if (verifiedDigest !== summary.documentSha256) throw new Error(`Verification digest mismatch: ${verifiedDigest}`);
  process.stdout.write(`${JSON.stringify({ ...summary, verified: true, verifiedSha256: verifiedDigest }, null, 2)}\n`);
} finally {
  await target.close();
}

if (fileURLToPath(import.meta.url) !== path.resolve(process.argv[1])) process.exitCode = 0;
