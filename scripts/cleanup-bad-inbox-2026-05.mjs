#!/usr/bin/env node
// One-shot cleanup for the 2026-05 inbox regression.
//
// Two classes of bad rows landed before the Insighter/snapshot fixes:
//   1. Active "Bloodwork results …" insights that fabricated a 2026-05-28
//      Function Health draw date (today is 2026-05-27/28) and accumulated
//      4+ near-duplicates because the topic-exact dedupe never fired.
//   2. Today's `monthly_burn` measurement that was computed without filtering
//      Monarch transfers — inflating burn to ~$27k.
//
// This script dismisses (1) and deletes today's snapshot of (2) so the next
// Monarch sync recomputes a corrected number. Idempotent and safe to re-run.
//
// Usage (from repo root — resolves better-sqlite3 through packages/core):
//   node scripts/cleanup-bad-inbox-2026-05.mjs --db ./data/lifecoach.db --dry-run
//   node scripts/cleanup-bad-inbox-2026-05.mjs --db ./data/lifecoach.db

import { argv, exit } from "node:process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

// ESM resolution is anchored to this file's location, but better-sqlite3 lives
// in @lifecoach/core's workspace deps — not at the repo root. Resolve through
// packages/core so the script runs from `node scripts/...` without needing a
// specific `pnpm --filter` invocation.
const here = path.dirname(fileURLToPath(import.meta.url));
const corePkgJson = path.resolve(here, "..", "packages", "core", "package.json");
const require = createRequire(corePkgJson);
const Database = require("better-sqlite3");

const args = new Map();
for (let i = 2; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--dry-run") args.set("dry-run", true);
  else if (a === "--db") args.set("db", argv[++i]);
  else if (a.startsWith("--db=")) args.set("db", a.slice(5));
}

const dbPath = args.get("db") ?? "./data/lifecoach.db";
const dryRun = Boolean(args.get("dry-run"));

const db = new Database(dbPath);

const startOfToday = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
})();
const nowMs = Date.now();

// (1) Active bloodwork insights — either subject contains "bloodwork" OR body
//     mentions the hallucinated May 28 draw date.
const candidates = db
  .prepare(
    `SELECT id, topic, body FROM insights
     WHERE acted_on_at IS NULL
       AND dismissed_at IS NULL
       AND (
         LOWER(topic) LIKE '%bloodwork%'
         OR LOWER(body) LIKE '%2026-05-28%'
         OR LOWER(body) LIKE '%may 28%'
       )`,
  )
  .all();

console.log(`Found ${candidates.length} active inbox row(s) to dismiss:`);
for (const c of candidates) console.log(`  · [${c.id}] ${c.topic}`);

if (!dryRun && candidates.length > 0) {
  const stmt = db.prepare(`UPDATE insights SET dismissed_at = ? WHERE id = ?`);
  const txn = db.transaction((rows) => {
    for (const r of rows) stmt.run(nowMs, r.id);
  });
  txn(candidates);
}

// (2) Today's derived financial snapshots — drop the burn row in particular
//     so the next sync writes a corrected value. We drop the whole derived
//     family so nothing computed before the transfer-filter fix lingers.
const derivedMetrics = [
  "net_worth",
  "total_debt",
  "liquid_savings",
  "portfolio_value",
  "monthly_burn",
  "savings_rate",
];
const todaysMeasurements = db
  .prepare(
    `SELECT id, metric, value FROM measurements
     WHERE metric IN (${derivedMetrics.map(() => "?").join(",")})
       AND recorded_at >= ?`,
  )
  .all(...derivedMetrics, startOfToday);

console.log(`\nFound ${todaysMeasurements.length} stale financial snapshot row(s) to delete:`);
for (const m of todaysMeasurements) console.log(`  · ${m.metric} = ${m.value} [${m.id}]`);

if (!dryRun && todaysMeasurements.length > 0) {
  const stmt = db.prepare(`DELETE FROM measurements WHERE id = ?`);
  const txn = db.transaction((rows) => {
    for (const r of rows) stmt.run(r.id);
  });
  txn(todaysMeasurements);
}

console.log(
  `\n${dryRun ? "[dry-run]" : "[done]"} dismissed ${candidates.length} insights, deleted ${todaysMeasurements.length} measurements.`,
);
db.close();
exit(0);
