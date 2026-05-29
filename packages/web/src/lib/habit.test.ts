/**
 * Unit tests for pure helper utilities in lib/habit.ts.
 * No DOM, no React — fast and deterministic.
 */
import { describe, expect, it } from "vitest";
import { dateKey, monthDays, computeStreak, isCadenceDueOn } from "./habit";

// ─── dateKey ─────────────────────────────────────────────────────────────────

describe("dateKey", () => {
  it("formats a date as YYYY-MM-DD using local timezone", () => {
    // A well-known date with no edge-case offset.
    const d = new Date(2026, 0, 5); // Jan 5 2026 local time
    expect(dateKey(d)).toBe("2026-01-05");
  });

  it("pads month and day with leading zeros", () => {
    const d = new Date(2026, 2, 3); // Mar 3
    expect(dateKey(d)).toBe("2026-03-03");
  });

  it("returns local-TZ date even at 23:30 close to midnight", () => {
    // Fixed to 2026-05-28 at 23:30 local time.
    // Using the local Date constructor ensures we stay in local TZ.
    const d = new Date(2026, 4, 28, 23, 30); // May 28 2026 23:30 local
    expect(dateKey(d)).toBe("2026-05-28");
  });

  it("handles December correctly", () => {
    const d = new Date(2025, 11, 31); // Dec 31 2025
    expect(dateKey(d)).toBe("2025-12-31");
  });
});

// ─── monthDays ────────────────────────────────────────────────────────────────

describe("monthDays", () => {
  // May 2026: May 1 is Friday (getDay()=5), May 31 is Sunday (getDay()=0).

  describe("May 2026 with firstDayOfWeek=1 (Monday)", () => {
    // Leading padding: (5 - 1 + 7) % 7 = 4 cells from April.
    // Total: 4 + 31 = 35 — no trailing needed (35 % 7 === 0).
    const cells = monthDays(2026, 5, 1);

    it("returns 35 cells (5 complete weeks)", () => {
      expect(cells).toHaveLength(35);
    });

    it("first cell is a date in late April (padding)", () => {
      const first = cells[0]!;
      expect(first.getMonth()).toBe(3); // April = 3
      expect(first.getDate()).toBe(27); // April 27 (Mon of that week)
    });

    it("last cell is May 31", () => {
      const last = cells[34]!;
      expect(last.getMonth()).toBe(4); // May = 4
      expect(last.getDate()).toBe(31);
    });

    it("every cell is 1 day after the previous cell", () => {
      for (let i = 1; i < cells.length; i++) {
        const diffMs = cells[i]!.getTime() - cells[i - 1]!.getTime();
        expect(diffMs).toBe(24 * 60 * 60 * 1000);
      }
    });
  });

  describe("May 2026 with firstDayOfWeek=0 (Sunday)", () => {
    // Leading padding: (5 - 0 + 7) % 7 = 5 cells from April.
    // Total: 5 + 31 = 36, trailing = (7 - 36 % 7) % 7 = 6 → 42 cells total.
    const cells = monthDays(2026, 5, 0);

    it("returns 42 cells (6 complete weeks)", () => {
      expect(cells).toHaveLength(42);
    });

    it("first cell is a date in April (Sunday padding)", () => {
      const first = cells[0]!;
      expect(first.getMonth()).toBe(3); // April
      expect(first.getDate()).toBe(26); // April 26 (Sun of that week)
    });

    it("last cell is in June (trailing padding)", () => {
      const last = cells[41]!;
      expect(last.getMonth()).toBe(5); // June = 5
    });
  });

  describe("edge cases", () => {
    it("always returns a multiple of 7", () => {
      // Test several months
      for (const [y, m] of [
        [2026, 1],
        [2026, 2],
        [2026, 12],
        [2024, 2], // leap year Feb
      ] as const) {
        expect(monthDays(y, m, 1).length % 7).toBe(0);
        expect(monthDays(y, m, 0).length % 7).toBe(0);
      }
    });
  });
});

// ─── computeStreak ────────────────────────────────────────────────────────────

describe("computeStreak", () => {
  const TODAY = "2026-05-28";

  it("returns zeros and null for empty completions", () => {
    const result = computeStreak(new Map(), TODAY);
    expect(result).toEqual({ current: 0, longest: 0, lastCompletedKey: null });
  });

  it("returns current=1, longest=1 when only today is logged", () => {
    const m = new Map([["2026-05-28", 1]]);
    const result = computeStreak(m, TODAY);
    expect(result.current).toBe(1);
    expect(result.longest).toBe(1);
    expect(result.lastCompletedKey).toBe("2026-05-28");
  });

  it("returns current=5, longest=5 for 5 consecutive days ending today", () => {
    const m = new Map([
      ["2026-05-24", 1],
      ["2026-05-25", 1],
      ["2026-05-26", 1],
      ["2026-05-27", 1],
      ["2026-05-28", 1],
    ]);
    const result = computeStreak(m, TODAY);
    expect(result.current).toBe(5);
    expect(result.longest).toBe(5);
  });

  it("returns current=0 when streak is broken (no entry for today)", () => {
    // Logged 3 days ago through 1 day ago — today missing.
    const m = new Map([
      ["2026-05-25", 1],
      ["2026-05-26", 1],
      ["2026-05-27", 1],
    ]);
    const result = computeStreak(m, TODAY);
    expect(result.current).toBe(0);
    expect(result.longest).toBe(3);
  });

  it("tracks longest > current when a past streak is longer", () => {
    // 10-day streak last month, then a gap, then 3-day streak this week.
    const longStreak = Array.from({ length: 10 }, (_, i) => {
      const d = new Date(2026, 3, 10 + i); // April 10-19
      return [dateKey(d), 1] as [string, number];
    });
    const shortStreak = [
      ["2026-05-26", 1] as [string, number],
      ["2026-05-27", 1] as [string, number],
      ["2026-05-28", 1] as [string, number],
    ];
    const m = new Map([...longStreak, ...shortStreak]);
    const result = computeStreak(m, TODAY);
    expect(result.longest).toBe(10);
    expect(result.current).toBe(3);
  });

  it("ignores entries with count=0", () => {
    const m = new Map([
      ["2026-05-27", 0], // zero count — should not count
      ["2026-05-28", 1],
    ]);
    const result = computeStreak(m, TODAY);
    // Today counts but yesterday had 0 — current streak should be 1 not 2.
    expect(result.current).toBe(1);
  });
});

// ─── isCadenceDueOn ───────────────────────────────────────────────────────────

describe("isCadenceDueOn", () => {
  // May 4 2026 = Monday; May 5 = Tuesday; May 1 = Friday; June 1 = Monday.
  const MON = new Date(2026, 4, 4); // Monday
  const TUE = new Date(2026, 4, 5); // Tuesday
  const FRI = new Date(2026, 4, 1); // Friday (the 1st)
  const JUNE_1 = new Date(2026, 5, 1); // Monday June 1 (first of month)

  describe("daily cadence", () => {
    it("is always true regardless of day", () => {
      expect(isCadenceDueOn("daily", MON)).toBe(true);
      expect(isCadenceDueOn("daily", TUE)).toBe(true);
      expect(isCadenceDueOn("daily", FRI)).toBe(true);
    });
  });

  describe("weekly cadence", () => {
    it("is true on Monday only", () => {
      expect(isCadenceDueOn("weekly", MON)).toBe(true);
    });

    it("is false on non-Monday days", () => {
      expect(isCadenceDueOn("weekly", TUE)).toBe(false);
      expect(isCadenceDueOn("weekly", FRI)).toBe(false);
    });
  });

  describe("monthly cadence", () => {
    it("is true on the 1st of the month", () => {
      expect(isCadenceDueOn("monthly", FRI)).toBe(true); // May 1
      expect(isCadenceDueOn("monthly", JUNE_1)).toBe(true);
    });

    it("is false on any other date", () => {
      expect(isCadenceDueOn("monthly", MON)).toBe(false); // May 4
      expect(isCadenceDueOn("monthly", TUE)).toBe(false); // May 5
    });
  });
});
