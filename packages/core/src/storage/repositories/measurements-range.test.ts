import { afterEach, describe, expect, it } from "vitest";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

// ── MeasurementRepository.queryRange ─────────────────────────────────────────

describe("MeasurementRepository.queryRange", () => {
  it("returns empty array when no measurements exist", () => {
    handle = createTestStorage();
    const { storage } = handle;
    expect(storage.measurements.queryRange(0, Date.now() + 1000)).toEqual([]);
  });

  it("returns measurements recorded within the range", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const m = storage.measurements.create({
      metric: "weight",
      value: 180,
      unit: "lb",
      recordedAt: Date.UTC(2026, 3, 10),
    });

    const result = storage.measurements.queryRange(
      Date.UTC(2026, 3, 1),
      Date.UTC(2026, 4, 1),
    );
    expect(result.some((r) => r.id === m.id)).toBe(true);
  });

  it("returns measurements for multiple metrics in the range", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const base = Date.UTC(2026, 4, 1);
    storage.measurements.create({ metric: "weight", value: 180, unit: "lb", recordedAt: base });
    storage.measurements.create({ metric: "steps", value: 8000, unit: "steps", recordedAt: base + 3600 });

    const result = storage.measurements.queryRange(base - 1, base + 10_000);
    const metrics = result.map((r) => r.metric);
    expect(metrics).toContain("weight");
    expect(metrics).toContain("steps");
  });

  it("excludes measurements outside the range", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const recordedAt = Date.UTC(2026, 5, 1);
    const m = storage.measurements.create({
      metric: "glucose",
      value: 95,
      unit: "mg/dL",
      recordedAt,
    });

    // Query before the measurement.
    const result = storage.measurements.queryRange(0, recordedAt - 1);
    expect(result.find((r) => r.id === m.id)).toBeUndefined();
  });

  it("upper bound is exclusive", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const recordedAt = Date.UTC(2026, 5, 15);
    const m = storage.measurements.create({
      metric: "hrv",
      value: 42,
      unit: "ms",
      recordedAt,
    });

    // to = recordedAt exactly → must be excluded.
    const result = storage.measurements.queryRange(recordedAt - 1000, recordedAt);
    expect(result.find((r) => r.id === m.id)).toBeUndefined();
  });

  it("returns results in ascending order by recordedAt", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const base = Date.UTC(2026, 6, 1);
    const m1 = storage.measurements.create({ metric: "weight", value: 180, unit: "lb", recordedAt: base });
    const m2 = storage.measurements.create({ metric: "weight", value: 179, unit: "lb", recordedAt: base + 86400_000 });

    const result = storage.measurements.queryRange(base - 1, base + 200_000_000);
    const ids = result.map((r) => r.id);
    expect(ids.indexOf(m1.id)).toBeLessThan(ids.indexOf(m2.id));
  });
});

// ── MeasurementRepository.distinctMetrics ────────────────────────────────────

describe("MeasurementRepository.distinctMetrics", () => {
  it("returns empty array when no measurements exist", () => {
    handle = createTestStorage();
    const { storage } = handle;
    expect(storage.measurements.distinctMetrics(0)).toEqual([]);
  });

  it("returns distinct metric names recorded since fromMs", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const base = Date.now();
    storage.measurements.create({ metric: "weight", value: 180, unit: "lb", recordedAt: base });
    storage.measurements.create({ metric: "steps", value: 8000, unit: "steps", recordedAt: base + 1 });
    storage.measurements.create({ metric: "weight", value: 179, unit: "lb", recordedAt: base + 2 });

    const result = storage.measurements.distinctMetrics(base - 1);
    expect(result).toContain("weight");
    expect(result).toContain("steps");
    // weight appears twice but should only appear once in the distinct list.
    expect(result.filter((m) => m === "weight")).toHaveLength(1);
  });

  it("excludes metrics with no observations since fromMs", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const old = Date.UTC(2026, 0, 1);
    storage.measurements.create({ metric: "old_metric", value: 1, unit: "x", recordedAt: old });

    // Query from a point after the old measurement.
    const result = storage.measurements.distinctMetrics(old + 1000);
    expect(result).not.toContain("old_metric");
  });

  it("returns results in alphabetical order", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const base = Date.now();
    storage.measurements.create({ metric: "weight", value: 180, unit: "lb", recordedAt: base });
    storage.measurements.create({ metric: "glucose", value: 95, unit: "mg/dL", recordedAt: base + 1 });
    storage.measurements.create({ metric: "hrv", value: 42, unit: "ms", recordedAt: base + 2 });

    const result = storage.measurements.distinctMetrics(base - 1);
    const sorted = [...result].sort();
    expect(result).toEqual(sorted);
  });
});
