#!/usr/bin/env node
/**
 * purge-stale-financial-measurements.mjs
 *
 * One-shot script to drop stale `monthly_burn` and `savings_rate` rows from
 * the `measurements` table that were computed BEFORE the transfer-exclusion
 * fix landed in snapshot-metrics.ts. Those rows contain inflated values
 * (Ally sweeps + credit-card payments counted as spending) and will continue
 * to trigger bad attention signals in attention.ts:168-210 until purged.
 *
 * DO NOT RUN until integrations-engineer's snapshot-metrics fix is merged,
 * so that the next daily cron repopulates these rows with correct values.
 *
 * Usage (from repo root):
 *   node scripts/purge-stale-financial-measurements.mjs [--db <path>] [--dry-run]
 *
 * Defaults:
 *   --db   <repo-root>/data/lifecoach.db
 *   No --dry-run: actually deletes rows.
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// better-sqlite3 lives in packages/core's node_modules; resolve via createRequire
// so this script can be launched from any cwd without a root-level dependency.
const require = createRequire(
  pathToFileURL(path.join(__dirname, "..", "packages", "core", "package.json")),
);
const Database = require("better-sqlite3");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const dbIndex = args.indexOf("--db");
const dbPath =
  dbIndex !== -1 && args[dbIndex + 1]
    ? args[dbIndex + 1]
    : path.join(__dirname, "..", "data", "lifecoach.db");

const STALE_METRICS = ["monthly_burn", "savings_rate"];
// Purge all rows recorded before today so the next sync can repopulate
// them with correct transfer-excluded values.
const cutoffMs = Date.now();

console.log(`DB: ${dbPath}`);
console.log(`Dry-run: ${dryRun}`);
console.log(`Purging metrics: ${STALE_METRICS.join(", ")} (recorded_at < now)`);

const db = new Database(dbPath, { readonly: dryRun });

for (const metric of STALE_METRICS) {
  const rows = db
    .prepare(
      `SELECT id, value, unit, recorded_at FROM measurements
       WHERE metric = ? AND recorded_at < ?
       ORDER BY recorded_at DESC`,
    )
    .all(metric, cutoffMs);

  if (rows.length === 0) {
    console.log(`  ${metric}: no rows to purge`);
    continue;
  }

  console.log(`  ${metric}: ${rows.length} row(s) to purge`);
  for (const r of rows) {
    const d = new Date(r.recorded_at).toISOString().slice(0, 10);
    console.log(`    id=${r.id}  value=${r.value}${r.unit ? " " + r.unit : ""}  date=${d}`);
  }

  if (!dryRun) {
    const result = db
      .prepare(`DELETE FROM measurements WHERE metric = ? AND recorded_at < ?`)
      .run(metric, cutoffMs);
    console.log(`  ${metric}: deleted ${result.changes} row(s)`);
  }
}

db.close();
console.log(dryRun ? "\nDry-run complete — no rows deleted." : "\nPurge complete.");
