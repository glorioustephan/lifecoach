/**
 * MonthNav component tests.
 *
 * Tests navigation button behavior:
 * - Prev fires onChange with correct year/month tuples
 * - Next fires onChange with correct year/month tuples
 * - December → January year wrap
 * - January → December year wrap
 * - Next button is disabled when at the current month
 *
 * Uses fireEvent for click tests to avoid fake-timer / userEvent interaction
 * issues. Fake timers are used only to control MonthNav's internal `new Date()`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { MonthNav } from "./MonthNav";

// Fix "now" to July 2026 so the "current month" guard doesn't interfere
// with any month we're navigating from (which uses Jan–June or December).
const FIXED_NOW = new Date(2026, 6, 1); // July 2026

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

// ─── Prev button ──────────────────────────────────────────────────────────────

describe("prev button", () => {
  it("calls onChange with the previous month", () => {
    const onChange = vi.fn();
    const { container } = render(
      <MonthNav year={2026} month={5} onChange={onChange} />,
    );
    fireEvent.click(
      within(container).getByRole("button", { name: /previous month/i }),
    );
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(2026, 4);
  });

  it("wraps January → December of the previous year", () => {
    const onChange = vi.fn();
    const { container } = render(
      <MonthNav year={2026} month={1} onChange={onChange} />,
    );
    fireEvent.click(
      within(container).getByRole("button", { name: /previous month/i }),
    );
    expect(onChange).toHaveBeenCalledWith(2025, 12);
  });
});

// ─── Next button ──────────────────────────────────────────────────────────────

describe("next button", () => {
  it("calls onChange with the next month", () => {
    const onChange = vi.fn();
    const { container } = render(
      <MonthNav year={2026} month={3} onChange={onChange} />,
    );
    fireEvent.click(
      within(container).getByRole("button", { name: /next month/i }),
    );
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(2026, 4);
  });

  it("wraps December → January of the next year", () => {
    const onChange = vi.fn();
    const { container } = render(
      <MonthNav year={2025} month={12} onChange={onChange} />,
    );
    fireEvent.click(
      within(container).getByRole("button", { name: /next month/i }),
    );
    expect(onChange).toHaveBeenCalledWith(2026, 1);
  });
});

// ─── Current-month guard ──────────────────────────────────────────────────────

describe("next button disabled at current month", () => {
  it("is disabled when year+month equals the current month", () => {
    const onChange = vi.fn();
    const { container } = render(
      // FIXED_NOW = July 2026
      <MonthNav year={2026} month={7} onChange={onChange} />,
    );
    expect(
      within(container).getByRole("button", { name: /next month/i }),
    ).toBeDisabled();
  });

  it("does NOT fire onChange when clicked while disabled", () => {
    const onChange = vi.fn();
    const { container } = render(
      <MonthNav year={2026} month={7} onChange={onChange} />,
    );
    fireEvent.click(
      within(container).getByRole("button", { name: /next month/i }),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("is NOT disabled when one month before the current month", () => {
    const onChange = vi.fn();
    const { container } = render(
      // June 2026 — one month before July 2026
      <MonthNav year={2026} month={6} onChange={onChange} />,
    );
    expect(
      within(container).getByRole("button", { name: /next month/i }),
    ).not.toBeDisabled();
  });
});

// ─── Display text ─────────────────────────────────────────────────────────────

describe("month name display", () => {
  it("shows the month name and year", () => {
    const { container } = render(
      <MonthNav year={2026} month={3} onChange={vi.fn()} />,
    );
    expect(within(container).getByText("March 2026")).toBeInTheDocument();
  });

  it("shows December correctly", () => {
    const { container } = render(
      <MonthNav year={2025} month={12} onChange={vi.fn()} />,
    );
    expect(within(container).getByText("December 2025")).toBeInTheDocument();
  });
});
