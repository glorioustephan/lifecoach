import crypto from "node:crypto";
import type { Storage } from "../../storage/index.js";
import type { ParsedMonarchCsvRow } from "../../ingest/parsers/monarch-csv.js";

/**
 * One-time historical backfill from a Monarch Money CSV export. Seeds:
 *  - `transactions` rows for periods OLDER than the live-sync 90-day window
 *    (so we don't double-count the same period coming from the live sync).
 *  - `measurements` rows for historical monthly trends (monthly_burn,
 *    savings_rate) so the Insighter / reflector can immediately see depth.
 *
 * Idempotency is by deterministic synthetic external IDs:
 *  - transaction.externalId = "csv:" + sha256(dateRaw|merchant|amount|account)
 *  - account.externalId      = "csv-account:" + lowercased trimmed name (if a
 *    matching live account isn't found by display name)
 * Re-uploading the same CSV upserts zero new rows.
 */

const LIVE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const CSV_ACCOUNT_PREFIX = "csv-account:";
const CSV_TXN_PREFIX = "csv:";

const synthTxnId = (r: ParsedMonarchCsvRow): string => {
  const key = `${r.dateRaw}|${r.merchant}|${r.amount}|${r.account}`;
  const hash = crypto.createHash("sha256").update(key).digest("hex").slice(0, 24);
  return `${CSV_TXN_PREFIX}${hash}`;
};

const synthAccountExternalId = (name: string): string =>
  `${CSV_ACCOUNT_PREFIX}${name.trim().toLowerCase()}`;

// Map a CSV account name to a local account id. Prefer an existing account
// (case-insensitive displayName match — handles Monarch live-sync names);
// otherwise synthesize a placeholder account so historical rows have a home.
const ensureAccount = (
  storage: Storage,
  name: string,
  cache: Map<string, string>,
  syncTs: number,
): string => {
  const key = name.trim().toLowerCase() || "(unknown)";
  const hit = cache.get(key);
  if (hit) return hit;

  // Look for a live account by case-insensitive display name first.
  const live = storage.financial
    .listAccounts({})
    .find((a) => a.displayName.trim().toLowerCase() === key);
  if (live) {
    cache.set(key, live.id);
    return live.id;
  }

  // Look for an existing csv-only placeholder.
  const externalId = synthAccountExternalId(key);
  const existing = storage.financial.getAccountByExternalId(externalId);
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  // Create a placeholder. Type "other" (CHECK-constraint allowed). Inactive so
  // it doesn't pollute net-worth/Account-Overview until the user reclassifies.
  const created = storage.financial.createAccount({
    externalId,
    displayName: name || "(unknown)",
    type: "other",
    balance: 0,
    currency: "USD",
    status: "inactive",
    syncedAt: syncTs,
  });
  cache.set(key, created.id);
  return created.id;
};

const monthKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const monthEndMs = (key: string): number => {
  // key is always "YYYY-MM" (produced by monthKey above), so the cast is safe.
  const [y, m] = key.split("-").map(Number) as [number, number];
  // Last day of the month, 23:59:59 local.
  return new Date(y, m, 0, 23, 59, 59).getTime();
};

export interface BackfillResult {
  totalRows: number;
  /** Rows older than the live window that were upserted. */
  transactionsUpserted: number;
  /** Rows skipped because they fell inside the live 90d window. */
  inLiveWindowSkipped: number;
  accountsCreated: number;
  /** Historical metric+month combinations newly seeded. */
  measurementsSeeded: number;
  /** Historical metric+month combinations already present (left untouched). */
  measurementsAlreadyPresent: number;
}

export interface BackfillOptions {
  /**
   * Earliest cutoff (Unix ms) at which a CSV row is treated as "live" and
   * skipped to avoid double counting against the daily sync. Defaults to now − 90 days.
   */
  liveCutoffMs?: number;
}

export const backfillFromCsv = (
  storage: Storage,
  rows: ParsedMonarchCsvRow[],
  opts: BackfillOptions = {},
): BackfillResult => {
  const syncTs = Date.now();
  const liveCutoff = opts.liveCutoffMs ?? syncTs - LIVE_WINDOW_MS;
  const accountCache = new Map<string, string>();

  const beforeAccounts = storage.financial.listAccounts({}).length;

  let upserted = 0;
  let inLiveSkipped = 0;
  // Aggregate for historical measurements as we go.
  const monthly = new Map<string, { income: number; expenses: number }>();

  for (const r of rows) {
    if (r.date >= liveCutoff) {
      inLiveSkipped += 1;
      continue; // covered by live sync — don't duplicate
    }
    const accountId = ensureAccount(storage, r.account, accountCache, syncTs);
    storage.financial.upsertTransaction({
      externalId: synthTxnId(r),
      accountId,
      date: r.date,
      amount: r.amount,
      currency: "USD",
      merchant: r.merchant,
      category: r.category ?? undefined,
      description: r.originalStatement ?? undefined,
      isPending: false,
      notes: r.notes ?? undefined,
      isRecurring: false,
      syncedAt: syncTs,
    });
    upserted += 1;
    const mk = monthKey(r.date);
    const agg = monthly.get(mk) ?? { income: 0, expenses: 0 };
    if (r.amount > 0) agg.income += r.amount;
    else if (r.amount < 0) agg.expenses += Math.abs(r.amount);
    monthly.set(mk, agg);
  }

  // Derive historical monthly measurements (idempotent — skip if a row for
  // (metric, month-end) already exists). Net worth history needs balance data
  // a transaction-only CSV doesn't carry, so we only seed flow metrics here.
  let seeded = 0;
  let alreadyPresent = 0;
  for (const [mk, agg] of monthly) {
    const recordedAt = monthEndMs(mk);
    const burn = agg.expenses;
    const savingsRate = agg.income > 0 ? ((agg.income - agg.expenses) / agg.income) * 100 : 0;

    const candidates: Array<{ metric: string; value: number; unit: string }> = [
      { metric: "monthly_burn", value: burn, unit: "USD" },
      { metric: "savings_rate", value: savingsRate, unit: "%" },
    ];
    for (const c of candidates) {
      const existing = storage.measurements.query(c.metric, {
        from: recordedAt - ONE_DAY_MS,
        to: recordedAt + ONE_DAY_MS,
      });
      if (existing.length > 0) {
        alreadyPresent += 1;
        continue;
      }
      storage.measurements.create({
        metric: c.metric,
        value: c.value,
        unit: c.unit,
        recordedAt,
      });
      seeded += 1;
    }
  }

  const afterAccounts = storage.financial.listAccounts({}).length;

  return {
    totalRows: rows.length,
    transactionsUpserted: upserted,
    inLiveWindowSkipped: inLiveSkipped,
    accountsCreated: Math.max(0, afterAccounts - beforeAccounts),
    measurementsSeeded: seeded,
    measurementsAlreadyPresent: alreadyPresent,
  };
};
