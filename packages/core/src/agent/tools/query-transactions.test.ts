/**
 * Tests for `query_transactions` epoch-input normalisation.
 *
 * Covers the defect where an LLM caller passes Unix seconds instead of
 * Unix milliseconds, causing the SQL date filter to match nothing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFinancialTools } from "./financial.js";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";
import type { Storage } from "../../storage/index.js";
import type { NewTransaction } from "@lifecoach/schemas";

// Cast to bypass SDK intersection typing on tool handlers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHandler = (args: Record<string, unknown>, extra: unknown) => Promise<any>;

/** A fixed timestamp for "2024-03-01 00:00:00 UTC" in milliseconds. */
const MAR_1_2024_MS = 1709251200000;
/** Same instant expressed in seconds. */
const MAR_1_2024_S = 1709251200;

/** "2024-03-31 23:59:59 UTC" in milliseconds. */
const MAR_31_2024_MS = 1711929599999;
/** Same instant expressed in seconds. */
const MAR_31_2024_S = 1711929599;

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

/** Create a checking account and return its DB-assigned id. */
function seedAccount(storage: Storage): string {
  const acct = storage.financial.createAccount({
    externalId: "ext-acct-checking",
    displayName: "Test Checking",
    type: "checking",
    balance: 10000,
    currency: "USD",
    status: "active",
    syncedAt: Date.now(),
  });
  return acct.id;
}

/** Seed one transaction on 2024-03-15 (mid-March). */
function seedMarchTransaction(storage: Storage) {
  const accountId = seedAccount(storage);
  const MAR_15_2024_MS = 1710460800000; // 2024-03-15 00:00:00 UTC
  const tx: NewTransaction = {
    externalId: "ext-march-001",
    accountId,
    date: MAR_15_2024_MS,
    amount: 5000,
    currency: "USD",
    merchant: "Employer Direct Deposit",
    category: "Income",
    isPending: false,
    isRecurring: true,
    syncedAt: Date.now(),
  };
  return storage.financial.createTransaction(tx);
}

describe("query_transactions — epoch-input normalisation", () => {
  it("returns March transaction when from/to are Unix milliseconds", async () => {
    handle = createTestStorage();
    const { storage } = handle;
    seedMarchTransaction(storage);

    const tools = buildFinancialTools(storage);
    const queryTx = tools.find((t) => t.name === "query_transactions");
    expect(queryTx).toBeDefined();

    const result = await (queryTx!.handler as unknown as AnyHandler)(
      { from: MAR_1_2024_MS, to: MAR_31_2024_MS, limit: 50 },
      {},
    );
    const payload = JSON.parse(result.content[0].text);
    expect(payload.count).toBe(1);
    expect(payload.transactions[0].merchant).toBe("Employer Direct Deposit");
  });

  it("returns same rows when from/to are Unix seconds (auto-converted)", async () => {
    handle = createTestStorage();
    const { storage } = handle;
    seedMarchTransaction(storage);

    const tools = buildFinancialTools(storage);
    const queryTx = tools.find((t) => t.name === "query_transactions");
    expect(queryTx).toBeDefined();

    const result = await (queryTx!.handler as unknown as AnyHandler)(
      { from: MAR_1_2024_S, to: MAR_31_2024_S, limit: 50 },
      {},
    );
    const payload = JSON.parse(result.content[0].text);
    expect(payload.count).toBe(1);
    expect(payload.transactions[0].merchant).toBe("Employer Direct Deposit");
  });

  it("seconds and milliseconds inputs return identical results", async () => {
    handle = createTestStorage();
    const { storage } = handle;
    seedMarchTransaction(storage);

    const tools = buildFinancialTools(storage);
    const queryTx = tools.find((t) => t.name === "query_transactions")!;
    const handler = queryTx.handler as unknown as AnyHandler;

    const msResult = await handler({ from: MAR_1_2024_MS, to: MAR_31_2024_MS, limit: 50 }, {});
    const sResult = await handler({ from: MAR_1_2024_S, to: MAR_31_2024_S, limit: 50 }, {});

    expect(JSON.parse(msResult.content[0].text).count).toBe(
      JSON.parse(sResult.content[0].text).count,
    );
  });

  it("treats from=0 as no lower bound (does not promote 0 to a huge ms value)", async () => {
    handle = createTestStorage();
    const { storage } = handle;
    seedMarchTransaction(storage);

    const tools = buildFinancialTools(storage);
    const queryTx = tools.find((t) => t.name === "query_transactions")!;
    const handler = queryTx.handler as unknown as AnyHandler;

    // from=0 means "no lower bound" — the March transaction should still appear.
    const result = await handler({ from: 0, to: MAR_31_2024_MS, limit: 50 }, {});
    const payload = JSON.parse(result.content[0].text);
    expect(payload.count).toBe(1);
  });

  it("treats from=undefined as no lower bound", async () => {
    handle = createTestStorage();
    const { storage } = handle;
    seedMarchTransaction(storage);

    const tools = buildFinancialTools(storage);
    const queryTx = tools.find((t) => t.name === "query_transactions")!;
    const handler = queryTx.handler as unknown as AnyHandler;

    const result = await handler({ to: MAR_31_2024_MS, limit: 50 }, {});
    const payload = JSON.parse(result.content[0].text);
    expect(payload.count).toBe(1);
  });

  it("treats from=1e12 exactly as milliseconds (boundary value)", async () => {
    handle = createTestStorage();
    const { storage } = handle;

    // Seed a transaction right at the 1e12 ms boundary (2001-09-09).
    const AT_1E12_MS = 1_000_000_000_000;
    const accountId = seedAccount(storage);
    const tx: NewTransaction = {
      externalId: "ext-boundary-001",
      accountId,
      date: AT_1E12_MS,
      amount: 100,
      currency: "USD",
      merchant: "Boundary Merchant",
      isPending: false,
      isRecurring: false,
      syncedAt: Date.now(),
    };
    storage.financial.createTransaction(tx);

    const tools = buildFinancialTools(storage);
    const queryTx = tools.find((t) => t.name === "query_transactions")!;
    const handler = queryTx.handler as unknown as AnyHandler;

    // from=1e12 must be treated as ms, not multiplied by 1000.
    const result = await handler({ from: 1e12, to: AT_1E12_MS + 1, limit: 50 }, {});
    const payload = JSON.parse(result.content[0].text);
    expect(payload.count).toBe(1);
  });

  it("emits a structured warning log when seconds auto-conversion fires", async () => {
    handle = createTestStorage();
    const { storage } = handle;
    seedMarchTransaction(storage);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const tools = buildFinancialTools(storage);
    const queryTx = tools.find((t) => t.name === "query_transactions")!;
    await (queryTx.handler as unknown as AnyHandler)(
      { from: MAR_1_2024_S, to: MAR_31_2024_S, limit: 50 },
      {},
    );

    expect(warnSpy).toHaveBeenCalled();
    // The log must be a JSON string containing "from" (the field that triggered it).
    const warnArg: string = warnSpy.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(warnArg);
    expect(parsed.field).toBe("from");
    expect(parsed.tool).toBe("query_transactions");

    warnSpy.mockRestore();
  });
});
