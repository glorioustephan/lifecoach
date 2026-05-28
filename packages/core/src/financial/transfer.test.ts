import { describe, expect, it } from "vitest";
import { isTransferTxn, TRANSFER_CATEGORY_NAME_PATTERNS } from "./transfer.js";

// ─── isTransferTxn — unit tests ─────────────────────────────────────────────

describe("isTransferTxn", () => {
  const noInternalAccounts = new Set<string>();

  it("excludes rows with categoryGroupType === 'transfer'", () => {
    expect(
      isTransferTxn({ categoryGroupType: "transfer" }, noInternalAccounts),
    ).toBe(true);
  });

  it("excludes rows with categoryGroupType === 'Transfer' (case-insensitive)", () => {
    expect(
      isTransferTxn({ categoryGroupType: "Transfer" }, noInternalAccounts),
    ).toBe(true);
  });

  it("does NOT exclude rows with categoryGroupType === 'income'", () => {
    expect(
      isTransferTxn({ categoryGroupType: "income" }, noInternalAccounts),
    ).toBe(false);
  });

  it("does NOT exclude rows with categoryGroupType === 'expense'", () => {
    expect(
      isTransferTxn({ categoryGroupType: "expense" }, noInternalAccounts),
    ).toBe(false);
  });

  // Defect fix: null categoryGroupType must fall back to category name matching.
  it("excludes null-categoryGroupType row with category 'Internal Transfer'", () => {
    expect(
      isTransferTxn(
        { categoryGroupType: null, category: "Internal Transfer" },
        noInternalAccounts,
      ),
    ).toBe(true);
  });

  it("excludes null-categoryGroupType row with category 'Account Transfer'", () => {
    expect(
      isTransferTxn(
        { categoryGroupType: null, category: "Account Transfer" },
        noInternalAccounts,
      ),
    ).toBe(true);
  });

  it("excludes null-categoryGroupType row with category 'Transfers'", () => {
    expect(
      isTransferTxn(
        { categoryGroupType: null, category: "Transfers" },
        noInternalAccounts,
      ),
    ).toBe(true);
  });

  it("excludes null-categoryGroupType row with category 'Credit Card Payment'", () => {
    expect(
      isTransferTxn(
        { categoryGroupType: null, category: "Credit Card Payment" },
        noInternalAccounts,
      ),
    ).toBe(true);
  });

  // SoFi loan payment — must be excluded from expenses (debt-principal, not consumption).
  it("excludes null-categoryGroupType SoFi 'Loan Payment' row from expenses", () => {
    expect(
      isTransferTxn(
        { categoryGroupType: null, category: "Loan Payment" },
        noInternalAccounts,
      ),
    ).toBe(true);
  });

  it("excludes null-categoryGroupType row with category containing 'loan payment' (lowercase)", () => {
    expect(
      isTransferTxn(
        { categoryGroupType: null, category: "loan payment" },
        noInternalAccounts,
      ),
    ).toBe(true);
  });

  it("does NOT exclude a null-categoryGroupType grocery purchase", () => {
    expect(
      isTransferTxn(
        { categoryGroupType: null, category: "Groceries" },
        noInternalAccounts,
      ),
    ).toBe(false);
  });

  it("does NOT exclude a row with no category and no categoryGroupType", () => {
    expect(
      isTransferTxn({ categoryGroupType: null, category: null }, noInternalAccounts),
    ).toBe(false);
  });

  // Account-pair cross-reference (tier 3).
  it("excludes a transaction whose accountId is in the internal-accounts set", () => {
    const internal = new Set(["acc-ally-savings"]);
    expect(
      isTransferTxn(
        { categoryGroupType: null, category: "Paycheck", accountId: "acc-ally-savings" },
        internal,
      ),
    ).toBe(true);
  });

  it("does NOT exclude when accountId is not in internal-accounts set", () => {
    const internal = new Set(["acc-ally-savings"]);
    expect(
      isTransferTxn(
        { categoryGroupType: null, category: "Paycheck", accountId: "acc-employer" },
        internal,
      ),
    ).toBe(false);
  });

  // internalAccountIds defaults to empty set — callers without account context work correctly.
  it("works with no internalAccountIds argument (defaults to empty set)", () => {
    expect(isTransferTxn({ categoryGroupType: "transfer" })).toBe(true);
    expect(isTransferTxn({ categoryGroupType: "income" })).toBe(false);
    expect(isTransferTxn({ categoryGroupType: null, category: "Loan Payment" })).toBe(true);
    expect(isTransferTxn({ categoryGroupType: null, category: "Groceries" })).toBe(false);
  });

  // ── Tier 0: Monarch isTransfer boolean (priority-1 signal) ────────────────

  it("returns true immediately when isTransfer === true, regardless of category", () => {
    // isTransfer should short-circuit before any category check
    expect(
      isTransferTxn(
        { isTransfer: true, categoryGroupType: "expense", category: "Groceries" },
        noInternalAccounts,
      ),
    ).toBe(true);
  });

  it("returns true immediately when isTransfer === true and no other fields are set", () => {
    expect(isTransferTxn({ isTransfer: true })).toBe(true);
  });

  it("does NOT short-circuit when isTransfer === false; falls through to category tiers", () => {
    // isTransfer: false explicitly — not a transfer, category-group confirms income
    expect(
      isTransferTxn(
        { isTransfer: false, categoryGroupType: "income", category: "Paycheck" },
        noInternalAccounts,
      ),
    ).toBe(false);
  });

  it("does NOT short-circuit when isTransfer === false but category-group says transfer", () => {
    // Defensive: Monarch says not a transfer but category-group disagrees.
    // We only promote isTransfer=true to tier-0; false does not override the
    // existing cascade. This case should still return true via tier 1.
    expect(
      isTransferTxn(
        { isTransfer: false, categoryGroupType: "transfer" },
        noInternalAccounts,
      ),
    ).toBe(true);
  });

  it("falls through to category-tier cascade when isTransfer is null", () => {
    // null = pre-migration row, must not be treated as true or as skipping cascade
    expect(
      isTransferTxn(
        { isTransfer: null, categoryGroupType: null, category: "Loan Payment" },
        noInternalAccounts,
      ),
    ).toBe(true);
  });

  it("falls through to category-tier cascade when isTransfer is undefined", () => {
    expect(
      isTransferTxn(
        { isTransfer: undefined, categoryGroupType: "transfer" },
        noInternalAccounts,
      ),
    ).toBe(true);
  });

  it("returns false for a normal expense when isTransfer is null and no other signals match", () => {
    expect(
      isTransferTxn(
        { isTransfer: null, categoryGroupType: null, category: "Restaurants" },
        noInternalAccounts,
      ),
    ).toBe(false);
  });

  it("TRANSFER_CATEGORY_NAME_PATTERNS contains all expected keys", () => {
    const patterns = TRANSFER_CATEGORY_NAME_PATTERNS as readonly string[];
    expect(patterns).toContain("internal transfer");
    expect(patterns).toContain("account transfer");
    expect(patterns).toContain("transfers");
    expect(patterns).toContain("transfer");
    expect(patterns).toContain("credit card payment");
    expect(patterns).toContain("loan payment");
    expect(patterns).toContain("balance adjustment");
  });
});
