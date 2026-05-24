import type { MonarchClient } from "./client.js";
import type { Storage } from "../storage/index.js";
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
      startDate: new Date(last90Days * 1000).toISOString().split("T")[0],
    });
    result.transactionsFetched = monarchTransactions.length;

    for (const monarchTxn of monarchTransactions) {
      const accountForTxn = monarchAccounts.find((ma) => ma.id === monarchTxn.id); // Note: monarch txn structure may differ
      if (!accountForTxn) continue;

      const localAcc = storage.financial.getAccountByExternalId(accountForTxn.id);
      if (!localAcc) continue;

      const txnDate = new Date(monarchTxn.date).getTime();

      storage.financial.upsertTransaction({
        externalId: monarchTxn.id,
        accountId: localAcc.id,
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

    // Phase 3: Snapshot holdings for investment accounts
    console.log("[Monarch Sync] Phase 3: Snapshotting holdings...");
    const investmentAccounts = storage.financial.listAccounts({ type: "investment" });

    for (const invAcc of investmentAccounts) {
      const monarchAcc = monarchAccounts.find((ma) => ma.id === invAcc.externalId);
      if (!monarchAcc) continue;

      const holdings = await client.getHoldings(monarchAcc.id);
      const snapshotDate = new Date().getTime();

      for (const holding of holdings) {
        storage.financial.createHolding({
          accountId: invAcc.id,
          symbol: holding.symbol,
          quantity: holding.quantity,
          currentPrice: holding.currentPrice,
          marketValue: holding.marketValue,
          costBasis: holding.costBasis,
          assetType: "stock", // Default to stock; could be inferred from symbol
          snapshotDate,
          syncedAt: syncTs,
        });
        result.holdingsSnapshotted += 1;
      }
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
