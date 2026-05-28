import { afterEach, describe, expect, it } from "vitest";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";
import type { ReflectionKind } from "@lifecoach/schemas";

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

// ── helpers ───────────────────────────────────────────────────────────────────

function seedReflection(
  storage: ReturnType<typeof createTestStorage>["storage"],
  periodEnd: number,
  kind: ReflectionKind = "daily",
) {
  return storage.reflections.create({
    periodStart: periodEnd - 86400_000,
    periodEnd,
    kind,
    body: `reflection at ${periodEnd}`,
    themes: ["focus"],
    wins: ["shipped feature"],
    concerns: [],
    openThreads: [],
  });
}

// ── ReflectionRepository.queryRange ──────────────────────────────────────────

describe("ReflectionRepository.queryRange", () => {
  it("returns empty array when no reflections exist", () => {
    handle = createTestStorage();
    const { storage } = handle;
    expect(storage.reflections.queryRange(0, Date.now() + 1000)).toEqual([]);
  });

  it("returns a reflection whose periodEnd falls within the range", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const periodEnd = Date.UTC(2026, 3, 10);
    const r = seedReflection(storage, periodEnd);

    const result = storage.reflections.queryRange(periodEnd - 1, periodEnd + 1000);
    expect(result.some((x) => x.id === r.id)).toBe(true);
  });

  it("excludes reflections whose periodEnd falls outside the range", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const periodEnd = Date.UTC(2026, 3, 1);
    const r = seedReflection(storage, periodEnd);

    // Query entirely after the periodEnd.
    const result = storage.reflections.queryRange(periodEnd + 1000, periodEnd + 100_000);
    expect(result.find((x) => x.id === r.id)).toBeUndefined();
  });

  it("upper bound is exclusive (periodEnd = to is excluded)", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const periodEnd = Date.UTC(2026, 4, 1);
    const r = seedReflection(storage, periodEnd);

    const result = storage.reflections.queryRange(periodEnd - 1000, periodEnd);
    expect(result.find((x) => x.id === r.id)).toBeUndefined();
  });

  it("returns results in ascending order by period_end", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const e1 = Date.UTC(2026, 4, 1);
    const e2 = Date.UTC(2026, 4, 8);
    const r1 = seedReflection(storage, e1);
    const r2 = seedReflection(storage, e2);

    const result = storage.reflections.queryRange(e1 - 1, e2 + 1000);
    const ids = result.map((r) => r.id);
    expect(ids.indexOf(r1.id)).toBeLessThan(ids.indexOf(r2.id));
  });

  it("deserializes themes, wins, concerns, openThreads arrays correctly", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const periodEnd = Date.UTC(2026, 5, 1);
    storage.reflections.create({
      periodStart: periodEnd - 86400_000,
      periodEnd,
      kind: "weekly",
      body: "weekly recap",
      themes: ["health", "finance"],
      wins: ["ran 5k"],
      concerns: ["credit card bill"],
      openThreads: ["follow up with dentist"],
    });

    const result = storage.reflections.queryRange(periodEnd - 1, periodEnd + 1000);
    const r = result[0];
    expect(r?.themes).toEqual(["health", "finance"]);
    expect(r?.wins).toEqual(["ran 5k"]);
    expect(r?.concerns).toEqual(["credit card bill"]);
    expect(r?.openThreads).toEqual(["follow up with dentist"]);
  });
});

// ── ReflectionRepository.list ─────────────────────────────────────────────────

describe("ReflectionRepository.list", () => {
  it("returns empty array when no reflections exist", () => {
    handle = createTestStorage();
    const { storage } = handle;
    expect(storage.reflections.list()).toEqual([]);
  });

  it("returns all reflections with default limit", () => {
    handle = createTestStorage();
    const { storage } = handle;

    seedReflection(storage, Date.UTC(2026, 0, 1));
    seedReflection(storage, Date.UTC(2026, 0, 8));

    const result = storage.reflections.list();
    expect(result.length).toBe(2);
  });

  it("filters by kind when kind is provided", () => {
    handle = createTestStorage();
    const { storage } = handle;

    seedReflection(storage, Date.UTC(2026, 1, 1), "daily");
    seedReflection(storage, Date.UTC(2026, 1, 7), "weekly");

    const dailyResult = storage.reflections.list({ kind: "daily" });
    expect(dailyResult.every((r) => r.kind === "daily")).toBe(true);
    expect(dailyResult).toHaveLength(1);
  });

  it("respects the limit parameter", () => {
    handle = createTestStorage();
    const { storage } = handle;

    for (let i = 0; i < 5; i++) {
      seedReflection(storage, Date.UTC(2026, 2, i + 1));
    }

    const result = storage.reflections.list({ limit: 3 });
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it("respects the offset parameter for pagination", () => {
    handle = createTestStorage();
    const { storage } = handle;

    for (let i = 0; i < 4; i++) {
      seedReflection(storage, Date.UTC(2026, 3, i + 1));
    }

    const page1 = storage.reflections.list({ limit: 2, offset: 0 });
    const page2 = storage.reflections.list({ limit: 2, offset: 2 });
    const allIds = new Set([...page1, ...page2].map((r) => r.id));
    expect(allIds.size).toBe(4);
  });

  it("returns results newest first by default (period_end DESC)", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const r1 = seedReflection(storage, Date.UTC(2026, 4, 1));
    const r2 = seedReflection(storage, Date.UTC(2026, 4, 8));

    const result = storage.reflections.list();
    const ids = result.map((r) => r.id);
    // Newest (r2) should come first.
    expect(ids.indexOf(r2.id)).toBeLessThan(ids.indexOf(r1.id));
  });
});
