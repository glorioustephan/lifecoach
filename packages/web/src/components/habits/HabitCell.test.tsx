/**
 * HabitCell component tests.
 *
 * Tests each of the 6 visual variants for:
 * - Correct aria-label composition
 * - Clickability (only empty-past and today-empty fire onClick)
 * - Check icon presence for done states (ADHD-1: single-glance status)
 * - today-empty carries ring-2 ring-accent (ADHD-7: high contrast)
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HabitCell } from "./HabitCell";
import type { HabitCellVariant } from "./HabitCell";

const DEFAULT_PROPS = {
  habitTitle: "Morning run",
  dateKey: "2026-05-28",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ─── Aria-label shape ────────────────────────────────────────────────────────

describe("aria-label", () => {
  it.each([
    ["done", "completed"],
    ["empty-past", "not logged"],
    ["today-empty", "tap to log"],
    ["today-done", "completed today"],
    ["future", "upcoming"],
    ["disabled", "not due"],
  ] as [HabitCellVariant, string][])(
    "variant '%s' aria-label contains habit title + date + state '%s'",
    (variant, stateLabel) => {
      const { container } = render(
        <HabitCell {...DEFAULT_PROPS} variant={variant} />,
      );
      const btn = container.querySelector("button");
      expect(btn).not.toBeNull();
      const label = btn!.getAttribute("aria-label") ?? "";
      expect(label).toContain("Morning run");
      // Human-readable date ("May 28") — toLocaleDateString in jsdom
      expect(label).toMatch(/May\s*28/);
      expect(label).toContain(stateLabel);
    },
  );
});

// ─── Check icon (ADHD-1: done state uses icon not just color) ─────────────────

describe("ADHD-1: done variants render the Check icon", () => {
  it("variant 'done' renders the Check SVG", () => {
    const { container } = render(
      <HabitCell {...DEFAULT_PROPS} variant="done" />,
    );
    // Check icon is rendered as an SVG aria-hidden inside the button
    const svgs = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it("variant 'today-done' renders the Check SVG", () => {
    const { container } = render(
      <HabitCell {...DEFAULT_PROPS} variant="today-done" />,
    );
    const svgs = container.querySelectorAll('svg[aria-hidden="true"]');
    expect(svgs.length).toBeGreaterThan(0);
  });

  it("variant 'empty-past' does NOT render any SVG", () => {
    const { container } = render(
      <HabitCell {...DEFAULT_PROPS} variant="empty-past" />,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(0);
  });

  it("variant 'future' does NOT render any SVG", () => {
    const { container } = render(
      <HabitCell {...DEFAULT_PROPS} variant="future" />,
    );
    expect(container.querySelectorAll("svg")).toHaveLength(0);
  });
});

// ─── today-empty ring style (ADHD-7: high contrast for today) ────────────────

describe("ADHD-7: today-empty carries accent ring", () => {
  it("inner span has ring-2 ring-accent classes", () => {
    const { container } = render(
      <HabitCell {...DEFAULT_PROPS} variant="today-empty" />,
    );
    const spans = container.querySelectorAll("span");
    const ringSpan = Array.from(spans).find(
      (s) =>
        s.className.includes("ring-2") && s.className.includes("ring-accent"),
    );
    expect(ringSpan).toBeDefined();
  });

  it("variant 'empty-past' does NOT carry accent ring", () => {
    const { container } = render(
      <HabitCell {...DEFAULT_PROPS} variant="empty-past" />,
    );
    const spans = container.querySelectorAll("span");
    const ringSpan = Array.from(spans).find(
      (s) =>
        s.className.includes("ring-2") && s.className.includes("ring-accent"),
    );
    expect(ringSpan).toBeUndefined();
  });
});

// ─── Clickability (ADHD-10: predictable interaction surfaces) ────────────────

describe("ADHD-10: clickability per variant", () => {
  it("variant 'empty-past' fires onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <HabitCell {...DEFAULT_PROPS} variant="empty-past" onClick={onClick} />,
    );
    await user.click(within(container).getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("variant 'today-empty' fires onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <HabitCell {...DEFAULT_PROPS} variant="today-empty" onClick={onClick} />,
    );
    await user.click(within(container).getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("variant 'future' is disabled and does NOT fire onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <HabitCell {...DEFAULT_PROPS} variant="future" onClick={onClick} />,
    );
    const btn = within(container).getByRole("button");
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("variant 'disabled' is disabled and does NOT fire onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <HabitCell {...DEFAULT_PROPS} variant="disabled" onClick={onClick} />,
    );
    const btn = within(container).getByRole("button");
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("variant 'done' does NOT fire onClick even if passed", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <HabitCell {...DEFAULT_PROPS} variant="done" onClick={onClick} />,
    );
    // Not disabled, but onClick is not wired — the component doesn't attach the handler.
    await user.click(within(container).getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("variant 'today-done' does NOT fire onClick even if passed", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <HabitCell {...DEFAULT_PROPS} variant="today-done" onClick={onClick} />,
    );
    await user.click(within(container).getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
