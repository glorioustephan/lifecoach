/**
 * Guard-aware financial context for reflection prompts.
 *
 * Background: the reflector used to inline its own transfer-aware transaction
 * accumulation (correct since Wave 5) but never evaluated the G1–G6 rollup
 * guards. When guards failed — short window (G1), high transfer ratio
 * (G2 — typical Monarch sync error symptom), no contributing transactions
 * (G5) — the prompt would still get raw dollar figures and the LLM, given
 * plausible-looking numbers, would write confident prose around them.
 *
 * This module enforces the same contract the Insighter already does (see the
 * G5 itemization guard in `insight-prompt.ts`): never let unverified figures
 * reach the LLM. Either the data clears the guards and we render it, or we
 * render an explicit "data unreliable" notice and the LLM writes about that
 * instead of fabricating confidence.
 *
 * The returned `FinancialReflectionContext` is a discriminated union so the
 * render layer must handle every case — no fall-through to "show the figures
 * anyway."
 */

import type { Storage } from "../storage/index.js";
import type { ReflectionKind } from "@lifecoach/schemas";
import { buildMonthlyRollup, type MonthlyRollup, type WindowType } from "./rollup.js";
import { computeNetWorth, type NetWorthSummary } from "./portfolio.js";
import { getMonarchSettings } from "../integrations/monarch/credentials.js";

/**
 * If the last successful Monarch sync is older than this, we treat the
 * transaction data as stale even if the rollup guards would technically pass.
 * 48h covers a missed daily cron without being so aggressive that a single
 * overnight maintenance window invalidates a Monday morning reflection.
 */
const SYNC_STALENESS_MS = 48 * 60 * 60 * 1000;

export interface AccountSummary {
  displayName: string;
  type: string;
  balance: number;
}

export interface CategorySpend {
  category: string;
  amount: number;
}

interface FailedGuard {
  guard: string; // "G1" | "G2" | …
  detail: string;
}

/**
 * What the reflector tells the prompt about this period's financial picture.
 *
 *  - `omitted`        — the caller asked us to skip financial entirely (e.g.,
 *                       daily reflection where financial figures aren't
 *                       meaningful).
 *  - `not-configured` — Monarch credentials are absent. Silently skip; this is
 *                       the steady state for users who haven't connected.
 *  - `sync-stale`     — Last successful Monarch sync is too old or errored.
 *                       We still report net worth (account balances are the
 *                       latest known snapshot regardless of sync recency) but
 *                       refuse to summarize transactions.
 *  - `guards-failed`  — Sync is fresh, but the rollup's G1–G6 guards rejected
 *                       the period (short window, high transfer ratio,
 *                       miscategorized data, etc.). Net worth is fine; the
 *                       transaction summary is suppressed.
 *  - `ok`             — All checks passed. Render normally.
 */
export type FinancialReflectionContext =
  | { kind: "omitted" }
  | { kind: "not-configured" }
  | {
      kind: "sync-stale";
      accounts: AccountSummary[];
      netWorth: NetWorthSummary;
      lastSyncAt: number | null;
      lastError: string | null;
      hoursSinceSync: number | null;
    }
  | {
      kind: "guards-failed";
      accounts: AccountSummary[];
      netWorth: NetWorthSummary;
      failures: FailedGuard[];
      windowDays: number;
    }
  | {
      kind: "ok";
      accounts: AccountSummary[];
      netWorth: NetWorthSummary;
      rollup: MonthlyRollup;
      topCategories: CategorySpend[];
    };

/**
 * Choose the rollup's `WindowType` for a given reflection kind / window.
 *
 * The reflector hands us arbitrary `[from, to)` date ranges. We pick the
 * window type that best matches so the guards apply meaningfully — most
 * importantly G1, which only applies to MTD / calendar_month windows.
 *
 *  - monthly + window ends near "now" (within 6h of `nowMs`) → `mtd`
 *  - monthly + window ends earlier → `calendar_month` (a finalized month)
 *  - weekly → `trailing_30` (close enough; G1 auto-passes for trailing
 *             windows, and the prompt prose already says "this week")
 *  - daily  → `trailing_30` (we shouldn't reach this — daily reflections
 *             don't ask for financial data — but pick a safe default if so)
 */
const pickWindowType = (
  kind: ReflectionKind,
  toMs: number,
  nowMs: number,
): WindowType => {
  if (kind === "monthly") {
    return Math.abs(nowMs - toMs) <= 6 * 60 * 60 * 1000 ? "mtd" : "calendar_month";
  }
  return "trailing_30";
};

const hoursBetween = (a: number, b: number): number =>
  Math.round(Math.abs(b - a) / (60 * 60 * 1000));

const accountSummaries = (storage: Storage): AccountSummary[] =>
  storage.financial
    .listAccounts({ status: "active" })
    .sort((a, b) => a.type.localeCompare(b.type))
    .map((a) => ({ displayName: a.displayName, type: a.type, balance: a.balance }));

/**
 * Build the guard-aware financial context for a reflection period. This is
 * pure: side-effect-free, deterministic given `storage` state + `nowMs`.
 */
export const buildFinancialReflectionContext = (
  storage: Storage,
  kind: ReflectionKind,
  fromMs: number,
  toMs: number,
  nowMs: number = Date.now(),
): FinancialReflectionContext => {
  // The reflector decides which kinds get financial context. Daily
  // reflections don't — too short a window for any meaningful figure.
  if (kind === "daily") {
    return { kind: "omitted" };
  }

  const monarch = getMonarchSettings(storage);

  // No credentials → silent skip. Treat "never synced" identically to
  // "not configured" — the user hasn't opted in to financial tracking yet.
  if (!monarch.hasCredentials && monarch.lastSyncAt === null) {
    return { kind: "not-configured" };
  }

  // Once credentials exist, the user is opted in. Sync state determines
  // whether we trust the transaction data.
  const accounts = accountSummaries(storage);
  if (accounts.length === 0) {
    // Credentials present but no accounts loaded yet — first sync hasn't
    // landed. Treat as stale so the prompt explains the situation.
    return {
      kind: "sync-stale",
      accounts: [],
      netWorth: computeNetWorth([]),
      lastSyncAt: monarch.lastSyncAt,
      lastError: monarch.lastError,
      hoursSinceSync: null,
    };
  }
  const netWorth = computeNetWorth(accounts);

  const lastSyncAt = monarch.lastSyncAt;
  const hoursSinceSync = lastSyncAt !== null ? hoursBetween(lastSyncAt, nowMs) : null;
  const syncIsStale =
    monarch.lastError !== null && monarch.lastError.length > 0
      ? true
      : lastSyncAt === null
        ? true
        : nowMs - lastSyncAt > SYNC_STALENESS_MS;

  if (syncIsStale) {
    return {
      kind: "sync-stale",
      accounts,
      netWorth,
      lastSyncAt,
      lastError: monarch.lastError,
      hoursSinceSync,
    };
  }

  // Sync is fresh. Build the rollup so the guards can speak.
  const windowType = pickWindowType(kind, toMs, nowMs);
  const transactions = storage.financial.queryTransactions({ from: fromMs, to: toMs });
  const days = Math.max(1, Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000)));
  const period = `reflection:${kind}:${new Date(fromMs).toISOString().slice(0, 10)}`;
  const rollup = buildMonthlyRollup({
    transactions,
    period,
    windowType,
    fromMs,
    toMs,
  });

  const failures: FailedGuard[] = rollup.guardsPassed
    .filter((g) => !g.passed)
    .map((g) => ({ guard: g.guard, detail: g.detail }));

  if (failures.length > 0) {
    return {
      kind: "guards-failed",
      accounts,
      netWorth,
      failures,
      windowDays: days,
    };
  }

  // All clear. Compute category subtotals for the prompt — these are
  // implicitly guard-validated because they're derived from the same set of
  // transactions that just passed G1–G6.
  const spendByCategory = new Map<string, number>();
  for (const tid of rollup.contributingTxIds) {
    const txn = transactions.find((t) => t.id === tid);
    if (!txn || txn.amount >= 0) continue;
    const cat = txn.category ?? "uncategorized";
    const abs = Math.abs(txn.amount);
    spendByCategory.set(cat, (spendByCategory.get(cat) ?? 0) + abs);
  }
  const topCategories: CategorySpend[] = Array.from(spendByCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, amount]) => ({ category, amount }));

  return { kind: "ok", accounts, netWorth, rollup, topCategories };
};

/**
 * Render the financial context into prompt-ready Markdown. Pure transform —
 * the same `FinancialReflectionContext` always produces the same text.
 *
 * Every branch that suppresses a dollar figure says so explicitly so the LLM
 * narrates the suppression rather than inventing a number. See the matching
 * model-side instruction injected by the reflector.
 */
export const renderFinancialReflectionContext = (
  ctx: FinancialReflectionContext,
): string => {
  if (ctx.kind === "omitted" || ctx.kind === "not-configured") return "";

  const parts: string[] = ["\n## Financial Status"];

  if (ctx.kind === "sync-stale") {
    const ageDescription =
      ctx.hoursSinceSync === null
        ? "no successful sync on record"
        : ctx.hoursSinceSync < 24
          ? `last successful sync ${ctx.hoursSinceSync}h ago, but error state is set`
          : `last successful sync ${Math.round(ctx.hoursSinceSync / 24)}d ago`;
    parts.push(
      `> ⚠️ **Financial transaction data is stale this period** (${ageDescription}). ` +
        `Spending figures are withheld. Narrate this as "we can't summarize spending ` +
        `this period — the Monarch sync hasn't completed cleanly" rather than ` +
        `inventing a dollar figure.`,
    );
    if (ctx.lastError) {
      parts.push(`> Sync error: ${ctx.lastError}`);
    }
    if (ctx.accounts.length > 0) {
      // Net worth is the latest-known account balances; doesn't get worse with
      // sync staleness. Safe to render.
      parts.push(`- Net worth (latest known balances): $${ctx.netWorth.netWorth.toFixed(2)}`);
    }
    return parts.join("\n");
  }

  if (ctx.kind === "guards-failed") {
    parts.push(
      `> ⚠️ **Spending summary withheld this period** — the rollup quality guards ` +
        `rejected the underlying data. Narrate the specific reason(s) below ` +
        `instead of inventing a dollar figure.`,
    );
    for (const f of ctx.failures) {
      parts.push(`>   - **${f.guard}**: ${f.detail}`);
    }
    parts.push(`> Window length: ${ctx.windowDays} days.`);
    parts.push(`- Net worth: $${ctx.netWorth.netWorth.toFixed(2)}`);
    return parts.join("\n");
  }

  // ctx.kind === "ok"
  parts.push(`- Net worth: $${ctx.netWorth.netWorth.toFixed(2)}`);
  parts.push(
    `- Spending this period (transfer-excluded, guard-validated): $${ctx.rollup.expenses.toFixed(2)}`,
  );
  if (!Number.isNaN(ctx.rollup.savingsRate) && ctx.rollup.income > 0) {
    parts.push(
      `- Savings rate this period: ${ctx.rollup.savingsRate.toFixed(1)}% ` +
        `(income $${ctx.rollup.income.toFixed(2)}, burn $${ctx.rollup.expenses.toFixed(2)})`,
    );
  }
  if (ctx.topCategories.length > 0) {
    parts.push(
      "- Top categories: " +
        ctx.topCategories
          .map((c) => `${c.category} ($${c.amount.toFixed(2)})`)
          .join(", "),
    );
  }
  parts.push(`> Guard summary: all 6 rollup guards passed; figures above are safe to cite.`);
  return parts.join("\n");
};

/**
 * Tells the model what to do when the financial block says data is suppressed.
 * Injected into the reflection prompt right before the data block. Mirrors
 * the G5 itemization guard the Insighter prompt already enforces (see
 * `packages/core/src/memory/insight-prompt.ts`).
 */
export const FINANCIAL_REFLECTION_INSTRUCTION = `
## Financial narration contract

The Financial Status block (if any) may report one of three states:

1. **All guards passed** — figures are safe to cite verbatim and reason
   about. Quote the dollar amounts as written.
2. **Spending summary withheld** — the rollup's quality guards rejected the
   period's transaction data. Write about the suppression honestly: "we
   can't reliably summarize spending this period because <guard reason>".
   Never invent a dollar figure.
3. **Stale Monarch sync** — the last successful sync is too old or errored.
   Net worth (latest known balances) is fine to cite. Transactions are not.
   Narrate the staleness as a system-side issue, not a user behavior.

If no Financial Status block appears at all, do not mention finances in
the reflection. Silence is the correct frame.
`;
