import { afterEach, describe, expect, it } from "vitest";
import { refreshAttentionSignals } from "./attention.js";
import { createTestStorage, type TestStorageHandle } from "../testing/test-storage.js";

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

describe("refreshAttentionSignals", () => {
  it("creates evidence-backed signals for overdue tasks", () => {
    handle = createTestStorage();
    const { storage } = handle;
    const task = storage.tasks.upsertByExternal({
      externalId: "task-overdue",
      externalSource: "test",
      content: "schedule annual physical",
      labels: [],
      dueAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    });

    const signals = refreshAttentionSignals(storage);

    expect(signals.some((signal) => signal.kind === "overdue_task")).toBe(true);
    const overdue = signals.find((signal) => signal.kind === "overdue_task");
    expect(overdue?.evidenceRefs).toEqual([
      expect.objectContaining({ refType: "task", refId: task.id }),
    ]);
  });

  it("only creates measurement shift signals when enough same-unit data exists", () => {
    handle = createTestStorage();
    const { storage } = handle;
    const base = Date.now() - 3 * 24 * 60 * 60 * 1000;
    storage.measurements.create({
      metric: "hrv",
      value: 70,
      unit: "ms",
      recordedAt: base,
    });
    storage.measurements.create({
      metric: "hrv",
      value: 68,
      unit: "ms",
      recordedAt: base + 24 * 60 * 60 * 1000,
    });
    storage.measurements.create({
      metric: "hrv",
      value: 52,
      unit: "ms",
      recordedAt: base + 2 * 24 * 60 * 60 * 1000,
    });

    const signals = refreshAttentionSignals(storage);

    const measurementSignal = signals.find((signal) => signal.kind === "measurement_shift");
    expect(measurementSignal?.title).toBe("hrv moved down");
    expect(measurementSignal?.evidenceRefs.map((ref) => ref.refType)).toEqual([
      "measurement",
      "measurement",
    ]);
  });
});
