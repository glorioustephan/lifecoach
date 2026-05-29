/**
 * StreakBadge component tests.
 *
 * Primary concern: ADHD-4 — no-shame streak language.
 * The badge must never say "broke", never show a flame for inactive streaks,
 * and must render null (not a zero-day label) when the habit was never started.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { StreakBadge } from "./StreakBadge";

const TODAY = "2026-05-28";

afterEach(() => {
  cleanup();
});

// ─── Never-logged case ────────────────────────────────────────────────────────

describe("ADHD-4: no-shame — habit never logged", () => {
  it("renders nothing when lastCompletedKey is null", () => {
    const { container } = render(
      <StreakBadge current={0} lastCompletedKey={null} todayKey={TODAY} />,
    );
    // Component returns null — no DOM output expected.
    expect(container.firstChild).toBeNull();
  });

  it("does NOT show 'broke' anywhere in rendered output (null case)", () => {
    const { container } = render(
      <StreakBadge current={0} lastCompletedKey={null} todayKey={TODAY} />,
    );
    expect(container.textContent).not.toMatch(/broke/i);
  });
});

// ─── Streak broken (logged before, not today) ─────────────────────────────────

describe("ADHD-4: no-shame — streak not active (last completed in past)", () => {
  it("shows 'Last:' relative label rather than 'broke'", () => {
    const { container } = render(
      <StreakBadge
        current={0}
        lastCompletedKey="2026-05-25"
        todayKey={TODAY}
      />,
    );
    expect(within(container).getByText(/Last:/)).toBeInTheDocument();
  });

  it("does NOT contain the word 'broke'", () => {
    const { container } = render(
      <StreakBadge
        current={0}
        lastCompletedKey="2026-05-25"
        todayKey={TODAY}
      />,
    );
    // ADHD-4: no shame language
    expect(container.textContent).not.toMatch(/broke/i);
  });

  it("shows the correct relative label for 3 days ago", () => {
    const { container } = render(
      <StreakBadge
        current={0}
        lastCompletedKey="2026-05-25"
        todayKey={TODAY}
      />,
    );
    // 2026-05-28 - 2026-05-25 = 3 days
    expect(within(container).getByText(/3d ago/)).toBeInTheDocument();
  });

  it("does NOT render a fire emoji when streak is not active", () => {
    const { container } = render(
      <StreakBadge
        current={0}
        lastCompletedKey="2026-05-25"
        todayKey={TODAY}
      />,
    );
    expect(container.textContent).not.toContain("🔥");
  });
});

// ─── 1-day streak (logged today only) ────────────────────────────────────────

describe("1-day streak — logged today", () => {
  it("renders 'Today' in the label", () => {
    const { container } = render(
      <StreakBadge current={1} lastCompletedKey={TODAY} todayKey={TODAY} />,
    );
    expect(within(container).getByText(/Today/i)).toBeInTheDocument();
  });

  it("does NOT contain the word 'broke'", () => {
    const { container } = render(
      <StreakBadge current={1} lastCompletedKey={TODAY} todayKey={TODAY} />,
    );
    expect(container.textContent).not.toMatch(/broke/i);
  });

  it("shows the fire emoji for active streak", () => {
    const { container } = render(
      <StreakBadge current={1} lastCompletedKey={TODAY} todayKey={TODAY} />,
    );
    expect(container.textContent).toContain("🔥");
  });
});

// ─── Multi-day active streak ──────────────────────────────────────────────────

describe("ADHD-1: 12-day active streak", () => {
  it("renders the fire emoji and streak count", () => {
    const { container } = render(
      <StreakBadge current={12} lastCompletedKey={TODAY} todayKey={TODAY} />,
    );
    expect(container.textContent).toContain("🔥");
    expect(container.textContent).toContain("12-day");
  });

  it("does NOT contain the word 'broke'", () => {
    const { container } = render(
      <StreakBadge current={12} lastCompletedKey={TODAY} todayKey={TODAY} />,
    );
    expect(container.textContent).not.toMatch(/broke/i);
  });

  it("shows accessible aria-label with streak count", () => {
    const { container } = render(
      <StreakBadge current={12} lastCompletedKey={TODAY} todayKey={TODAY} />,
    );
    const span = container.querySelector("[aria-label]");
    expect(span?.getAttribute("aria-label")).toMatch(/12-day/);
  });
});
