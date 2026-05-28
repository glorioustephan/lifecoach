import type { Meta, StoryObj } from "@storybook/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { GoalEditSheet } from "~/components/goals/GoalEditSheet";
import type { GoalRow } from "~/lib/api";
import { makeStoryQueryClient } from "./providers";

/**
 * The right-side Sheet that opens when you click a goal card. Three tabs
 * exercised here: Overview (full WOOP/kind/cadence form), Milestones,
 * and Tasks. The Evidence tab is a Phase 2 stub.
 *
 * Milestone + task data is served by mock `/api/...` responses installed via
 * a fetch shim — keeps the story self-contained without booting MSW.
 */

const baseGoal: GoalRow = {
  id: "goal-demo",
  title: "Run a half marathon",
  body: null,
  horizon: "this-quarter",
  status: "active",
  kind: "outcome",
  cadence: null,
  outcome: "Finish a half marathon feeling strong, not gutted.",
  obstacle: "I overtrain in week three and the knee flares.",
  implementationIntention:
    "After I finish my Sunday long run, I will write down how my knee felt in the morning.",
  identityStatement: null,
  successCriteria: null,
  parentGoalId: null,
  projectId: null,
  targetMetric: null,
  targetValue: null,
  currentProgress: null,
  reviewCadence: "weekly",
  lastReviewedAt: null,
  archivedAt: null,
  dueAt: new Date("2026-09-15").getTime(),
  completedAt: null,
  createdAt: Date.now() - 10 * 86_400_000,
  updatedAt: Date.now() - 1 * 86_400_000,
};

const mockMilestones = [
  {
    id: "m-1",
    goalId: baseGoal.id,
    title: "Run a base 5K without stopping",
    body: null,
    status: "done" as const,
    orderIndex: 0,
    dueAt: null,
    completedAt: Date.now() - 30 * 86_400_000,
    origin: "manual" as const,
    confidence: null,
    createdAt: Date.now() - 60 * 86_400_000,
    updatedAt: Date.now() - 30 * 86_400_000,
  },
  {
    id: "m-2",
    goalId: baseGoal.id,
    title: "Complete a 10K race",
    body: null,
    status: "done" as const,
    orderIndex: 1,
    dueAt: null,
    completedAt: Date.now() - 14 * 86_400_000,
    origin: "manual" as const,
    confidence: null,
    createdAt: Date.now() - 45 * 86_400_000,
    updatedAt: Date.now() - 14 * 86_400_000,
  },
  {
    id: "m-3",
    goalId: baseGoal.id,
    title: "Hit a 16-week training plan halfway",
    body: null,
    status: "pending" as const,
    orderIndex: 2,
    dueAt: new Date("2026-07-30").getTime(),
    completedAt: null,
    origin: "manual" as const,
    confidence: null,
    createdAt: Date.now() - 14 * 86_400_000,
    updatedAt: Date.now() - 14 * 86_400_000,
  },
];

const mockTasks = [
  {
    id: "t-1",
    content: "Long run — 14 km easy pace",
    description: null,
    projectName: null,
    labels: [],
    priority: null,
    dueAt: Date.now() + 2 * 86_400_000,
    dueString: "Sunday",
    completedAt: null,
    goalId: baseGoal.id,
    milestoneId: null,
  },
  {
    id: "t-2",
    content: "Strength session — single-leg work for knee stability",
    description: null,
    projectName: null,
    labels: [],
    priority: null,
    dueAt: null,
    dueString: "Tuesday",
    completedAt: null,
    goalId: baseGoal.id,
    milestoneId: null,
  },
];

/**
 * Install a fetch shim only while the story is mounted. Matches the URLs the
 * sheet's React Query hooks call and returns the canned payloads. Restores
 * the original fetch on unmount so other stories aren't affected.
 */
const withMockApi = (Story: () => JSX.Element) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes(`/api/goals/${baseGoal.id}/milestones`)) {
      return new Response(JSON.stringify({ milestones: mockMilestones }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes(`/api/tasks`)) {
      return new Response(JSON.stringify({ tasks: mockTasks, total: mockTasks.length }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes(`/api/goals/${baseGoal.id}`)) {
      // PATCH / archive / unarchive — return the same goal so save UX completes.
      return new Response(JSON.stringify({ goal: baseGoal }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
  return <Story />;
};

const meta = {
  title: "Goals/GoalEditSheet",
  component: GoalEditSheet,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: { goal: baseGoal, onClose: () => {} },
  decorators: [
    (Story) => (
      <QueryClientProvider client={makeStoryQueryClient()}>
        {withMockApi(Story)}
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof GoalEditSheet>;

export default meta;
type Story = StoryObj<typeof GoalEditSheet>;

export const Outcome: Story = {};

export const ProcessGoal: Story = {
  args: {
    goal: {
      ...baseGoal,
      id: "goal-process",
      title: "Morning walk",
      kind: "process",
      cadence: "daily",
      horizon: "open",
      outcome: "Walk for 20 minutes within the first hour of waking, every day.",
      obstacle: "Cold mornings — coat by the door, not the closet.",
      implementationIntention:
        "After I make my morning coffee, I will put my shoes on and walk for 20 minutes.",
      identityStatement: null,
      dueAt: null,
    },
  },
};

export const IdentityGoal: Story = {
  args: {
    goal: {
      ...baseGoal,
      id: "goal-identity",
      title: "Be a present, calm parent",
      kind: "identity",
      horizon: "open",
      outcome: null,
      obstacle: "Reactivity when tired. Lower the threshold to a pause.",
      identityStatement: "I am someone who listens before I respond.",
      implementationIntention:
        "When I notice my voice rising, I will take a single full breath before continuing.",
      reviewCadence: "monthly",
      dueAt: null,
    },
  },
};
