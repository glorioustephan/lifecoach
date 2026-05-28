import type { Meta, StoryObj } from "@storybook/react";
import { EmptyState } from "~/components/ui/EmptyState";
import { Brain, FileStack, Target, MessageCircle } from "lucide-react";

const meta = {
  title: "UI/EmptyState",
  component: EmptyState,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[480px] rounded-lg bg-bg p-8">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: <Target className="size-10" />,
    title: "No goals yet",
    body: "Set your first goal to start tracking your progress and building momentum.",
    action: {
      label: "Create your first goal",
      onClick: () => {},
    },
  },
};

export const Memory: Story = {
  args: {
    icon: <Brain className="size-10" />,
    title: "Your memory is empty",
    body: "As you chat, Lifecoach builds a memory of your preferences, patterns, and goals.",
  },
};

export const Artifacts: Story = {
  args: {
    icon: <FileStack className="size-10" />,
    title: "No artifacts saved",
    body: "Save meal plans, workout routines, and reflections from your conversations.",
    action: {
      label: "Start a conversation",
      onClick: () => {},
    },
  },
};

export const Chat: Story = {
  args: {
    icon: <MessageCircle className="size-10" />,
    title: "Start your first session",
    body: "Ask Lifecoach anything about your goals, habits, health, or daily priorities.",
  },
};
