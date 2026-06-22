import { DatabaseSync } from "node:sqlite";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { JSONFile } from "lowdb/node";

export class SQLiteJSONAdapter {
  constructor(file) {
    this.file = file;
    this.persistenceLabel = "sqlite";
    this.database = null;
  }

  async ensureDatabase() {
    if (this.database) return this.database;
    await mkdir(path.dirname(this.file), { recursive: true });
    this.database = new DatabaseSync(this.file);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS layerpilot_documents (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    return this.database;
  }

  async read() {
    const database = await this.ensureDatabase();
    const row = database.prepare("SELECT value FROM layerpilot_documents WHERE key = ?").get("state");
    return row?.value ? JSON.parse(row.value) : null;
  }

  async write(data) {
    const database = await this.ensureDatabase();
    database.prepare(`
      INSERT INTO layerpilot_documents (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run("state", JSON.stringify(data, null, 2), new Date().toISOString());
  }

  close() {
    try {
      this.database?.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch {
      // Best-effort checkpoint before closing; close still releases the handle.
    }
    this.database?.close();
    this.database = null;
  }
}

export function createPersistenceAdapter(file, options = {}) {
  const requested = String(options.adapter || process.env.LAYERPILOT_DB_ADAPTER || "").trim().toLowerCase();
  const inferred = /\.(sqlite|sqlite3|db)$/i.test(file) ? "sqlite" : "json";
  const adapterName = requested || inferred;
  if (adapterName === "sqlite") return new SQLiteJSONAdapter(file);
  const adapter = new JSONFile(file);
  adapter.persistenceLabel = "lowdb-json";
  return adapter;
}
