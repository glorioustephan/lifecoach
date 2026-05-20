import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGzip, createGunzip } from "node:zlib";
import Database from "better-sqlite3";
import * as tar from "tar";
import type { LifecoachConfig } from "../config/index.js";
import { LifecoachError } from "./errors.js";

/**
 * Snapshot the whole Lifecoach state into a single tar.gz: the SQLite DB
 * (consistent point-in-time via the online backup API, NOT a raw file copy,
 * so we don't catch the database mid-write) + the raw ingest folder + a
 * manifest. Import verifies hashes and refuses to clobber existing data
 * without --force.
 *
 * Output layout inside the archive:
 *   manifest.json
 *   lifecoach.db
 *   raw/...
 */

export interface SnapshotManifest {
  version: 1;
  createdAt: number;
  schemaVersion: number;
  /** Hostname of the machine that created the snapshot (for debugging). */
  sourceHost: string;
  /** Per-table row counts for sanity-check after import. */
  counts: Record<string, number>;
  files: Array<{
    /** Relative to the archive root. */
    path: string;
    size: number;
    sha256: string;
  }>;
}

export interface ExportOptions {
  /** Output file path. Defaults to data/snapshots/lifecoach-<ts>.tar.gz */
  out?: string;
  /** Skip data/raw/ files (default: include them). */
  noRaw?: boolean;
  onProgress?: (event: ExportEvent) => void;
}

export type ExportEvent =
  | { phase: "checkpoint" }
  | { phase: "backup-db" }
  | { phase: "stage-raw"; count: number }
  | { phase: "manifest" }
  | { phase: "compress"; targetPath: string }
  | { phase: "done"; targetPath: string; size: number };

export interface ImportOptions {
  /** Overwrite existing data/. */
  force?: boolean;
  /** Validate the archive without applying it. */
  dryRun?: boolean;
  onProgress?: (event: ImportEvent) => void;
}

export type ImportEvent =
  | { phase: "extract" }
  | { phase: "verify" }
  | { phase: "apply" }
  | { phase: "done"; manifest: SnapshotManifest };

const TABLES_FOR_COUNTS = [
  "profile",
  "sessions",
  "messages",
  "facts",
  "documents",
  "measurements",
  "reflections",
  "insights",
  "tasks",
  "goals",
  "projects",
  "ingested_files",
  "embedding_refs",
];

const sha256OfFile = async (filePath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });

const collectRawFiles = async (rawDir: string): Promise<string[]> => {
  try {
    const entries = await fs.readdir(rawDir, { withFileTypes: true, recursive: true });
    const files: string[] = [];
    for (const e of entries) {
      if (e.isFile() && e.name !== ".gitkeep") {
        const full = path.join(e.parentPath ?? rawDir, e.name);
        files.push(full);
      }
    }
    return files;
  } catch {
    return [];
  }
};

/**
 * Open a SQLite file in read mode without running our app's migrations or
 * the embedding-dim validation. We only need PRAGMA / COUNT(*) queries for
 * the snapshot helpers — pulling in the whole openDb() path forces dim
 * validation against the live config, which throws on the staged copy.
 */
const openRaw = (dbPath: string): Database.Database => new Database(dbPath, { readonly: false });

const readSchemaVersion = (dbPath: string): number => {
  const db = openRaw(dbPath);
  try {
    return db.pragma("user_version", { simple: true }) as number;
  } finally {
    db.close();
  }
};

const collectCounts = (dbPath: string): Record<string, number> => {
  const db = openRaw(dbPath);
  try {
    const out: Record<string, number> = {};
    for (const table of TABLES_FOR_COUNTS) {
      try {
        const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as
          | { c: number }
          | undefined;
        out[table] = row?.c ?? 0;
      } catch {
        out[table] = 0;
      }
    }
    return out;
  } finally {
    db.close();
  }
};

/**
 * Use SQLite's online backup API to get a point-in-time consistent copy of
 * the DB. Safe to run while other processes may be writing. This is the
 * correct way to snapshot SQLite — never a raw file copy.
 */
const backupDatabase = async (sourceDbPath: string, destPath: string): Promise<void> => {
  const db = openRaw(sourceDbPath);
  try {
    // Fold WAL into the main DB first so the destination is a single
    // self-contained file (no need for .wal/.shm siblings on restore).
    db.pragma("wal_checkpoint(TRUNCATE)");
    await db.backup(destPath);
  } finally {
    db.close();
  }
};

export const exportSnapshot = async (
  config: LifecoachConfig,
  opts: ExportOptions = {},
): Promise<{ path: string; size: number; manifest: SnapshotManifest }> => {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace(/T/, "_")
    .slice(0, 19);
  const defaultOut = path.join(config.snapshotsDir, `lifecoach-${timestamp}.tar.gz`);
  const out = opts.out ?? defaultOut;
  await fs.mkdir(path.dirname(out), { recursive: true });

  // Stage everything into a temp directory we can verify, hash, then tar.
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "lifecoach-export-"));
  try {
    // 1. SQLite backup
    opts.onProgress?.({ phase: "checkpoint" });
    const stagedDb = path.join(staging, "lifecoach.db");
    opts.onProgress?.({ phase: "backup-db" });
    await backupDatabase(config.dbPath, stagedDb);

    // 2. Raw files (unless --no-raw)
    const stagedRaw = path.join(staging, "raw");
    await fs.mkdir(stagedRaw, { recursive: true });
    const rawFiles = opts.noRaw ? [] : await collectRawFiles(config.rawDir);
    opts.onProgress?.({ phase: "stage-raw", count: rawFiles.length });
    for (const src of rawFiles) {
      const rel = path.relative(config.rawDir, src);
      const dest = path.join(stagedRaw, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
    }

    // 3. Manifest
    opts.onProgress?.({ phase: "manifest" });
    const fileEntries: SnapshotManifest["files"] = [];
    fileEntries.push({
      path: "lifecoach.db",
      size: (await fs.stat(stagedDb)).size,
      sha256: await sha256OfFile(stagedDb),
    });
    for (const src of rawFiles) {
      const rel = "raw/" + path.relative(config.rawDir, src);
      const stagedPath = path.join(staging, rel);
      fileEntries.push({
        path: rel,
        size: (await fs.stat(stagedPath)).size,
        sha256: await sha256OfFile(stagedPath),
      });
    }
    const manifest: SnapshotManifest = {
      version: 1,
      createdAt: Date.now(),
      schemaVersion: readSchemaVersion(stagedDb),
      sourceHost: os.hostname(),
      counts: collectCounts(stagedDb),
      files: fileEntries,
    };
    await fs.writeFile(path.join(staging, "manifest.json"), JSON.stringify(manifest, null, 2));

    // 4. Tar + gzip
    opts.onProgress?.({ phase: "compress", targetPath: out });
    const entries = ["manifest.json", "lifecoach.db", ...(rawFiles.length > 0 ? ["raw"] : [])];
    await pipeline(
      tar.c({ cwd: staging, portable: true, gzip: false }, entries) as unknown as NodeJS.ReadableStream,
      createGzip({ level: 9 }),
      createWriteStream(out),
    );

    const finalSize = (await fs.stat(out)).size;
    opts.onProgress?.({ phase: "done", targetPath: out, size: finalSize });
    return { path: out, size: finalSize, manifest };
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
};

export const importSnapshot = async (
  config: LifecoachConfig,
  archivePath: string,
  opts: ImportOptions = {},
): Promise<SnapshotManifest> => {
  const stat = await fs.stat(archivePath).catch(() => null);
  if (!stat || !stat.isFile()) {
    throw new LifecoachError(`Archive not found: ${archivePath}`, "IMPORT_NOT_FOUND");
  }

  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "lifecoach-import-"));
  try {
    // 1. Extract
    opts.onProgress?.({ phase: "extract" });
    await pipeline(
      createReadStream(archivePath),
      createGunzip(),
      tar.x({ cwd: staging }) as unknown as NodeJS.WritableStream,
    );

    // 2. Verify manifest + hashes
    opts.onProgress?.({ phase: "verify" });
    const manifestRaw = await fs
      .readFile(path.join(staging, "manifest.json"), "utf8")
      .catch(() => null);
    if (!manifestRaw) {
      throw new LifecoachError("manifest.json missing — not a Lifecoach snapshot", "IMPORT_NO_MANIFEST");
    }
    const manifest = JSON.parse(manifestRaw) as SnapshotManifest;
    if (manifest.version !== 1) {
      throw new LifecoachError(
        `Unsupported snapshot version: ${manifest.version}`,
        "IMPORT_VERSION_MISMATCH",
      );
    }
    for (const entry of manifest.files) {
      const stagedPath = path.join(staging, entry.path);
      const stagedSize = (await fs.stat(stagedPath)).size;
      if (stagedSize !== entry.size) {
        throw new LifecoachError(
          `Size mismatch for ${entry.path}: manifest ${entry.size} vs file ${stagedSize}`,
          "IMPORT_SIZE_MISMATCH",
        );
      }
      const stagedSha = await sha256OfFile(stagedPath);
      if (stagedSha !== entry.sha256) {
        throw new LifecoachError(
          `SHA-256 mismatch for ${entry.path}`,
          "IMPORT_HASH_MISMATCH",
        );
      }
    }

    if (opts.dryRun) {
      return manifest;
    }

    // 3. Apply
    opts.onProgress?.({ phase: "apply" });
    const dbExists = await fs.stat(config.dbPath).catch(() => null);
    if (dbExists && !opts.force) {
      throw new LifecoachError(
        `Refusing to overwrite existing DB at ${config.dbPath}. Pass --force to replace.`,
        "IMPORT_WOULD_OVERWRITE",
      );
    }

    // Copy DB
    await fs.mkdir(path.dirname(config.dbPath), { recursive: true });
    // Clear any WAL/SHM siblings first so we don't end up with stale companions
    // pointing at the previous DB.
    await fs.rm(`${config.dbPath}-wal`, { force: true });
    await fs.rm(`${config.dbPath}-shm`, { force: true });
    await fs.copyFile(path.join(staging, "lifecoach.db"), config.dbPath);

    // Copy raw files
    const rawSrc = path.join(staging, "raw");
    const rawSrcExists = await fs.stat(rawSrc).catch(() => null);
    if (rawSrcExists?.isDirectory()) {
      await fs.mkdir(config.rawDir, { recursive: true });
      await fs.cp(rawSrc, config.rawDir, { recursive: true });
    }

    opts.onProgress?.({ phase: "done", manifest });
    return manifest;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
};
