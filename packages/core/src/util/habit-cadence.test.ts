import { describe, expect, it } from "vitest";
import { habitWindowMs, isHabitStalled } from "./habit-cadence.js";
import type { Habit } from "@lifecoach/schemas";

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000; // arbitrary fixed "now" for determinism

function makeHabit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: "habit-1",
    title: "Test Habit",
    cadence: "daily",
    status: "active",
    parentGoalId: null,
    parentMilestoneId: null,
    notes: null,
    lastCompletedAt: null,
    createdAt: NOW - 30 * DAY,
    updatedAt: NOW - 30 * DAY,
    ...overrides,
  };
}

// ── habitWindowMs ─────────────────────────────────────────────────────────────

describe("habitWindowMs", () => {
  it("returns 2 days for daily", () => {
    expect(habitWindowMs("daily")).toBe(2 * DAY);
  });

  it("returns 9 days for weekly", () => {
    expect(habitWindowMs("weekly")).toBe(9 * DAY);
  });

  it("returns 38 days for monthly", () => {
    expect(habitWindowMs("monthly")).toBe(38 * DAY);
  });
});

// ── isHabitStalled — status guards ────────────────────────────────────────────

describe("isHabitStalled — non-active statuses are never stalled", () => {
  it("paused habit is never stalled even with ancient completion", () => {
    const habit = makeHabit({ status: "paused" });
    expect(isHabitStalled(habit, NOW - 100 * DAY, NOW)).toBe(false);
  });

  it("archived habit is never stalled", () => {
    const habit = makeHabit({ status: "archived" });
    expect(isHabitStalled(habit, NOW - 100 * DAY, NOW)).toBe(false);
  });
});

// ── isHabitStalled — daily cadence ────────────────────────────────────────────

describe("isHabitStalled — daily", () => {
  const habit = makeHabit({ cadence: "daily" });

  it("not stalled when completed 1 day ago", () => {
    expect(isHabitStalled(habit, NOW - 1 * DAY, NOW)).toBe(false);
  });

  it("not stalled when completed exactly at the window boundary", () => {
    // Exactly 2 days ago — not yet past the window (window is >2d not >=2d).
    expect(isHabitStalled(habit, NOW - 2 * DAY, NOW)).toBe(false);
  });

  it("stalled when completed 2 days + 1ms ago", () => {
    expect(isHabitStalled(habit, NOW - 2 * DAY - 1, NOW)).toBe(true);
  });

  it("stalled when completed 3 days ago", () => {
    expect(isHabitStalled(habit, NOW - 3 * DAY, NOW)).toBe(true);
  });

  it("stalled when never completed but created 3 days ago", () => {
    const oldHabit = makeHabit({ cadence: "daily", createdAt: NOW - 3 * DAY });
    expect(isHabitStalled(oldHabit, null, NOW)).toBe(true);
  });

  it("not stalled when never completed but created yesterday", () => {
    const newHabit = makeHabit({ cadence: "daily", createdAt: NOW - 1 * DAY });
    expect(isHabitStalled(newHabit, null, NOW)).toBe(false);
  });
});

// ── isHabitStalled — weekly cadence ───────────────────────────────────────────

describe("isHabitStalled — weekly", () => {
  const habit = makeHabit({ cadence: "weekly" });

  it("not stalled when completed 5 days ago", () => {
    expect(isHabitStalled(habit, NOW - 5 * DAY, NOW)).toBe(false);
  });

  it("not stalled when completed exactly 9 days ago", () => {
    expect(isHabitStalled(habit, NOW - 9 * DAY, NOW)).toBe(false);
  });

  it("stalled when completed 9 days + 1ms ago", () => {
    expect(isHabitStalled(habit, NOW - 9 * DAY - 1, NOW)).toBe(true);
  });

  it("stalled when completed 14 days ago", () => {
    expect(isHabitStalled(habit, NOW - 14 * DAY, NOW)).toBe(true);
  });

  it("stalled when never completed and created 10 days ago", () => {
    const oldHabit = makeHabit({ cadence: "weekly", createdAt: NOW - 10 * DAY });
    expect(isHabitStalled(oldHabit, null, NOW)).toBe(true);
  });

  it("not stalled when never completed but created 3 days ago", () => {
    const newHabit = makeHabit({ cadence: "weekly", createdAt: NOW - 3 * DAY });
    expect(isHabitStalled(newHabit, null, NOW)).toBe(false);
  });
});

// ── isHabitStalled — monthly cadence ─────────────────────────────────────────

describe("isHabitStalled — monthly", () => {
  const habit = makeHabit({ cadence: "monthly" });

  it("not stalled when completed 20 days ago", () => {
    expect(isHabitStalled(habit, NOW - 20 * DAY, NOW)).toBe(false);
  });

  it("not stalled when completed exactly 38 days ago", () => {
    expect(isHabitStalled(habit, NOW - 38 * DAY, NOW)).toBe(false);
  });

  it("stalled when completed 38 days + 1ms ago", () => {
    expect(isHabitStalled(habit, NOW - 38 * DAY - 1, NOW)).toBe(true);
  });

  it("stalled when completed 60 days ago", () => {
    expect(isHabitStalled(habit, NOW - 60 * DAY, NOW)).toBe(true);
  });

  it("not stalled when never completed but created 10 days ago", () => {
    const newHabit = makeHabit({ cadence: "monthly", createdAt: NOW - 10 * DAY });
    expect(isHabitStalled(newHabit, null, NOW)).toBe(false);
  });

  it("stalled when never completed and created 40 days ago", () => {
    const oldHabit = makeHabit({ cadence: "monthly", createdAt: NOW - 40 * DAY });
    expect(isHabitStalled(oldHabit, null, NOW)).toBe(true);
  });
});

// ── isHabitStalled — uses default nowMs when omitted ─────────────────────────

describe("isHabitStalled — default nowMs", () => {
  it("accepts two-argument form (habit + lastCompletedAt)", () => {
    const habit = makeHabit({ cadence: "daily" });
    // Completed 1 second ago — never stalled regardless of cadence.
    const justNow = Date.now() - 1000;
    expect(isHabitStalled(habit, justNow)).toBe(false);
  });
});
