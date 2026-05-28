import { afterEach, describe, expect, it } from "vitest";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

// ── helpers ───────────────────────────────────────────────────────────────────

let txCounter = 0;

function seedTransaction(
  storage: ReturnType<typeof createTestStorage>["storage"],
  overrides: Partial<{ amount: number; merchant: string }> = {},
) {
  txCounter += 1;
  const acct = storage.financial.createAccount({
    externalId: `ext-acct-${txCounter}`,
    displayName: "Checking",
    type: "checking",
    balance: 5000,
    currency: "USD",
    status: "active",
    syncedAt: Date.now(),
  });
  return storage.financial.createTransaction({
    externalId: `ext-tx-${txCounter}`,
    accountId: acct.id,
    date: Date.now(),
    amount: overrides.amount ?? 100,
    currency: "USD",
    merchant: overrides.merchant ?? `Merchant ${txCounter}`,
    isPending: false,
    isRecurring: false,
    syncedAt: Date.now(),
  });
}

// ── FinancialRepository.updateTransactionNotes ───────────────────────────────

describe("FinancialRepository.updateTransactionNotes", () => {
  it("returns undefined for a non-existent transaction id", () => {
    handle = createTestStorage();
    const { storage } = handle;
    expect(storage.financial.updateTransactionNotes("no-such-id", "note")).toBeUndefined();
  });

  it("updates the notes field on an existing transaction", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const tx = seedTransaction(storage);
    const updated = storage.financial.updateTransactionNotes(tx.id, "reimbursement pending");
    expect(updated?.notes).toBe("reimbursement pending");
  });

  it("returns the updated transaction with all original fields intact", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const tx = seedTransaction(storage, { amount: 250, merchant: "ACME Corp" });
    const updated = storage.financial.updateTransactionNotes(tx.id, "business expense");

    expect(updated?.id).toBe(tx.id);
    expect(updated?.amount).toBe(250);
    expect(updated?.merchant).toBe("ACME Corp");
    expect(updated?.notes).toBe("business expense");
  });

  it("updates the updatedAt timestamp", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const tx = seedTransaction(storage);
    const updated = storage.financial.updateTransactionNotes(tx.id, "updated note");
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(tx.updatedAt);
  });

  it("overwrites a previously set note", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const tx = seedTransaction(storage);
    storage.financial.updateTransactionNotes(tx.id, "first note");
    const second = storage.financial.updateTransactionNotes(tx.id, "second note");
    expect(second?.notes).toBe("second note");
  });
});
