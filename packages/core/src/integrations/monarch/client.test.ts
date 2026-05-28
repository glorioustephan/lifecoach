import { describe, expect, it } from "vitest";
import { mapMonarchAccount, mapMonarchHolding, mapMonarchTransaction } from "./client.js";

describe("Monarch response mappers", () => {
  it("maps accounts with null nested fields to safe defaults", () => {
    expect(
      mapMonarchAccount({
        id: "acc_1",
        displayName: "Checking",
        displayBalance: 123.45,
        isAsset: true,
        type: null,
        subtype: null,
        institution: null,
      }),
    ).toEqual({
      id: "acc_1",
      displayName: "Checking",
      type: { name: "unknown", display: "Unknown" },
      subtype: { name: "unknown", display: "Unknown" },
      currentBalance: 123.45,
      isAsset: true,
      institution: null,
    });
  });

  it("maps transaction category and recurring fields without any casts", () => {
    expect(
      mapMonarchTransaction({
        id: "txn_1",
        date: "2026-05-28",
        amount: "19.99",
        pending: false,
        isRecurring: true,
        isTransfer: false,
        account: { id: "acc_1" },
        category: { name: "Dining", group: { type: "EXPENSE" } },
        merchant: {
          name: "Cafe",
          recurringTransactionStream: { isActive: true, frequency: "MONTHLY" },
        },
      }),
    ).toMatchObject({
      id: "txn_1",
      amount: 19.99,
      merchant: "Cafe",
      category: { name: "Dining" },
      categoryGroupType: "expense",
      accountId: "acc_1",
      recurringFrequency: "MONTHLY",
    });
  });

  it("maps portfolio edge nodes to holdings", () => {
    expect(
      mapMonarchHolding({
        node: {
          quantity: "2",
          basis: 50,
          totalValue: 120,
          security: { ticker: "VTI", closingPrice: 60 },
        },
      }),
    ).toEqual({
      symbol: "VTI",
      quantity: 2,
      currentPrice: 60,
      marketValue: 120,
      costBasis: 50,
    });
  });
});
