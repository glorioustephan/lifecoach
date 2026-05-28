import { describe, expect, it } from "vitest";
import { RECURRING_FREQUENCY_TO_MONTHLY, normalizeToMonthlyAmount } from "./recurring.js";

describe("RECURRING_FREQUENCY_TO_MONTHLY", () => {
  it("monthly multiplier is 1", () => {
    expect(RECURRING_FREQUENCY_TO_MONTHLY["monthly"]).toBe(1);
  });

  it("weekly multiplier is 52/12", () => {
    expect(RECURRING_FREQUENCY_TO_MONTHLY["weekly"]).toBeCloseTo(52 / 12);
  });

  it("annual multiplier is 1/12", () => {
    expect(RECURRING_FREQUENCY_TO_MONTHLY["annual"]).toBeCloseTo(1 / 12);
  });

  it("yearly multiplier equals annual multiplier", () => {
    expect(RECURRING_FREQUENCY_TO_MONTHLY["yearly"]).toBe(
      RECURRING_FREQUENCY_TO_MONTHLY["annual"],
    );
  });
});

describe("normalizeToMonthlyAmount", () => {
  it("returns 0 when count is 0", () => {
    expect(normalizeToMonthlyAmount(300, 0, "monthly")).toBe(0);
  });

  it("returns 0 when count is negative", () => {
    expect(normalizeToMonthlyAmount(300, -1, "monthly")).toBe(0);
  });

  it("monthly freq: per-charge × 1 = same as per-charge", () => {
    // $100/mo × 1 charge over the window
    expect(normalizeToMonthlyAmount(100, 1, "monthly")).toBeCloseTo(100);
  });

  it("weekly freq: one charge multiplied by 52/12", () => {
    const perCharge = 30;
    const expected = perCharge * (52 / 12);
    expect(normalizeToMonthlyAmount(30, 1, "weekly")).toBeCloseTo(expected);
  });

  it("annual freq: per-charge × 1/12", () => {
    const expected = 120 * (1 / 12); // $120/yr → $10/mo
    expect(normalizeToMonthlyAmount(120, 1, "annual")).toBeCloseTo(expected);
  });

  it("multiple charges: averages per-charge before multiplying", () => {
    // 3 monthly charges totaling $300 → avg $100/charge × 1 = $100/mo
    expect(normalizeToMonthlyAmount(300, 3, "monthly")).toBeCloseTo(100);
  });

  it("unknown freq falls back to totalAbs / fallbackMonths (default 3)", () => {
    expect(normalizeToMonthlyAmount(300, 5, "unknown_freq")).toBeCloseTo(100);
  });

  it("no freq falls back to totalAbs / fallbackMonths (default 3)", () => {
    expect(normalizeToMonthlyAmount(150, 2)).toBeCloseTo(50);
  });

  it("custom fallbackMonths overrides the default", () => {
    expect(normalizeToMonthlyAmount(240, 4, undefined, 6)).toBeCloseTo(40);
  });

  it("case-insensitive: Weekly matches weekly multiplier", () => {
    const lower = normalizeToMonthlyAmount(30, 1, "weekly");
    const upper = normalizeToMonthlyAmount(30, 1, "Weekly");
    expect(upper).toBeCloseTo(lower);
  });

  it("case-insensitive: MONTHLY matches monthly multiplier", () => {
    const lower = normalizeToMonthlyAmount(100, 1, "monthly");
    const upper = normalizeToMonthlyAmount(100, 1, "MONTHLY");
    expect(upper).toBeCloseTo(lower);
  });

  it("case-insensitive: Quarterly matches quarterly multiplier", () => {
    const lower = normalizeToMonthlyAmount(90, 1, "quarterly");
    const upper = normalizeToMonthlyAmount(90, 1, "Quarterly");
    expect(upper).toBeCloseTo(lower);
  });
});
