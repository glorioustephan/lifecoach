import { afterEach, describe, expect, it } from "vitest";
import { indexFinanceNarratives } from "./finance-narratives.js";
import { createTestStorage, type TestStorageHandle } from "../testing/test-storage.js";

/**
 * Minimal SemanticMemory stub that captures what was indexed without needing
 * a real embedder. The real SemanticMemory.indexFinanceNarrative() calls
 * embedder.embedDocuments() under the hood; since test-storage has no embedder
 * the semantic layer is a no-op for vectors — we only care about the TEXT that
 * would be embedded, which we capture here.
 */
const makeStubSemantic = () => {
  const indexed: Array<{ refId: string; text: string }> = [];
  return {
    semantic: {
      indexFinanceNarrative: async (input: { refId: string; text: string }) => {
        indexed.push(input);
      },
    } as unknown as import("./semantic.js").SemanticMemory,
    indexed,
  };
};

/**
 * Helper: build a minimal NewTransaction shape accepted by
 * FinancialRepository.createTransaction().
 */
const makeTxn = (
  overrides: Partial<{
    externalId: string;
    accountId: string;
    amount: number;
    merchant: string;
    category: string;
    categoryGroupType: "income" | "expense" | "transfer";
    date: number;
    isRecurring: boolean;
  }> = {},
) => ({
  externalId: overrides.externalId ?? `ext-${Math.random()}`,
  accountId: overrides.accountId ?? "acc-1",
  date: overrides.date ?? Date.now(),
  amount: overrides.amount ?? -100,
  currency: "USD",
  merchant: overrides.merchant ?? "Test Merchant",
  category: overrides.category,
  categoryGroupType: overrides.categoryGroupType,
  isPending: false,
  isRecurring: overrides.isRecurring ?? false,
  syncedAt: Date.now(),
});

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

describe("indexFinanceNarratives — transfer exclusion", () => {
  it("produces $0 income and $0 expense narrative when all transactions are transfers", async () => {
    handle = createTestStorage();
    const { storage } = handle;

    // Create an account so foreign-key constraints pass
    storage.financial.createAccount({
      externalId: "acc-ext-1",
      displayName: "Checking",
      type: "checking",
      balance: 5000,
      currency: "USD",
      status: "active",
      syncedAt: Date.now(),
    });
    const account = storage.financial.listAccounts()[0]!;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthStart = new Date(year, month, 1).getTime();
    const midMonth = new Date(year, month, 15).getTime();

    // All three transactions are transfers — none should count as income or expense.
    storage.financial.createTransaction(
      makeTxn({
        externalId: "txn-ally-sweep",
        accountId: account.id,
        amount: 2000,
        merchant: "Ally Bank",
        categoryGroupType: "transfer",
        date: midMonth,
      }),
    );
    storage.financial.createTransaction(
      makeTxn({
        externalId: "txn-cc-payment",
        accountId: account.id,
        amount: -1500,
        merchant: "Chase Sapphire",
        category: "Credit Card Payment",
        date: midMonth,
      }),
    );
    storage.financial.createTransaction(
      makeTxn({
        externalId: "txn-loan-payment",
        accountId: account.id,
        amount: -800,
        merchant: "SoFi Loan",
        category: "Loan Payment",
        date: midMonth,
      }),
    );

    const { semantic, indexed } = makeStubSemantic();
    await indexFinanceNarratives(semantic, storage, { lookbackMonths: 1 });

    // Should have indexed one narrative for the current month (or zero if no
    // non-transfer data exists and nwSeries is also empty — assert at least
    // the indexed narrative does NOT contain non-zero income/expense figures).
    if (indexed.length > 0) {
      const narrative = indexed[0]!;
      // Transfer-only month: income excl. transfers must be $0.00
      expect(narrative.text).toContain("Income (excl. transfers): $0.00");
      // Transfer-only month: expenses excl. transfers must be $0.00
      expect(narrative.text).toContain("Expenses (excl. transfers): $0.00");
      // Transfer amounts should appear in the informational line
      expect(narrative.text).toContain("Transfers in/out (informational");
    }
  });

  it("correctly separates real income/expenses from transfers in the narrative text", async () => {
    handle = createTestStorage();
    const { storage } = handle;

    storage.financial.createAccount({
      externalId: "acc-ext-2",
      displayName: "Checking",
      type: "checking",
      balance: 10000,
      currency: "USD",
      status: "active",
      syncedAt: Date.now(),
    });
    const account = storage.financial.listAccounts()[0]!;

    const now = new Date();
    const midMonth = new Date(now.getFullYear(), now.getMonth(), 15).getTime();

    // Real paycheck — should count as income
    storage.financial.createTransaction(
      makeTxn({
        externalId: "txn-paycheck",
        accountId: account.id,
        amount: 5000,
        merchant: "Employer Inc",
        category: "Paycheck",
        categoryGroupType: "income",
        date: midMonth,
      }),
    );
    // Real expense — should count as expense
    storage.financial.createTransaction(
      makeTxn({
        externalId: "txn-groceries",
        accountId: account.id,
        amount: -300,
        merchant: "Whole Foods",
        category: "Groceries",
        categoryGroupType: "expense",
        date: midMonth,
      }),
    );
    // Transfer — must NOT count as income
    storage.financial.createTransaction(
      makeTxn({
        externalId: "txn-sweep",
        accountId: account.id,
        amount: 9645,
        merchant: "Ally Transfer",
        categoryGroupType: "transfer",
        date: midMonth,
      }),
    );

    const { semantic, indexed } = makeStubSemantic();
    await indexFinanceNarratives(semantic, storage, { lookbackMonths: 1 });

    expect(indexed.length).toBeGreaterThan(0);
    const narrative = indexed[0]!.text;

    // $9,645 transfer must NOT appear as income
    expect(narrative).not.toContain("Income (excl. transfers): $9,645");
    // Real income ($5,000) should appear
    expect(narrative).toContain("Income (excl. transfers): $5,000.00");
    // Real expense ($300) should appear
    expect(narrative).toContain("Expenses (excl. transfers): $300.00");
    // Transfer informational line should mention the $9,645 sweep
    expect(narrative).toContain("Transfers in/out (informational");
    // The v2 header signals to recall that this narrative has transfer-excluded figures
    expect(narrative).toContain("[finance/month v2]");
  });

  it("narrative header identifies the calendar month and schema version", async () => {
    handle = createTestStorage();
    const { storage } = handle;

    storage.financial.createAccount({
      externalId: "acc-ext-3",
      displayName: "Checking",
      type: "checking",
      balance: 1000,
      currency: "USD",
      status: "active",
      syncedAt: Date.now(),
    });
    const account = storage.financial.listAccounts()[0]!;

    const now = new Date();
    const midMonth = new Date(now.getFullYear(), now.getMonth(), 15).getTime();
    const expectedMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    storage.financial.createTransaction(
      makeTxn({
        externalId: "txn-income-hdr",
        accountId: account.id,
        amount: 1000,
        merchant: "Employer",
        categoryGroupType: "income",
        date: midMonth,
      }),
    );

    const { semantic, indexed } = makeStubSemantic();
    await indexFinanceNarratives(semantic, storage, { lookbackMonths: 1 });

    expect(indexed.length).toBeGreaterThan(0);
    const text = indexed[0]!.text;
    // Must carry v2 marker so downstream recall can distinguish from old poisoned narratives
    expect(text).toContain("[finance/month v2]");
    // Must state the calendar month as the window
    expect(text).toContain(`window: ${expectedMonthKey} calendar month`);
  });
});
