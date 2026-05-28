import type { Meta, StoryObj } from "@storybook/react";
import { ThinkingBar } from "~/components/ui/thinking-bar";

const meta = {
  title: "UI Kit/ThinkingBar",
  component: ThinkingBar,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  args: {
    isThinking: true,
    children: "Thinking",
  },
  decorators: [
    (Story) => (
      <div className="w-[480px] rounded-lg bg-surface p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ThinkingBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: "Thinking" },
};

export const WithStopAction: Story = {
  args: {
    children: "Analyzing your data",
    onStop: () => alert("Stopped"),
  },
};

export const CustomLabel: Story = {
  args: {
    children: "Generating your weekly plan",
    onStop: () => {},
  },
};
