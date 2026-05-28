import type { Meta, StoryObj } from "@storybook/react";
import { PromptSuggestion } from "~/components/ui/prompt-suggestion";

const meta = {
  title: "UI Kit/PromptSuggestion",
  component: PromptSuggestion,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof PromptSuggestion>;

export default meta;
type Story = StoryObj<typeof  PromptSuggestion>;

export const Default: Story = {
  args: {
    children: "How am I doing on my goals?",
    onClick: () => {},
  },
};

export const WithHighlight: Story = {
  args: {
    children: "What are my top goals this week?",
    highlight: "goals",
    onClick: () => {},
  },
};

export const Group: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {[
        "How am I doing?",
        "What should I focus on today?",
        "Show my weekly summary",
        "Review my goals",
      ].map((suggestion) => (
        <PromptSuggestion key={suggestion} onClick={() => {}}>
          {suggestion}
        </PromptSuggestion>
      ))}
    </div>
  ),
};

export const HighlightList: Story = {
  render: () => (
    <div className="w-[400px] space-y-1 rounded-lg bg-surface p-2">
      {[
        "What are my goals this week?",
        "Show me goals I'm behind on",
        "Help me create a new goal",
      ].map((suggestion) => (
        <PromptSuggestion key={suggestion} highlight="goal" onClick={() => {}}>
          {suggestion}
        </PromptSuggestion>
      ))}
    </div>
  ),
};
