import type { Meta, StoryObj } from "@storybook/react";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "~/components/ui/hover-card";

const meta = {
  title: "UI Kit/HoverCard",
  component: HoverCard,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof HoverCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button className="text-sm text-accent underline-offset-2 hover:underline">
          @lifecoach
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-72 rounded-lg bg-surface-elevated p-4 shadow-lg border border-border">
        <div className="space-y-2">
          <p className="text-sm font-medium text-fg">Lifecoach AI</p>
          <p className="text-xs text-fg-muted">
            Your personal AI coach for goals, habits, and wellbeing. Powered by Claude.
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
};

export const GoalPreview: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button className="rounded-md bg-surface-elevated px-2 py-1 text-xs text-fg-muted hover:text-fg">
          Run a 5k
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-64 rounded-lg bg-surface-elevated p-3 shadow-lg border border-border">
        <div className="space-y-2 text-xs">
          <p className="font-medium text-fg">Run a 5k in under 30 minutes</p>
          <div className="flex items-center justify-between text-fg-muted">
            <span>Progress</span>
            <span>65%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface">
            <div className="h-1.5 w-[65%] rounded-full bg-accent" />
          </div>
          <p className="text-fg-faint">Due: March 31, 2024</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
};
