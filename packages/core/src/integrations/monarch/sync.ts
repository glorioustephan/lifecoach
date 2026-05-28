import type { MonarchClient } from "./client.js";
import type { Storage } from "../../storage/index.js";
import type { SemanticMemory } from "../../memory/semantic.js";
import { now } from "../../util/ids.js";
import { LifecoachError } from "../../util/errors.js";
import { snapshotFinancialMetrics } from "./snapshot-metrics.js";
import { refreshFinancialGoals } from "./refresh-financial-goals.js";
import { indexFinanceNarratives } from "../../memory/finance-narratives.js";

export interface MonarchSyncResult {
  accountsFetched: number;
  accountsUpserted: number;
  transactionsFetched: number;
  transactionsUpserted: number;
  /** Transactions whose real account couldn't be mapped (sentinel fallback). */
  transactionsUnlinked: number;
  holdingsSnapshotted: number;
  startedAt: number;
  completedAt: number;
  success: boolean;
}

/** Page size for transaction pagination. Monarch's default is small (~25-30); */
/** we page until a short result so a 90-day sweep returns everything.        */
const TRANSACTIONS_PAGE_SIZE = 200;

/**
 * syncMonarch: Three-phase idempotent sync from Monarch to Life Coach storage.
 * All operations are safe to retry; upserts by external ID prevent duplicates.
 */
export interface SyncMonarchOptions {
  /**
   * When provided, the sync re-indexes the last 3 months of financial
   * NARRATIVES (monthly rollups) via Voyage at the end. Failures are non-fatal.
   */
  semantic?: SemanticMemory;
}

export async function syncMonarch(
  client: MonarchClient,
  storage: Storage,
  opts: SyncMonarchOptions = {},
): Promise<MonarchSyncResult> {
  const result: MonarchSyncResult = {
    accountsFetched: 0,
    accountsUpserted: 0,
    transactionsFetched: 0,
    transactionsUpserted: 0,
    transactionsUnlinked: 0,
    holdingsSnapshotted: 0,
    startedAt: now(),
    completedAt: 0,
    success: false,
  };

  try {
    // Phase 1: Sync accounts
    console.log("[Monarch Sync] Phase 1: Syncing accounts...");
    const monarchAccounts = await client.listAccounts();
    result.accountsFetched = monarchAccounts.length;

    const syncTs = now();
    for (const monarchAcc of monarchAccounts) {
      // Map Monarch's account type to one of the local CHECK-constrained values:
      // checking | savings | credit_card | investment | debt | other.
      // Monarch returns lowercase type/subtype names, so compare case-insensitively
      // and always fall back to an allowed value (never the invalid "asset").
      const t = (monarchAcc.type?.name ?? "").toLowerCase();
      const st = (monarchAcc.subtype?.name ?? "").toLowerCase();
      let accountType: "checking" | "savings" | "credit_card" | "investment" | "debt" | "other";
      if (!monarchAcc.isAsset) {
        accountType = t.includes("credit") || st.includes("credit") ? "credit_card" : "debt";
      } else if (t.includes("credit") || st.includes("credit")) {
        accountType = "credit_card";
      } else if (t.includes("invest") || t.includes("brokerage")) {
        accountType = "investment";
      } else if (st.includes("savings")) {
        accountType = "savings";
      } else if (st.includes("checking")) {
        accountType = "checking";
      } else {
        accountType = "other";
      }

      const existing = storage.financial.getAccountByExternalId(monarchAcc.id);

      if (existing) {
        storage.financial.updateAccount(existing.id, {
          balance: monarchAcc.currentBalance,
          status: "active",
          syncedAt: syncTs,
        });
      } else {
        storage.financial.createAccount({
          externalId: monarchAcc.id,
          displayName: monarchAcc.displayName,
          type: accountType,
          balance: monarchAcc.currentBalance,
          currency: "USD",
          institution: monarchAcc.institution?.name,
          status: "active",
          syncedAt: syncTs,
        });
      }
      result.accountsUpserted += 1;
    }

    // Mark accounts not returned by Monarch as inactive
    const activeAccounts = storage.financial.listAccounts({ status: "active" });
    for (const localAcc of activeAccounts) {
      if (!monarchAccounts.find((ma) => ma.id === localAcc.externalId)) {
        storage.financial.updateAccount(localAcc.id, {
          status: "inactive",
          syncedAt: syncTs,
        });
      }
    }

    // Phase 2: Sync transactions
    console.log("[Monarch Sync] Phase 2: Syncing transactions...");
    const last90Days = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;
    const startDate = new Date(last90Days * 1000).toISOString().split("T")[0];

    // Build a local-account-id lookup by externalId for fast join. The
    // lookup is built once after Phase 1 so newly-created accounts are mapped.
    const externalIdToLocalId = new Map<string, string>();
    for (const acc of storage.financial.listAccounts({})) {
      if (acc.externalId) externalIdToLocalId.set(acc.externalId, acc.id);
    }

    // Paginate until a short page comes back. Monarch's default page is small
    // (~25-30); without an explicit limit we were getting only the first page.
    let offset = 0;
    let pagedThisCycle = 0;
    while (true) {
      const page = await client.listTransactions({
        offset,
        limit: TRANSACTIONS_PAGE_SIZE,
        filters: { startDate },
      });
      for (const monarchTxn of page) {
        const txnDate = new Date(monarchTxn.date).getTime();
        const mapped = monarchTxn.accountId
          ? externalIdToLocalId.get(monarchTxn.accountId)
          : undefined;
        const localAccountId = mapped ?? "unknown";
        if (!mapped) result.transactionsUnlinked += 1;

        storage.financial.upsertTransaction({
          externalId: monarchTxn.id,
          accountId: localAccountId,
          date: txnDate,
          amount: monarchTxn.amount,
          currency: "USD",
          merchant: monarchTxn.merchant,
          category: monarchTxn.category?.name,
          isPending: monarchTxn.isPending,
          isRecurring: monarchTxn.isRecurring,
          recurringFrequency: monarchTxn.recurringFrequency ?? undefined,
          categoryGroupType: monarchTxn.categoryGroupType ?? undefined,
          syncedAt: syncTs,
        });
        result.transactionsUpserted += 1;
        pagedThisCycle += 1;
      }
      if (page.length < TRANSACTIONS_PAGE_SIZE) break;
      offset += TRANSACTIONS_PAGE_SIZE;
    }
    result.transactionsFetched = pagedThisCycle;

    // Phase 3: Snapshot all holdings from Monarch portfolio
    console.log("[Monarch Sync] Phase 3: Snapshotting holdings...");
    const holdings = await client.getHoldings();
    const snapshotDate = Date.now();
    // Use the first investment account as the holder, or a fallback sentinel
    const investmentAccounts = storage.financial.listAccounts({ type: "investment" });
    const holdingAccountId = investmentAccounts[0]?.id ?? "unknown";

    for (const holding of holdings) {
      storage.financial.createHolding({
        accountId: holdingAccountId,
        symbol: holding.symbol,
        quantity: holding.quantity,
        currentPrice: holding.currentPrice,
        marketValue: holding.marketValue,
        costBasis: holding.costBasis,
        assetType: "stock",
        snapshotDate,
        syncedAt: syncTs,
      });
      result.holdingsSnapshotted += 1;
    }

    // Phase 4: Snapshot derived metrics for trend tracking (net worth, debt,
    // savings rate, monthly burn, portfolio value). Idempotent per day; once-
    // a-day cron means each metric writes one row. Failure here is non-fatal.
    try {
      const snap = snapshotFinancialMetrics(storage);
      console.log("[Monarch Sync] Phase 4: Snapshotted metrics", snap.recorded);
    } catch (err) {
      console.warn(
        "[Monarch Sync] Phase 4: metric snapshot failed (non-fatal):",
        err instanceof Error ? err.message : String(err),
      );
    }

    // Phase 4b: Refresh financial-targeting Goals (savings buckets, debt
    // paydown, etc.) so their currentProgress tracks the latest measurement
    // — no separate Goals UI required. Non-fatal.
    try {
      const refreshed = refreshFinancialGoals(storage);
      if (refreshed.goalsUpdated > 0) {
        console.log("[Monarch Sync] Phase 4b: Refreshed financial goals", refreshed.goalIds);
      }
    } catch (err) {
      console.warn(
        "[Monarch Sync] Phase 4b: financial-goal refresh failed (non-fatal):",
        err instanceof Error ? err.message : String(err),
      );
    }

    // Phase 5: Re-index the last 3 months of financial NARRATIVES so the
    // coach can semantically recall financial history (Voyage). Idempotent —
    // each month-key replaces its previous embedding. Non-fatal.
    if (opts.semantic) {
      try {
        const out = await indexFinanceNarratives(opts.semantic, storage);
        console.log("[Monarch Sync] Phase 5: Indexed finance narratives", out.refIds);
      } catch (err) {
        console.warn(
          "[Monarch Sync] Phase 5: narrative indexing failed (non-fatal):",
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    result.success = true;
    result.completedAt = now();

    console.log("[Monarch Sync] Complete:", {
      accountsUpserted: result.accountsUpserted,
      transactionsUpserted: result.transactionsUpserted,
      transactionsUnlinked: result.transactionsUnlinked,
      holdingsSnapshotted: result.holdingsSnapshotted,
    });

    return result;
  } catch (error) {
    result.completedAt = now();
    result.success = false;
    throw new LifecoachError(
      `Monarch sync failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
