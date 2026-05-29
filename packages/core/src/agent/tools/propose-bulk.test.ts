/**
 * Integration tests for the propose/bulk transaction logic.
 *
 * We exercise the storage layer directly to verify the transaction semantics
 * used by the /api/propose/bulk server route — goal creation, habit creation,
 * task.create(), FK propagation, and atomic rollback on failure.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createTestStorage, type TestStorageHandle } from "../../testing/test-storage.js";

let handle: TestStorageHandle | null = null;

afterEach(() => {
  handle?.cleanup();
  handle = null;
});

// ── Happy-path: goal + habits + task ─────────────────────────────────────────

describe("propose bulk-create transaction", () => {
  it("creates a new goal, attaches 2 habits + 1 task to it", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const { goal, habits, tasks } = storage.handle.db.transaction(() => {
      const goal = storage.goals.create({
        title: "Improve lipid panel",
        kind: "process",
        status: "active",
        horizon: "open",
        reviewCadence: "weekly",
      });

      const habits = [
        storage.habits.create({
          title: "Take fish oil daily",
          cadence: "daily",
          parentGoalId: goal.id,
        }),
        storage.habits.create({
          title: "Eat more oily fish",
          cadence: "weekly",
          parentGoalId: goal.id,
        }),
      ];

      const tasks = [
        storage.tasks.create({
          content: "Order TG-form fish oil supplement",
          goalId: goal.id,
        }),
      ];

      return { goal, habits, tasks };
    })();

    // Goal created with correct fields.
    expect(goal.id).toBeTruthy();
    expect(goal.title).toBe("Improve lipid panel");
    expect(goal.kind).toBe("process");
    expect(goal.status).toBe("active");

    // Both habits link to the goal.
    expect(habits).toHaveLength(2);
    for (const h of habits) {
      expect(h.parentGoalId).toBe(goal.id);
      expect(h.status).toBe("active");
    }
    expect(habits[0]!.cadence).toBe("daily");
    expect(habits[1]!.cadence).toBe("weekly");

    // Task links to the goal.
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.goalId).toBe(goal.id);
    expect(tasks[0]!.content).toBe("Order TG-form fish oil supplement");

    // Verify persistence by re-loading each row.
    expect(storage.habits.get(habits[0]!.id)?.parentGoalId).toBe(goal.id);
    expect(storage.tasks.get(tasks[0]!.id)?.goalId).toBe(goal.id);
  });

  it("attaches items to an existing goal when parentGoalId is provided (no new goal)", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const existingGoal = storage.goals.create({
      title: "Pre-existing goal",
      kind: "outcome",
      status: "active",
      horizon: "this-quarter",
      reviewCadence: "weekly",
    });

    const habit = storage.habits.create({
      title: "Daily walk",
      cadence: "daily",
      parentGoalId: existingGoal.id,
    });

    expect(habit.parentGoalId).toBe(existingGoal.id);
    // No new goal was created.
    expect(storage.goals.list().length).toBe(1);
  });

  it("creates stand-alone items when no goal is specified", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const habit = storage.habits.create({
      title: "Drink more water",
      cadence: "daily",
    });
    const task = storage.tasks.create({ content: "Buy water bottle" });

    expect(habit.parentGoalId).toBeNull();
    expect(task.goalId).toBeNull();
    expect(storage.goals.list().length).toBe(0);
  });

  it("rolls back all rows on a simulated failure inside the transaction", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const habitsBefore = storage.habits.list().length;
    const goalsBefore = storage.goals.list().length;
    const tasksBefore = storage.tasks.list({ status: "all" }).length;

    expect(() => {
      storage.handle.db.transaction(() => {
        storage.goals.create({
          title: "Should be rolled back",
          kind: "process",
          status: "active",
          horizon: "open",
          reviewCadence: "weekly",
        });

        storage.habits.create({ title: "Also rolled back", cadence: "daily" });

        // Item 2 fails validation — simulated throw inside the transaction.
        throw new Error("simulated failure on item 2");
      })();
    }).toThrow("simulated failure on item 2");

    // Nothing should have been committed.
    expect(storage.habits.list().length).toBe(habitsBefore);
    expect(storage.goals.list().length).toBe(goalsBefore);
    expect(storage.tasks.list({ status: "all" }).length).toBe(tasksBefore);
  });
});

// ── TaskRepository.create (local tasks) ──────────────────────────────────────

describe("TaskRepository.create — local tasks", () => {
  it("creates a local task with no external source", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const task = storage.tasks.create({ content: "Buy groceries" });

    expect(task.id).toBeTruthy();
    expect(task.content).toBe("Buy groceries");
    expect(task.externalId).toBeNull();
    expect(task.externalSource).toBeNull();
    expect(task.goalId).toBeNull();
    expect(task.completedAt).toBeNull();
    expect(task.labels).toEqual([]);
  });

  it("creates a local task with dueAt and goalId", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const goal = storage.goals.create({
      title: "My goal",
      kind: "outcome",
      status: "active",
      horizon: "this-month",
      reviewCadence: "weekly",
    });

    const dueAt = Date.now() + 86_400_000;
    const task = storage.tasks.create({
      content: "Do the thing",
      dueAt,
      goalId: goal.id,
    });

    expect(task.dueAt).toBe(dueAt);
    expect(task.goalId).toBe(goal.id);
  });

  it("retrieves a local task via tasks.get", () => {
    handle = createTestStorage();
    const { storage } = handle;

    const created = storage.tasks.create({ content: "Persisted task" });
    const fetched = storage.tasks.get(created.id);

    expect(fetched).toBeDefined();
    expect(fetched?.content).toBe("Persisted task");
  });
});
