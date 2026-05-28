import type { Meta, StoryObj } from "@storybook/react";
import { GoalCard } from "~/components/goals/GoalCard";
import type { GoalRow, MilestoneRow } from "~/lib/api";

/**
 * The list-row representation of a goal. Variants cover the three kinds plus
 * presence/absence of milestones, implementation intention, due date, and the
 * "all milestones done" finished state.
 */

const baseGoal: GoalRow = {
  id: "goal-01",
  title: "Run a half marathon",
  body: null,
  horizon: "this-quarter",
  status: "active",
  kind: "outcome",
  cadence: null,
  outcome: "Finish a half marathon feeling strong, not gutted.",
  obstacle: "I overtrain in week three and the knee flares.",
  implementationIntention: null,
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

const milestone = (idx: number, title: string, done: boolean): MilestoneRow => ({
  id: `m-${idx}`,
  goalId: baseGoal.id,
  title,
  body: null,
  status: done ? "done" : "pending",
  orderIndex: idx,
  dueAt: null,
  completedAt: done ? Date.now() : null,
  origin: "manual",
  confidence: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const meta = {
  title: "Goals/GoalCard",
  component: GoalCard,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: { onOpen: () => {} },
  decorators: [
    (Story) => (
      <ul className="w-[640px] space-y-2 p-4">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof GoalCard>;

export default meta;
type Story = StoryObj<typeof GoalCard>;

export const OutcomeWithMilestones: Story = {
  args: {
    goal: baseGoal,
    milestones: [
      milestone(0, "Run a base 5K without stopping", true),
      milestone(1, "Complete a 10K race", true),
      milestone(2, "Hit a 16-week training plan halfway", false),
      milestone(3, "Run the half", false),
    ],
  },
};

export const ProcessWithCadence: Story = {
  args: {
    goal: {
      ...baseGoal,
      id: "goal-02",
      title: "Morning walk",
      kind: "process",
      cadence: "daily",
      horizon: "open",
      outcome: "Walk for 20 minutes within the first hour of waking, every day.",
      implementationIntention:
        "After I make my morning coffee, I will put my shoes on and walk for 20 minutes.",
      dueAt: null,
    },
    milestones: [],
  },
};

export const IdentityNoDueDate: Story = {
  args: {
    goal: {
      ...baseGoal,
      id: "goal-03",
      title: "Be a present, calm parent",
      kind: "identity",
      horizon: "open",
      outcome: null,
      identityStatement: "I am someone who listens before I respond.",
      implementationIntention:
        "When I notice my voice rising, I will take a single full breath before continuing.",
      dueAt: null,
    },
    milestones: [],
  },
};

export const Finished: Story = {
  args: {
    goal: {
      ...baseGoal,
      id: "goal-04",
      title: "Ship the V1 of the new dashboard",
    },
    milestones: [
      milestone(0, "Design review approved", true),
      milestone(1, "Schema migrations land", true),
      milestone(2, "Edit Sheet shipped", true),
    ],
  },
};

export const NoMilestones: Story = {
  args: {
    goal: {
      ...baseGoal,
      id: "goal-05",
      title: "Sleep before midnight on weeknights",
      kind: "process",
      cadence: "weekly",
      horizon: "open",
      outcome: "Wake up not exhausted by Thursday.",
      dueAt: null,
    },
    milestones: [],
  },
};

export const LegacyGoalWithBodyOnly: Story = {
  args: {
    goal: {
      ...baseGoal,
      id: "goal-06",
      title: "Refinance the mortgage",
      kind: "outcome",
      outcome: null,
      body: "Rates are dropping — worth shopping around if we lock under 6%.",
      implementationIntention: null,
      horizon: "this-month",
      dueAt: null,
    },
    milestones: [],
  },
};
