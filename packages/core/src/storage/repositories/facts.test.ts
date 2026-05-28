import { afterEach, describe, expect, it } from "vitest";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";
import type { FactCategory } from "@lifecoach/schemas";

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

// ── FactRepository.queryActiveRange ──────────────────────────────────────────

describe("FactRepository.queryActiveRange", () => {
  it("returns empty array when no facts exist", () => {
    handle = createTestStorage();
    const { storage } = handle;
    expect(storage.facts.queryActiveRange(0, Date.now() + 1000)).toEqual([]);
  });

  it("returns a fact created within the range", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const fact = storage.facts.create({
      category: "health" as FactCategory,
      subject: "sleep",
      body: "typically 7-8h",
      confidence: 0.9,
    });

    const result = storage.facts.queryActiveRange(fact.createdAt - 1, fact.createdAt + 1000);
    expect(result.some((f) => f.id === fact.id)).toBe(true);
  });

  it("excludes facts created outside the range", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const fact = storage.facts.create({
      category: "health" as FactCategory,
      subject: "exercise",
      body: "runs 3x/week",
      confidence: 1.0,
    });

    // Query entirely before the fact was created.
    const result = storage.facts.queryActiveRange(0, fact.createdAt - 1);
    expect(result.find((f) => f.id === fact.id)).toBeUndefined();
  });

  it("upper bound is exclusive", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const fact = storage.facts.create({
      category: "health" as FactCategory,
      subject: "boundary",
      body: "boundary test",
      confidence: 1.0,
    });

    const result = storage.facts.queryActiveRange(fact.createdAt - 1, fact.createdAt);
    expect(result.find((f) => f.id === fact.id)).toBeUndefined();
  });

  it("excludes soft-deleted facts", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const fact = storage.facts.create({
      category: "identity" as FactCategory,
      subject: "old fact",
      body: "to be deleted",
      confidence: 1.0,
    });
    storage.facts.softDelete(fact.id);

    const result = storage.facts.queryActiveRange(fact.createdAt - 1, fact.createdAt + 1000);
    expect(result.find((f) => f.id === fact.id)).toBeUndefined();
  });

  it("returns facts in ascending order by created_at", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const f1 = storage.facts.create({
      category: "health" as FactCategory,
      subject: "a",
      body: "first",
      confidence: 1.0,
    });
    const f2 = storage.facts.create({
      category: "health" as FactCategory,
      subject: "b",
      body: "second",
      confidence: 1.0,
    });

    const from = Math.min(f1.createdAt, f2.createdAt) - 1;
    const to = Math.max(f1.createdAt, f2.createdAt) + 1000;
    const result = storage.facts.queryActiveRange(from, to);
    const ids = result.map((f) => f.id);
    expect(ids.indexOf(f1.id)).toBeLessThanOrEqual(ids.indexOf(f2.id));
  });
});

// ── FactRepository.findActiveBySourceAndCategory ─────────────────────────────

describe("FactRepository.findActiveBySourceAndCategory", () => {
  it("returns undefined when no matching fact exists", () => {
    handle = createTestStorage();
    const { storage } = handle;
    const result = storage.facts.findActiveBySourceAndCategory(
      "capacities:abc123",
      "health" as FactCategory,
    );
    expect(result).toBeUndefined();
  });

  it("returns a fact with matching source and category", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const fact = storage.facts.create({
      category: "identity" as FactCategory,
      subject: "test subject",
      body: "test body",
      source: "capacities:obj-1",
      confidence: 1.0,
    });

    const result = storage.facts.findActiveBySourceAndCategory(
      "capacities:obj-1",
      "identity" as FactCategory,
    );
    expect(result?.id).toBe(fact.id);
  });

  it("does not return a fact with matching source but different category", () => {
    handle = createTestStorage();
    const { storage } = handle;

    storage.facts.create({
      category: "identity" as FactCategory,
      subject: "subject",
      body: "body",
      source: "capacities:obj-2",
      confidence: 1.0,
    });

    const result = storage.facts.findActiveBySourceAndCategory(
      "capacities:obj-2",
      "health" as FactCategory,
    );
    expect(result).toBeUndefined();
  });

  it("does not return a soft-deleted fact", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const fact = storage.facts.create({
      category: "finance" as FactCategory,
      subject: "budget",
      body: "monthly budget is $5000",
      source: "capacities:obj-3",
      confidence: 1.0,
    });
    storage.facts.softDelete(fact.id);

    const result = storage.facts.findActiveBySourceAndCategory(
      "capacities:obj-3",
      "finance" as FactCategory,
    );
    expect(result).toBeUndefined();
  });
});
