import { afterEach, describe, expect, it } from "vitest";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

// ── Seed helpers ──────────────────────────────────────────────────────────────

function seedGoal(storage: ReturnType<typeof createTestStorage>["storage"]) {
  return storage.goals.create({
    title: "Improve Lipid Panel",
    horizon: "this-quarter",
    status: "active",
    kind: "process",
    reviewCadence: "weekly",
  });
}

function seedMilestone(
  storage: ReturnType<typeof createTestStorage>["storage"],
  goalId: string,
) {
  return storage.milestones.create({
    goalId,
    title: "Baseline labs",
    status: "pending",
    origin: "manual",
    orderIndex: 0,
  });
}

// ── HabitRepository — CRUD ────────────────────────────────────────────────────

describe("HabitRepository — create and get", () => {
  it("creates a habit with all required fields and returns it", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const h = storage.habits.create({
      title: "Take fish oil",
      cadence: "daily",
    });

    expect(h.id).toBeTruthy();
    expect(h.title).toBe("Take fish oil");
    expect(h.cadence).toBe("daily");
    expect(h.status).toBe("active");
    expect(h.parentGoalId).toBeNull();
    expect(h.parentMilestoneId).toBeNull();
    expect(h.lastCompletedAt).toBeNull();
    expect(h.createdAt).toBeGreaterThan(0);
    expect(h.updatedAt).toBe(h.createdAt);
  });

  it("creates a habit linked to a parent goal", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const goal = seedGoal(storage);
    const h = storage.habits.create({
      title: "Omega-3 with breakfast",
      cadence: "daily",
      parentGoalId: goal.id,
    });

    expect(h.parentGoalId).toBe(goal.id);
    expect(h.parentMilestoneId).toBeNull();
  });

  it("creates a habit linked to both a goal and a milestone", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const goal = seedGoal(storage);
    const milestone = seedMilestone(storage, goal.id);
    const h = storage.habits.create({
      title: "Daily labs prep",
      cadence: "daily",
      parentGoalId: goal.id,
      parentMilestoneId: milestone.id,
    });

    expect(h.parentGoalId).toBe(goal.id);
    expect(h.parentMilestoneId).toBe(milestone.id);
  });

  it("returns undefined for a missing id", () => {
    handle = createTestStorage();
    const { storage } = handle;
    expect(storage.habits.get("does-not-exist")).toBeUndefined();
  });
});

// ── HabitRepository — list ────────────────────────────────────────────────────

describe("HabitRepository — list", () => {
  it("returns all habits when no filter", () => {
    handle = createTestStorage();
    const { storage } = handle;

    storage.habits.create({ title: "H1", cadence: "daily" });
    storage.habits.create({ title: "H2", cadence: "weekly" });

    expect(storage.habits.list()).toHaveLength(2);
  });

  it("filters by status", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const h1 = storage.habits.create({ title: "Active", cadence: "daily" });
    const h2 = storage.habits.create({ title: "To archive", cadence: "weekly" });
    storage.habits.archive(h2.id);

    const active = storage.habits.list({ status: "active" });
    expect(active.map((h) => h.id)).toContain(h1.id);
    expect(active.map((h) => h.id)).not.toContain(h2.id);
  });

  it("filters by parentGoalId", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const goal = seedGoal(storage);
    const linked = storage.habits.create({
      title: "Linked",
      cadence: "daily",
      parentGoalId: goal.id,
    });
    const standalone = storage.habits.create({ title: "Standalone", cadence: "weekly" });

    const result = storage.habits.list({ parentGoalId: goal.id });
    expect(result.map((h) => h.id)).toContain(linked.id);
    expect(result.map((h) => h.id)).not.toContain(standalone.id);
  });
});

// ── HabitRepository — update ──────────────────────────────────────────────────

describe("HabitRepository — update", () => {
  it("updates title and cadence", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const h = storage.habits.create({ title: "Old title", cadence: "daily" });
    const updated = storage.habits.update(h.id, { title: "New title", cadence: "weekly" });

    expect(updated).toBeDefined();
    expect(updated!.title).toBe("New title");
    expect(updated!.cadence).toBe("weekly");
  });

  it("returns undefined for unknown id", () => {
    handle = createTestStorage();
    const { storage } = handle;
    expect(storage.habits.update("no-such-id", { title: "x" })).toBeUndefined();
  });

  it("clears parent fields when set to null", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const goal = seedGoal(storage);
    const h = storage.habits.create({
      title: "Linked",
      cadence: "weekly",
      parentGoalId: goal.id,
    });

    const updated = storage.habits.update(h.id, { parentGoalId: null });
    expect(updated!.parentGoalId).toBeNull();
  });
});

// ── HabitRepository — archive ─────────────────────────────────────────────────

describe("HabitRepository — archive (soft-delete)", () => {
  it("sets status to archived", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const h = storage.habits.create({ title: "To archive", cadence: "daily" });
    storage.habits.archive(h.id);
    const updated = storage.habits.get(h.id);

    expect(updated!.status).toBe("archived");
  });

  it("archived habit excluded from active filter", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const h = storage.habits.create({ title: "Archive me", cadence: "daily" });
    storage.habits.archive(h.id);

    const active = storage.habits.list({ status: "active" });
    expect(active.map((x) => x.id)).not.toContain(h.id);
  });
});

// ── HabitRepository — setLastCompleted ───────────────────────────────────────

describe("HabitRepository — setLastCompleted", () => {
  it("stamps last_completed_at on the habit row", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const h = storage.habits.create({ title: "Stretch", cadence: "daily" });
    expect(h.lastCompletedAt).toBeNull();

    const ts = Date.now();
    storage.habits.setLastCompleted(h.id, ts);

    const updated = storage.habits.get(h.id)!;
    expect(updated.lastCompletedAt).toBe(ts);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(h.updatedAt);
  });
});

// ── HabitCompletionRepository — CRUD ─────────────────────────────────────────

describe("HabitCompletionRepository — create and list", () => {
  it("creates a completion and lists it", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const h = storage.habits.create({ title: "Read", cadence: "daily" });
    const ts = Date.now();
    const c = storage.habitCompletions.create({
      habitId: h.id,
      completedAt: ts,
      origin: "manual",
    });

    expect(c.id).toBeTruthy();
    expect(c.habitId).toBe(h.id);
    expect(c.completedAt).toBe(ts);
    expect(c.origin).toBe("manual");

    const list = storage.habitCompletions.listForHabit(h.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(c.id);
  });

  it("deletes a completion by id", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const h = storage.habits.create({ title: "Meditate", cadence: "daily" });
    const c = storage.habitCompletions.create({
      habitId: h.id,
      completedAt: Date.now(),
      origin: "manual",
    });

    storage.habitCompletions.delete(c.id);
    const list = storage.habitCompletions.listForHabit(h.id);
    expect(list).toHaveLength(0);
  });

  it("filters by fromMs and toMs", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const h = storage.habits.create({ title: "Walk", cadence: "daily" });
    const base = 1_700_000_000_000;
    const DAY = 86_400_000;

    storage.habitCompletions.create({ habitId: h.id, completedAt: base - 2 * DAY, origin: "manual" });
    const inWindow = storage.habitCompletions.create({
      habitId: h.id,
      completedAt: base - DAY,
      origin: "manual",
    });
    storage.habitCompletions.create({ habitId: h.id, completedAt: base, origin: "manual" });

    const result = storage.habitCompletions.listForHabit(h.id, {
      fromMs: base - 2 * DAY + 1,
      toMs: base,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(inWindow.id);
  });
});

// ── HabitCompletionRepository — countByDayForHabits ─────────────────────────

describe("HabitCompletionRepository — countByDayForHabits", () => {
  it("returns an empty map for an empty habitIds list", () => {
    handle = createTestStorage();
    const { storage } = handle;
    expect(
      storage.habitCompletions.countByDayForHabits([], 0, Date.now()),
    ).toEqual(new Map());
  });

  it("counts completions per day for a single habit", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const h = storage.habits.create({ title: "Habit A", cadence: "daily" });
    // Use a fixed local-midnight baseline that avoids DST issues.
    const day1 = new Date(2026, 0, 1, 12, 0, 0, 0).getTime(); // 2026-01-01 noon local
    const day2 = new Date(2026, 0, 2, 12, 0, 0, 0).getTime(); // 2026-01-02 noon local

    storage.habitCompletions.create({ habitId: h.id, completedAt: day1, origin: "manual" });
    storage.habitCompletions.create({ habitId: h.id, completedAt: day1 + 1000, origin: "manual" }); // same day
    storage.habitCompletions.create({ habitId: h.id, completedAt: day2, origin: "manual" });

    const from = new Date(2026, 0, 1, 0, 0, 0, 0).getTime();
    const to = new Date(2026, 0, 3, 0, 0, 0, 0).getTime();
    const result = storage.habitCompletions.countByDayForHabits([h.id], from, to);

    const byDay = result.get(h.id);
    expect(byDay).toBeDefined();
    expect(byDay!.get("2026-01-01")).toBe(2);
    expect(byDay!.get("2026-01-02")).toBe(1);
  });

  it("correctly segregates counts across two habits in the same window", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const hA = storage.habits.create({ title: "Habit A", cadence: "daily" });
    const hB = storage.habits.create({ title: "Habit B", cadence: "weekly" });

    const day = new Date(2026, 1, 15, 12, 0, 0, 0).getTime(); // 2026-02-15 noon local

    storage.habitCompletions.create({ habitId: hA.id, completedAt: day, origin: "manual" });
    storage.habitCompletions.create({ habitId: hA.id, completedAt: day + 1000, origin: "manual" });
    storage.habitCompletions.create({ habitId: hB.id, completedAt: day, origin: "conversation" });

    const from = new Date(2026, 1, 1, 0, 0, 0, 0).getTime();
    const to = new Date(2026, 2, 1, 0, 0, 0, 0).getTime();
    const result = storage.habitCompletions.countByDayForHabits([hA.id, hB.id], from, to);

    expect(result.get(hA.id)!.get("2026-02-15")).toBe(2);
    expect(result.get(hB.id)!.get("2026-02-15")).toBe(1);
    // Habits not represented in the other's map.
    expect(result.get(hA.id)!.has("2026-02-16")).toBe(false);
  });

  it("excludes completions outside the window", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const h = storage.habits.create({ title: "Habit C", cadence: "monthly" });
    const inWindow = new Date(2026, 5, 15, 12, 0, 0, 0).getTime(); // June 15
    const outOfWindow = new Date(2026, 4, 31, 12, 0, 0, 0).getTime(); // May 31

    storage.habitCompletions.create({ habitId: h.id, completedAt: inWindow, origin: "manual" });
    storage.habitCompletions.create({ habitId: h.id, completedAt: outOfWindow, origin: "manual" });

    const from = new Date(2026, 5, 1, 0, 0, 0, 0).getTime();
    const to = new Date(2026, 6, 1, 0, 0, 0, 0).getTime();
    const result = storage.habitCompletions.countByDayForHabits([h.id], from, to);

    const byDay = result.get(h.id);
    expect(byDay).toBeDefined();
    expect(byDay!.size).toBe(1); // only June 15
  });
});

// ── FK constraint — milestone requires goal ───────────────────────────────────

describe("HabitRepository — FK constraint check", () => {
  it("enforces that parentMilestoneId requires parentGoalId at the DB level", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const goal = seedGoal(storage);
    const milestone = seedMilestone(storage, goal.id);

    // Attempting to insert with milestoneId but no goalId should violate the
    // CHECK constraint (parent_milestone_id IS NULL OR parent_goal_id IS NOT NULL).
    expect(() =>
      storage.handle.db
        .prepare(
          `INSERT INTO habits(id, title, cadence, status, parent_goal_id, parent_milestone_id, created_at, updated_at)
           VALUES ('chk-test', 'Bad Habit', 'daily', 'active', NULL, ?, 1, 1)`,
        )
        .run(milestone.id),
    ).toThrow();
  });
});
