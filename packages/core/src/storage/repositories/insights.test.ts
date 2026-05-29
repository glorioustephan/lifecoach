import { afterEach, describe, expect, it } from "vitest";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

function seedInsight(storage: ReturnType<typeof createTestStorage>["storage"]) {
  return storage.insights.create({
    topic: "Bloodwork results are 12+ days stale",
    body: "Your last panel was over a week ago — worth reviewing.",
  });
}

describe("InsightRepository — acted-entity provenance", () => {
  it("starts with null provenance and active state", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const ins = seedInsight(storage);
    expect(ins.actedEntityType).toBeNull();
    expect(ins.actedEntityId).toBeNull();

    const active = storage.insights.list({ state: "active" });
    expect(active.map((i) => i.id)).toContain(ins.id);
  });

  it("markActedWithEntity stamps acted_on_at + provenance and moves the card to acted", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const ins = seedInsight(storage);
    storage.insights.markActedWithEntity(ins.id, "habit", "habit_123");

    const got = storage.insights.get(ins.id);
    expect(got?.actedOnAt).toBeGreaterThan(0);
    expect(got?.actedEntityType).toBe("habit");
    expect(got?.actedEntityId).toBe("habit_123");

    // It leaves the active list and appears under "acted".
    expect(storage.insights.list({ state: "active" }).map((i) => i.id)).not.toContain(ins.id);
    expect(storage.insights.list({ state: "acted" }).map((i) => i.id)).toContain(ins.id);
  });

  it("reactivate clears the closure flags but PRESERVES provenance", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const ins = seedInsight(storage);
    storage.insights.markActedWithEntity(ins.id, "goal", "goal_abc");
    storage.insights.reactivate(ins.id);

    const got = storage.insights.get(ins.id);
    // Back to active...
    expect(got?.actedOnAt).toBeNull();
    expect(got?.dismissedAt).toBeNull();
    expect(storage.insights.list({ state: "active" }).map((i) => i.id)).toContain(ins.id);
    // ...but the record that it spawned an entity survives, so the create-entity
    // guard can still reject a duplicate.
    expect(got?.actedEntityType).toBe("goal");
    expect(got?.actedEntityId).toBe("goal_abc");
  });
});
