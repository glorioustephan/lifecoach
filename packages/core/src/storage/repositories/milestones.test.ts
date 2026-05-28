import { afterEach, describe, expect, it } from "vitest";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

// ── helpers ───────────────────────────────────────────────────────────────────

let goalCounter = 0;

function seedGoal(storage: ReturnType<typeof createTestStorage>["storage"], title = "Test Goal") {
  goalCounter += 1;
  return storage.goals.create({
    title: `${title} ${goalCounter}`,
    horizon: "this-month",
    status: "active",
    kind: "outcome",
    reviewCadence: "weekly",
  });
}

function seedMilestone(
  storage: ReturnType<typeof createTestStorage>["storage"],
  goalId: string,
  title = "Test Milestone",
) {
  return storage.milestones.create({
    goalId,
    title,
    status: "pending",
    origin: "manual",
    orderIndex: 0,
  });
}

// ── MilestoneRepository.completedRangeWithGoalTitle ──────────────────────────

describe("MilestoneRepository.completedRangeWithGoalTitle", () => {
  it("returns empty array when no milestones are completed", () => {
    handle = createTestStorage();
    const { storage } = handle;
    expect(storage.milestones.completedRangeWithGoalTitle(0, Date.now() + 1000)).toEqual([]);
  });

  it("returns a completed milestone with its parent goal title", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const goal = seedGoal(storage, "Fitness Goal");
    const milestone = seedMilestone(storage, goal.id, "Run 5k");
    storage.milestones.complete(milestone.id);

    const updated = storage.milestones.get(milestone.id)!;
    expect(updated.status).toBe("done");
    expect(updated.completedAt).not.toBeNull();

    const result = storage.milestones.completedRangeWithGoalTitle(
      updated.completedAt! - 1,
      updated.completedAt! + 1000,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(milestone.id);
    expect(result[0]?.goalTitle).toContain("Fitness Goal");
  });

  it("excludes milestones not in 'done' status", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const goal = seedGoal(storage);
    const milestone = seedMilestone(storage, goal.id, "Pending Milestone");
    // Do not complete it.
    expect(milestone.status).toBe("pending");

    const result = storage.milestones.completedRangeWithGoalTitle(0, Date.now() + 1000);
    expect(result.find((m) => m.id === milestone.id)).toBeUndefined();
  });

  it("upper bound is exclusive", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const goal = seedGoal(storage);
    const milestone = seedMilestone(storage, goal.id, "Edge Milestone");
    storage.milestones.complete(milestone.id);

    const updated = storage.milestones.get(milestone.id)!;
    const completedAt = updated.completedAt!;

    // to = completedAt exactly — should be excluded.
    const result = storage.milestones.completedRangeWithGoalTitle(
      completedAt - 1000,
      completedAt,
    );
    expect(result.find((m) => m.id === milestone.id)).toBeUndefined();
  });

  it("returns results in ascending order by completedAt", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const goal = seedGoal(storage);
    const m1 = seedMilestone(storage, goal.id, "First");
    storage.milestones.complete(m1.id);
    const m2 = seedMilestone(storage, goal.id, "Second");
    storage.milestones.complete(m2.id);

    const u1 = storage.milestones.get(m1.id)!;
    const u2 = storage.milestones.get(m2.id)!;
    const from = Math.min(u1.completedAt!, u2.completedAt!) - 1;
    const to = Math.max(u1.completedAt!, u2.completedAt!) + 1000;

    const result = storage.milestones.completedRangeWithGoalTitle(from, to);
    const ids = result.map((m) => m.id);
    expect(ids.indexOf(m1.id)).toBeLessThanOrEqual(ids.indexOf(m2.id));
  });
});

// ── MilestoneRepository.listByGoalIds ────────────────────────────────────────

describe("MilestoneRepository.listByGoalIds", () => {
  it("returns empty map for empty input", () => {
    handle = createTestStorage();
    const { storage } = handle;
    expect(storage.milestones.listByGoalIds([])).toEqual(new Map());
  });

  it("returns milestones keyed by goalId", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const goal = seedGoal(storage);
    const m1 = seedMilestone(storage, goal.id, "Alpha");
    const m2 = seedMilestone(storage, goal.id, "Beta");

    const result = storage.milestones.listByGoalIds([goal.id]);
    const forGoal = result.get(goal.id);
    expect(forGoal).toBeDefined();
    expect(forGoal!.map((m) => m.id)).toContain(m1.id);
    expect(forGoal!.map((m) => m.id)).toContain(m2.id);
  });

  it("does not include goals not in the provided ids", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const goalA = seedGoal(storage, "Goal A");
    const goalB = seedGoal(storage, "Goal B");
    seedMilestone(storage, goalA.id, "Milestone A");
    seedMilestone(storage, goalB.id, "Milestone B");

    const result = storage.milestones.listByGoalIds([goalA.id]);
    expect(result.has(goalB.id)).toBe(false);
    expect(result.has(goalA.id)).toBe(true);
  });

  it("goals with no milestones are absent from the map", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const goal = seedGoal(storage, "Empty Goal");
    // No milestones for this goal.

    const result = storage.milestones.listByGoalIds([goal.id]);
    expect(result.has(goal.id)).toBe(false);
  });

  it("milestones are ordered by order_index ascending within each goal", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const goal = seedGoal(storage);
    const m1 = storage.milestones.create({ goalId: goal.id, title: "First", orderIndex: 0, status: "pending", origin: "manual" });
    const m2 = storage.milestones.create({ goalId: goal.id, title: "Second", orderIndex: 1, status: "pending", origin: "manual" });
    const m3 = storage.milestones.create({ goalId: goal.id, title: "Third", orderIndex: 2, status: "pending", origin: "manual" });

    const result = storage.milestones.listByGoalIds([goal.id]);
    const ids = result.get(goal.id)!.map((m) => m.id);
    expect(ids).toEqual([m1.id, m2.id, m3.id]);
  });

  it("handles multiple goals in one call", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const g1 = seedGoal(storage, "Goal 1");
    const g2 = seedGoal(storage, "Goal 2");
    seedMilestone(storage, g1.id, "G1 M1");
    seedMilestone(storage, g2.id, "G2 M1");
    seedMilestone(storage, g2.id, "G2 M2");

    const result = storage.milestones.listByGoalIds([g1.id, g2.id]);
    expect(result.get(g1.id)).toHaveLength(1);
    expect(result.get(g2.id)).toHaveLength(2);
  });
});
