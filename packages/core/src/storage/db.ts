import Database, { type Database as DatabaseType } from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LifecoachConfig } from "../config/index.js";
import { LifecoachError } from "../util/errors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

export interface DbHandle {
  db: DatabaseType;
  embeddingDim: number;
  close: () => void;
}

export const openDb = (config: LifecoachConfig): DbHandle => {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

  const db = new Database(config.dbPath);
  db.pragma("busy_timeout = 5000");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  // 32 MB page cache — SQLite default of ~2 MB is sized for embedded devices.
  // The daily Monarch sync + nightly reflection scan are read-heavy and benefit
  // measurably; the negative sign means "kibibytes" (positive would mean pages).
  db.pragma("cache_size = -32000");
  // Sort/temp tables in memory rather than spilling to disk — avoids extra I/O
  // for ORDER BY over large transaction ranges.
  db.pragma("temp_store = MEMORY");

  try {
    sqliteVec.load(db);
  } catch (err) {
    throw new LifecoachError(
      `Failed to load sqlite-vec extension: ${(err as Error).message}. ` +
        `Make sure better-sqlite3 was built against a SQLite that supports loadable extensions.`,
      "SQLITE_VEC_LOAD_FAILED",
    );
  }

  // Create the embeddings virtual table before running migrations so that any
  // migration that references the `embeddings` table (e.g. purge scripts) does
  // not fail on a fresh database.  The dim-mismatch guard runs after migrations
  // once the `meta` table exists (created by 001_init.sql).
  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(embedding FLOAT[${config.embeddingDim}])`,
  );
  runMigrations(db);
  ensureEmbeddingTable(db, config.embeddingDim);
  upsertMeta(db, "embedding_dim", String(config.embeddingDim));

  return {
    db,
    embeddingDim: config.embeddingDim,
    close: () => db.close(),
  };
};

const runMigrations = (db: DatabaseType): void => {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);

  // Check applied status per-iteration rather than caching upfront: an earlier
  // migration may rewrite _migrations rows (e.g. a repair that renames old
  // entries to match files that were renamed on disk), and later iterations
  // must see those updates.
  const isApplied = db.prepare("SELECT 1 FROM _migrations WHERE name = ?");

  for (const file of files) {
    if (isApplied.get(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations(name, applied_at) VALUES (?, ?)").run(
        file,
        Date.now(),
      );
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw new LifecoachError(
        `Migration ${file} failed: ${(err as Error).message}`,
        "MIGRATION_FAILED",
      );
    }
  }
};

const ensureEmbeddingTable = (db: DatabaseType, dim: number): void => {
  const existing = db
    .prepare("SELECT value FROM meta WHERE key = 'embedding_dim'")
    .get() as { value: string } | undefined;

  if (existing && Number(existing.value) !== dim) {
    throw new LifecoachError(
      `Embedding dimension mismatch: DB has ${existing.value}, config wants ${dim}. ` +
        `Re-embed all entries or change LIFECOACH_EMBEDDING_DIM.`,
      "EMBED_DIM_MISMATCH",
    );
  }

  db.exec(
    `CREATE VIRTUAL TABLE IF NOT EXISTS embeddings USING vec0(embedding FLOAT[${dim}])`,
  );
};

const upsertMeta = (db: DatabaseType, key: string, value: string): void => {
  db.prepare(
    `INSERT INTO meta(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
};
