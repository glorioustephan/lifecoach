import { afterEach, describe, expect, it } from "vitest";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

describe("MeasurementRepository", () => {
  it("summarizes latest, delta, and rolling average when units match", () => {
    handle = createTestStorage();
    const { storage } = handle;
    const base = Date.UTC(2026, 0, 1);
    storage.measurements.create({
      metric: "weight",
      value: 200,
      unit: "lb",
      recordedAt: base,
    });
    storage.measurements.create({
      metric: "weight",
      value: 198,
      unit: "lb",
      recordedAt: base + 24 * 60 * 60 * 1000,
    });
    storage.measurements.create({
      metric: "weight",
      value: 197,
      unit: "lb",
      recordedAt: base + 2 * 24 * 60 * 60 * 1000,
    });

    const summary = storage.measurements.summarize("weight");

    expect(summary.count).toBe(3);
    expect(summary.latest?.value).toBe(197);
    expect(summary.delta).toBe(-1);
    expect(summary.deltaPercent).toBeCloseTo(-0.505, 3);
    expect(summary.rollingAverage).toBeCloseTo(198.333, 3);
    expect(summary.unitMismatch).toBe(false);
  });

  it("does not calculate trends across mismatched units", () => {
    handle = createTestStorage();
    const { storage } = handle;
    const base = Date.UTC(2026, 0, 1);
    storage.measurements.create({
      metric: "glucose",
      value: 95,
      unit: "mg/dL",
      recordedAt: base,
    });
    storage.measurements.create({
      metric: "glucose",
      value: 5.4,
      unit: "mmol/L",
      recordedAt: base + 24 * 60 * 60 * 1000,
    });

    const summary = storage.measurements.summarize("glucose");

    expect(summary.unitMismatch).toBe(true);
    expect(summary.delta).toBeNull();
    expect(summary.rollingAverage).toBeNull();
  });
});
