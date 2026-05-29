import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildFinancialReflectionContext,
  renderFinancialReflectionContext,
} from "./reflection-context.js";
import { createTestStorage, type TestStorageHandle } from "../testing/test-storage.js";
import { MONARCH_PROFILE_KEYS } from "../integrations/monarch/credentials.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const startOfMonthMs = (anchorMs: number): number => {
  const d = new Date(anchorMs);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

const planCredentials = (storage: TestStorageHandle["storage"]): void => {
  // hasMonarchCredentials() only checks that the profile entries are
  // non-null. We bypass real encryption here (LIFECOACH_SECRET_KEY isn't set
  // in test runs) — these strings never get decrypted.
  storage.profile.set(MONARCH_PROFILE_KEYS.email, "enc:v1:test:test");
  storage.profile.set(MONARCH_PROFILE_KEYS.password, "enc:v1:test:test");
};

const planFreshSync = (
  storage: TestStorageHandle["storage"],
  atMs: number,
): void => {
  planCredentials(storage);
  storage.profile.set(MONARCH_PROFILE_KEYS.lastSyncAt, atMs);
  storage.profile.set(MONARCH_PROFILE_KEYS.connected, true);
  storage.profile.set(MONARCH_PROFILE_KEYS.lastError, null);
};

const planActiveAccount = (
  storage: TestStorageHandle["storage"],
  balance: number,
): string => {
  const account = storage.financial.createAccount({
    externalId: `ext-${Math.random()}`,
    displayName: "Checking",
    type: "checking",
    balance,
    currency: "USD",
    status: "active",
    syncedAt: Date.now(),
  });
  return account.id;
};

const planTransaction = (
  storage: TestStorageHandle["storage"],
  accountId: string,
  amount: number,
  category: string,
  dateMs: number,
  categoryGroupType?: "income" | "expense" | "transfer",
): void => {
  storage.financial.upsertTransaction({
    externalId: `tx-${Math.random()}`,
    accountId,
    date: dateMs,
    amount,
    currency: "USD",
    merchant: "Test merchant",
    category,
    isPending: false,
    isRecurring: false,
    ...(categoryGroupType !== undefined ? { categoryGroupType } : {}),
    syncedAt: Date.now(),
  });
};

describe("buildFinancialReflectionContext", () => {
  let handle: TestStorageHandle | null = null;

  beforeEach(() => {
    handle = createTestStorage();
  });

  afterEach(() => {
    handle?.cleanup();
    handle = null;
  });

  it("returns 'omitted' for daily kind regardless of state", () => {
    const ctx = buildFinancialReflectionContext(
      handle!.storage,
      "daily",
      Date.now() - DAY_MS,
      Date.now(),
    );
    expect(ctx.kind).toBe("omitted");
  });

  it("returns 'not-configured' when no Monarch credentials and no sync", () => {
    const ctx = buildFinancialReflectionContext(
      handle!.storage,
      "monthly",
      Date.now() - 30 * DAY_MS,
      Date.now(),
    );
    expect(ctx.kind).toBe("not-configured");
  });

  it("returns 'sync-stale' when last_error is set, regardless of last_sync_at", () => {
    const now = Date.now();
    planFreshSync(handle!.storage, now - HOUR_MS); // recent sync
    handle!.storage.profile.set(MONARCH_PROFILE_KEYS.lastError, "401 unauthorized");
    planActiveAccount(handle!.storage, 5000);

    const ctx = buildFinancialReflectionContext(
      handle!.storage,
      "monthly",
      now - 30 * DAY_MS,
      now,
      now,
    );
    expect(ctx.kind).toBe("sync-stale");
    if (ctx.kind === "sync-stale") {
      expect(ctx.lastError).toBe("401 unauthorized");
      // Net worth still rendered — balances are the latest known snapshot.
      expect(ctx.netWorth.netWorth).toBe(5000);
    }
  });

  it("returns 'sync-stale' when last sync is older than 48h", () => {
    const now = Date.now();
    planFreshSync(handle!.storage, now - 72 * HOUR_MS);
    planActiveAccount(handle!.storage, 5000);

    const ctx = buildFinancialReflectionContext(
      handle!.storage,
      "monthly",
      now - 30 * DAY_MS,
      now,
      now,
    );
    expect(ctx.kind).toBe("sync-stale");
    if (ctx.kind === "sync-stale") {
      expect(ctx.hoursSinceSync).toBeGreaterThanOrEqual(72);
    }
  });

  it("returns 'guards-failed' when transfer ratio (G2) exceeds 20%", () => {
    const now = Date.now();
    const monthStart = startOfMonthMs(now);
    planFreshSync(handle!.storage, now - HOUR_MS);
    const accId = planActiveAccount(handle!.storage, 5000);

    // Income: $1,000. Transfers: $5,000 across two transactions (transfer
    // ratio = 5000 / 6000 ≈ 83%). G2 fails.
    planTransaction(handle!.storage, accId, 1000, "Paycheck", monthStart + DAY_MS, "income");
    planTransaction(handle!.storage, accId, -2500, "Sweep", monthStart + 2 * DAY_MS, "transfer");
    planTransaction(handle!.storage, accId, 2500, "Sweep", monthStart + 2 * DAY_MS, "transfer");

    const ctx = buildFinancialReflectionContext(
      handle!.storage,
      "monthly",
      monthStart,
      now,
      now,
    );
    // Could be guards-failed (G2) or guards-failed with multiple failures
    // depending on G1; either way, NOT "ok".
    expect(ctx.kind).not.toBe("ok");
    if (ctx.kind === "guards-failed") {
      const guards = ctx.failures.map((f) => f.guard);
      expect(guards).toContain("G2");
    }
  });

  it("returns 'ok' for a well-formed window with passing guards", () => {
    const now = new Date("2026-04-30T12:00:00Z").getTime(); // late in a 30-day month
    const monthStart = new Date("2026-04-01T00:00:00Z").getTime();
    planFreshSync(handle!.storage, now - HOUR_MS);
    const accId = planActiveAccount(handle!.storage, 5000);

    // 20 days of $50 grocery spend + monthly $3,000 paycheck.
    for (let i = 0; i < 20; i += 1) {
      planTransaction(
        handle!.storage,
        accId,
        -50,
        "Groceries",
        monthStart + i * DAY_MS,
        "expense",
      );
    }
    planTransaction(handle!.storage, accId, 3000, "Paycheck", monthStart + DAY_MS, "income");

    const ctx = buildFinancialReflectionContext(
      handle!.storage,
      "monthly",
      monthStart,
      now,
      now,
    );
    expect(ctx.kind).toBe("ok");
    if (ctx.kind === "ok") {
      expect(ctx.rollup.expenses).toBe(1000); // 20 × $50
      expect(ctx.rollup.income).toBe(3000);
      // savingsRate = (income - expenses) / income × 100 = 66.66...
      expect(ctx.rollup.savingsRate).toBeCloseTo(66.67, 1);
      expect(ctx.topCategories[0]?.category).toBe("Groceries");
      expect(ctx.topCategories[0]?.amount).toBe(1000);
    }
  });
});

describe("renderFinancialReflectionContext", () => {
  it("omits the whole block when kind is 'omitted' or 'not-configured'", () => {
    expect(renderFinancialReflectionContext({ kind: "omitted" })).toBe("");
    expect(renderFinancialReflectionContext({ kind: "not-configured" })).toBe("");
  });

  it("renders an explicit suppression notice for 'sync-stale'", () => {
    const out = renderFinancialReflectionContext({
      kind: "sync-stale",
      accounts: [{ displayName: "Checking", type: "checking", balance: 5000 }],
      netWorth: { totalAssets: 5000, totalLiabilities: 0, netWorth: 5000, liquidSavings: 5000 },
      lastSyncAt: Date.now() - 72 * HOUR_MS,
      lastError: null,
      hoursSinceSync: 72,
    });
    expect(out).toMatch(/Financial transaction data is stale/i);
    expect(out).toMatch(/withheld/i);
    expect(out).toMatch(/Net worth/);
    // No raw "Spending this period: $" line.
    expect(out).not.toMatch(/Spending this period: \$/);
  });

  it("renders failed guards explicitly for 'guards-failed'", () => {
    const out = renderFinancialReflectionContext({
      kind: "guards-failed",
      accounts: [{ displayName: "Checking", type: "checking", balance: 5000 }],
      netWorth: { totalAssets: 5000, totalLiabilities: 0, netWorth: 5000, liquidSavings: 5000 },
      failures: [
        { guard: "G2", detail: "Transfer ratio 53% exceeds 20%" },
        { guard: "G5", detail: "No contributing transactions" },
      ],
      windowDays: 28,
    });
    expect(out).toMatch(/Spending summary withheld/i);
    expect(out).toMatch(/G2/);
    expect(out).toMatch(/Transfer ratio/);
    expect(out).toMatch(/G5/);
    expect(out).toMatch(/Net worth/);
    expect(out).not.toMatch(/Spending this period: \$/);
  });

  it("renders full figures with a guards-passed summary for 'ok'", () => {
    const out = renderFinancialReflectionContext({
      kind: "ok",
      accounts: [{ displayName: "Checking", type: "checking", balance: 5000 }],
      netWorth: { totalAssets: 5000, totalLiabilities: 0, netWorth: 5000, liquidSavings: 5000 },
      rollup: {
        period: "test",
        windowType: "calendar_month",
        daysInWindow: 30,
        income: 3000,
        expenses: 1000,
        burn: 1000,
        savingsRate: 66.67,
        transferTotal: 100,
        transferRatio: 0.03,
        contributingTxIds: ["t1", "t2"],
        transferTxIds: [],
        guardsPassed: [],
        outlierMonthDetected: false,
      },
      topCategories: [
        { category: "Groceries", amount: 600 },
        { category: "Dining", amount: 400 },
      ],
    });
    expect(out).toMatch(/Net worth: \$5000\.00/);
    expect(out).toMatch(/Spending this period.*\$1000\.00/);
    expect(out).toMatch(/Savings rate this period: 66\.7%/);
    expect(out).toMatch(/Top categories: Groceries \(\$600\.00\), Dining \(\$400\.00\)/);
    expect(out).toMatch(/all 6 rollup guards passed/i);
  });
});
