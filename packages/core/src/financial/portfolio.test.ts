import { describe, expect, it } from "vitest";
import {
  LIABILITY_ACCOUNT_TYPES,
  LIQUID_ASSET_TYPES,
  isLiabilityType,
  isLiquidAssetType,
  computeNetWorth,
} from "./portfolio.js";

describe("LIABILITY_ACCOUNT_TYPES", () => {
  it("contains debt and credit_card", () => {
    expect(LIABILITY_ACCOUNT_TYPES.has("debt")).toBe(true);
    expect(LIABILITY_ACCOUNT_TYPES.has("credit_card")).toBe(true);
  });

  it("does not contain checking or savings", () => {
    expect(LIABILITY_ACCOUNT_TYPES.has("checking")).toBe(false);
    expect(LIABILITY_ACCOUNT_TYPES.has("savings")).toBe(false);
  });
});

describe("LIQUID_ASSET_TYPES", () => {
  it("contains checking and savings", () => {
    expect(LIQUID_ASSET_TYPES.has("checking")).toBe(true);
    expect(LIQUID_ASSET_TYPES.has("savings")).toBe(true);
  });

  it("does not contain investment or debt", () => {
    expect(LIQUID_ASSET_TYPES.has("investment")).toBe(false);
    expect(LIQUID_ASSET_TYPES.has("debt")).toBe(false);
  });
});

describe("isLiabilityType", () => {
  it("returns true for debt", () => {
    expect(isLiabilityType("debt")).toBe(true);
  });

  it("returns true for credit_card", () => {
    expect(isLiabilityType("credit_card")).toBe(true);
  });

  it("returns false for checking", () => {
    expect(isLiabilityType("checking")).toBe(false);
  });

  it("returns false for unknown type", () => {
    expect(isLiabilityType("brokerage")).toBe(false);
  });
});

describe("isLiquidAssetType", () => {
  it("returns true for checking", () => {
    expect(isLiquidAssetType("checking")).toBe(true);
  });

  it("returns true for savings", () => {
    expect(isLiquidAssetType("savings")).toBe(true);
  });

  it("returns false for investment", () => {
    expect(isLiquidAssetType("investment")).toBe(false);
  });

  it("returns false for debt", () => {
    expect(isLiquidAssetType("debt")).toBe(false);
  });
});

describe("computeNetWorth", () => {
  it("returns zeros for an empty account list", () => {
    const result = computeNetWorth([]);
    expect(result.totalAssets).toBe(0);
    expect(result.totalLiabilities).toBe(0);
    expect(result.netWorth).toBe(0);
    expect(result.liquidSavings).toBe(0);
  });

  it("sums assets and subtracts liabilities", () => {
    const accounts = [
      { type: "checking", balance: 5000 },
      { type: "savings", balance: 10000 },
      { type: "credit_card", balance: 2000 },
    ];
    const result = computeNetWorth(accounts);
    expect(result.totalAssets).toBe(15000);
    expect(result.totalLiabilities).toBe(2000);
    expect(result.netWorth).toBe(13000);
  });

  it("liquidSavings only sums checking and savings accounts", () => {
    const accounts = [
      { type: "checking", balance: 3000 },
      { type: "savings", balance: 7000 },
      { type: "investment", balance: 50000 },
      { type: "other", balance: 100000 },
    ];
    const result = computeNetWorth(accounts);
    expect(result.liquidSavings).toBe(10000);
  });

  it("uses Math.abs for liability balance (positive sign from Monarch)", () => {
    const accounts = [
      { type: "checking", balance: 5000 },
      { type: "credit_card", balance: 1500 }, // Monarch sometimes returns positive
    ];
    const result = computeNetWorth(accounts);
    expect(result.totalLiabilities).toBe(1500);
    expect(result.netWorth).toBe(3500);
  });

  it("uses Math.abs for liability balance (negative sign from Monarch)", () => {
    const accounts = [
      { type: "checking", balance: 5000 },
      { type: "credit_card", balance: -1500 }, // negative sign variant
    ];
    const result = computeNetWorth(accounts);
    expect(result.totalLiabilities).toBe(1500);
    expect(result.netWorth).toBe(3500);
  });

  it("non-liability non-liquid types still count toward totalAssets but not liquidSavings", () => {
    const accounts = [
      { type: "investment", balance: 80000 },
    ];
    const result = computeNetWorth(accounts);
    expect(result.totalAssets).toBe(80000);
    expect(result.liquidSavings).toBe(0);
    expect(result.netWorth).toBe(80000);
  });

  it("mixed types produce correct net worth", () => {
    const accounts = [
      { type: "checking", balance: 2000 },
      { type: "savings", balance: 8000 },
      { type: "investment", balance: 50000 },
      { type: "credit_card", balance: 3000 },
      { type: "debt", balance: 15000 },
    ];
    const result = computeNetWorth(accounts);
    expect(result.totalAssets).toBe(60000); // 2000 + 8000 + 50000
    expect(result.totalLiabilities).toBe(18000); // 3000 + 15000
    expect(result.netWorth).toBe(42000);
    expect(result.liquidSavings).toBe(10000); // 2000 + 8000
  });
});
