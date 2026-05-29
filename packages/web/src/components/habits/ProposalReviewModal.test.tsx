/**
 * ProposalReviewModal component tests — structural / happy-path coverage.
 *
 * Skips full interaction flows (bulk-create mutation) to stay focused on
 * DOM structure and ADHD-2 (progressive disclosure for the goal grouping section).
 *
 * All API calls are mocked so no network requests happen.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProposalReviewModal } from "./ProposalReviewModal";
import type { HabitCandidate, TaskCandidate } from "./ProposalReviewModal";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("~/lib/api", () => ({
  api: {
    goals: vi.fn().mockResolvedValue({ goals: [] }),
    proposeBulk: vi.fn().mockResolvedValue({ habits: [], tasks: [] }),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("~/lib/use-toast", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderModal(
  props: Partial<Parameters<typeof ProposalReviewModal>[0]> = {},
) {
  const qc = makeQueryClient();
  const defaults = {
    open: true,
    onClose: vi.fn(),
    candidates: [] as Array<HabitCandidate | TaskCandidate>,
  };
  return render(
    <QueryClientProvider client={qc}>
      <ProposalReviewModal {...defaults} {...props} />
    </QueryClientProvider>,
  );
}

const HABIT_CANDIDATES: HabitCandidate[] = [
  { type: "habit", title: "Morning meditation", cadence: "daily" },
  { type: "habit", title: "Evening walk", cadence: "daily" },
  {
    type: "habit",
    title: "Weekly review",
    cadence: "weekly",
    rationale: "Helps with planning",
  },
];

const TASK_CANDIDATE: TaskCandidate = {
  type: "task",
  title: "Set up habit tracking",
  dueAt: "2026-06-01",
};

// ─── Closed modal ─────────────────────────────────────────────────────────────

describe("closed modal", () => {
  it("renders no dialog content when open=false", () => {
    renderModal({ open: false, candidates: HABIT_CANDIDATES });
    // Radix Dialog.Content is not mounted when open=false.
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

// ─── Open modal ───────────────────────────────────────────────────────────────

describe("open modal with candidates", () => {
  it("renders the dialog when open=true", () => {
    renderModal({ candidates: HABIT_CANDIDATES });
    // Radix Dialog renders into a portal in document.body
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows 4 candidate cards for 3 habits + 1 task", () => {
    const allCandidates: Array<HabitCandidate | TaskCandidate> = [
      ...HABIT_CANDIDATES,
      TASK_CANDIDATE,
    ];
    renderModal({ candidates: allCandidates });
    // Each candidate card has a checkbox "Include <title>"
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(4);
  });

  it("all candidate checkboxes are checked by default (ADHD-10: default to action)", () => {
    renderModal({ candidates: HABIT_CANDIDATES });
    const dialog = screen.getByRole("dialog");
    const checkboxes = within(dialog).getAllByRole(
      "checkbox",
    ) as HTMLInputElement[];
    expect(checkboxes.every((cb) => cb.checked)).toBe(true);
  });

  it("renders candidate titles as text", () => {
    renderModal({ candidates: HABIT_CANDIDATES });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Morning meditation")).toBeInTheDocument();
    expect(within(dialog).getByText("Evening walk")).toBeInTheDocument();
    expect(within(dialog).getByText("Weekly review")).toBeInTheDocument();
  });

  it("does not crash with an empty candidates array", () => {
    expect(() => renderModal({ candidates: [] })).not.toThrow();
  });
});

// ─── parentGoalSuggestion disclosure (ADHD-2: progressive disclosure) ─────────

describe("ADHD-2: parentGoalSuggestion disclosure", () => {
  it("renders the 'Group under a goal?' disclosure trigger when suggestion is provided", () => {
    renderModal({
      candidates: HABIT_CANDIDATES,
      parentGoalSuggestion: {
        title: "Build consistent morning routine",
        kind: "process",
        rationale: "Sets the tone for the day",
      },
    });
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/Group these under a goal\?/i),
    ).toBeInTheDocument();
  });

  it("disclosure is present even without a parentGoalSuggestion", () => {
    // The modal always shows the "Group under a goal?" collapsible trigger.
    renderModal({ candidates: HABIT_CANDIDATES });
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/Group these under a goal\?/i),
    ).toBeInTheDocument();
  });
});
