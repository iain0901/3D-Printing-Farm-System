import { DatabaseSync } from "node:sqlite";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { JSONFile } from "lowdb/node";
import pg from "pg";

const { Pool } = pg;

function postgresSslConfig(value = process.env.LAYERPILOT_POSTGRES_SSL) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!["1", "true", "yes", "require"].includes(normalized)) return undefined;
  return { rejectUnauthorized: process.env.LAYERPILOT_POSTGRES_SSL_REJECT_UNAUTHORIZED !== "false" };
}

export class PostgresJSONAdapter {
  constructor(options = {}) {
    this.connectionString = options.connectionString || process.env.DATABASE_URL || process.env.LAYERPILOT_DATABASE_URL;
    this.documentKey = options.documentKey || process.env.LAYERPILOT_POSTGRES_DOCUMENT_KEY || "state";
    this.schema = options.schema || process.env.LAYERPILOT_POSTGRES_SCHEMA || "public";
    this.persistenceLabel = "postgres-jsonb";
    this.pool = options.pool || null;
    this.poolFactory = options.poolFactory || ((poolOptions) => new Pool(poolOptions));
    this.ownsPool = !options.pool;
    this.ready = false;
  }

  quotedIdentifier(value) {
    const normalized = String(value || "public");
    if (!/^[a-z_][a-z0-9_]*$/i.test(normalized)) throw new Error("Invalid PostgreSQL schema name");
    return `"${normalized}"`;
  }

  async ensureDatabase() {
    if (this.ready) return this.pool;
    if (!this.connectionString && !this.pool) throw new Error("DATABASE_URL is required when LAYERPILOT_DB_ADAPTER=postgres");
    this.pool ||= this.poolFactory({
      connectionString: this.connectionString,
      max: Number(process.env.LAYERPILOT_POSTGRES_POOL_MAX || 10),
      idleTimeoutMillis: Number(process.env.LAYERPILOT_POSTGRES_IDLE_TIMEOUT_MS || 30000),
      connectionTimeoutMillis: Number(process.env.LAYERPILOT_POSTGRES_CONNECT_TIMEOUT_MS || 10000),
      ssl: postgresSslConfig()
    });
    const schema = this.quotedIdentifier(this.schema);
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.layerpilot_documents (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        revision BIGINT NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    this.ready = true;
    return this.pool;
  }

  async read() {
    const pool = await this.ensureDatabase();
    const schema = this.quotedIdentifier(this.schema);
    const result = await pool.query(`SELECT value FROM ${schema}.layerpilot_documents WHERE key = $1`, [this.documentKey]);
    const value = result.rows[0]?.value;
    if (!value) return null;
    return typeof value === "string" ? JSON.parse(value) : value;
  }

  async write(data) {
    const pool = await this.ensureDatabase();
    const schema = this.quotedIdentifier(this.schema);
    await pool.query(`
      INSERT INTO ${schema}.layerpilot_documents (key, value, revision, updated_at)
      VALUES ($1, $2::jsonb, 1, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          revision = ${schema}.layerpilot_documents.revision + 1,
          updated_at = NOW()
    `, [this.documentKey, JSON.stringify(data)]);
  }

  async close() {
    if (this.ownsPool) await this.pool?.end();
    this.pool = null;
    this.ready = false;
  }
}

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
  if (["postgres", "postgresql", "pg"].includes(adapterName)) {
    return new PostgresJSONAdapter({
      connectionString: options.connectionString,
      documentKey: options.documentKey,
      schema: options.schema,
      pool: options.pool,
      poolFactory: options.poolFactory
    });
  }
  if (adapterName === "sqlite") return new SQLiteJSONAdapter(file);
  const adapter = new JSONFile(file);
  adapter.persistenceLabel = "lowdb-json";
  return adapter;
}
