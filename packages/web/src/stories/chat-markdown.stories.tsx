import type { Meta, StoryObj } from "@storybook/react";
import { Markdown } from "~/components/chat/Markdown";

const meta = {
  title: "Chat/Markdown",
  component: Markdown,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[640px] rounded-lg bg-bg p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Markdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Prose: Story = {
  args: {
    children:
      "Based on your recent activity, here are my observations:\n\nYour **sleep consistency** has improved significantly this month. You're averaging 7.3 hours per night, up from 6.8 in January.\n\nHowever, your *exercise frequency* dipped to 3 sessions per week — your goal is 4. This is likely due to the travel week on Feb 12–16.",
  },
};

export const WithCode: Story = {
  args: {
    children:
      "Here's a habit tracking approach in TypeScript:\n\n```typescript\ntype HabitEntry = {\n  date: string;\n  completed: boolean;\n  notes?: string;\n};\n\nconst streak = (entries: HabitEntry[]): number => {\n  let count = 0;\n  for (const e of [...entries].reverse()) {\n    if (!e.completed) break;\n    count++;\n  }\n  return count;\n};\n```\n\nYou can call `streak(yourEntries)` to get the current run.",
  },
};

export const WithList: Story = {
  args: {
    children:
      "## This Week's Priorities\n\n1. **Complete project proposal** — due Friday, 2 hours of focused work needed\n2. **Morning run** — 30 minutes, 3 remaining sessions to hit your weekly goal\n3. **Financial review** — Q1 budget vs actuals, should take ~45 minutes\n\n### Optional:\n- Review and update your goals list\n- Schedule the dentist appointment you've been deferring",
  },
};

export const WithTable: Story = {
  args: {
    children:
      "Here's your habit performance for the past month:\n\n| Habit | Target | Actual | Trend |\n|-------|--------|--------|-------|\n| Exercise | 4×/week | 3.2×/week | ↑ |\n| Sleep | 7.5h | 7.1h | ↑ |\n| Journaling | Daily | 24/28 days | → |\n| Meditation | 10 min | 8 days | ↓ |\n\nOverall you're trending in the right direction on 3 of 4 habits.",
  },
};

export const WithBlockquote: Story = {
  args: {
    children:
      '> "We are what we repeatedly do. Excellence, then, is not an act, but a habit." — Aristotle\n\nThis resonates with your journaling streak. The compounding effect of small daily habits is real — your 21-day streak is generating measurable momentum.',
  },
};
