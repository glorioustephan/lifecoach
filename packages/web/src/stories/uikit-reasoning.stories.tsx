import type { Meta, StoryObj } from "@storybook/react";
import { Reasoning, ReasoningTrigger, ReasoningContent } from "~/components/ui/reasoning";

const meta = {
  title: "UI Kit/Reasoning",
  component: Reasoning,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[560px] rounded-lg bg-surface p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Reasoning>;

export default meta;
type Story = StoryObj<typeof  Reasoning>;

export const Default: Story = {
  render: () => (
    <Reasoning>
      <ReasoningTrigger className="text-sm">View reasoning</ReasoningTrigger>
      <ReasoningContent>
        <p className="text-sm">
          I analyzed your goals and found that your exercise habit has the highest
          potential for compounding benefits. By scheduling it in the morning, you
          can leverage your natural energy peak and establish a consistent anchor
          for the rest of your day.
        </p>
      </ReasoningContent>
    </Reasoning>
  ),
};

export const OpenByDefault: Story = {
  render: () => (
    <Reasoning open>
      <ReasoningTrigger className="text-sm">Reasoning (open)</ReasoningTrigger>
      <ReasoningContent>
        <p className="text-sm text-fg-muted">
          The financial data shows your discretionary spending increased by 18% last
          month. The primary driver was dining out (+$340) and entertainment (+$120).
          Based on your stated goal of saving for a house, I recommend reducing these
          by 25% to stay on track.
        </p>
      </ReasoningContent>
    </Reasoning>
  ),
};

export const WithMarkdown: Story = {
  render: () => (
    <Reasoning>
      <ReasoningTrigger className="text-sm">Detailed analysis</ReasoningTrigger>
      <ReasoningContent markdown>
        {"## Key Findings\n\n- Sleep quality correlates with productivity at **0.73 correlation**\n- Best focus window: 9–11 AM based on your patterns\n- Goal completion rate this month: 68%"}
      </ReasoningContent>
    </Reasoning>
  ),
};

export const Streaming: Story = {
  render: () => (
    <Reasoning isStreaming>
      <ReasoningTrigger className="text-sm">Auto-opened while streaming</ReasoningTrigger>
      <ReasoningContent>
        <p className="text-sm text-fg-muted">
          Thinking through your request... examining context from the past 7 days...
        </p>
      </ReasoningContent>
    </Reasoning>
  ),
};
