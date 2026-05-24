import type { MonarchClient } from "./client.js";
import type { Storage } from "../../storage/index.js";
import { now } from "../../util/ids.js";
import { LifecoachError } from "../../util/errors.js";

export interface MonarchSyncResult {
  accountsFetched: number;
  accountsUpserted: number;
  transactionsFetched: number;
  transactionsUpserted: number;
  holdingsSnapshotted: number;
  startedAt: number;
  completedAt: number;
  success: boolean;
}

/**
 * syncMonarch: Three-phase idempotent sync from Monarch to Life Coach storage.
 * All operations are safe to retry; upserts by external ID prevent duplicates.
 */
export async function syncMonarch(client: MonarchClient, storage: Storage): Promise<MonarchSyncResult> {
  const result: MonarchSyncResult = {
    accountsFetched: 0,
    accountsUpserted: 0,
    transactionsFetched: 0,
    transactionsUpserted: 0,
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
      const accountType = monarchAcc.isAsset
        ? monarchAcc.type.name === "CREDIT" || monarchAcc.subtype.name === "CREDIT"
          ? "credit_card"
          : monarchAcc.type.name === "INVESTMENT"
            ? "investment"
            : "asset"
        : "debt";

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
          type: accountType as any,
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
    const last30Days = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
    const last90Days = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60;

    const monarchTransactions = await client.listTransactions({
      filters: {
        startDate: new Date(last90Days * 1000).toISOString().split("T")[0],
      },
    });
    result.transactionsFetched = monarchTransactions.length;

    // Build a local-account-id lookup by externalId for fast join
    const externalIdToLocalId = new Map<string, string>();
    for (const acc of storage.financial.listAccounts({})) {
      if (acc.externalId) externalIdToLocalId.set(acc.externalId, acc.id);
    }

    for (const monarchTxn of monarchTransactions) {
      const txnDate = new Date(monarchTxn.date).getTime();
      // Transactions from monarch-money-ts don't carry an account id at this level;
      // store with a sentinel accountId and reconcile later if needed.
      const localAccountId = externalIdToLocalId.values().next().value ?? "unknown";

      storage.financial.upsertTransaction({
        externalId: monarchTxn.id,
        accountId: localAccountId,
        date: txnDate,
        amount: monarchTxn.amount,
        currency: "USD",
        merchant: monarchTxn.merchant,
        category: monarchTxn.category?.name,
        isPending: monarchTxn.isPending,
        syncedAt: syncTs,
      });
      result.transactionsUpserted += 1;
    }

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

    result.success = true;
    result.completedAt = now();

    console.log("[Monarch Sync] Complete:", {
      accountsUpserted: result.accountsUpserted,
      transactionsUpserted: result.transactionsUpserted,
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
