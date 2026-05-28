import type { Meta, StoryObj } from "@storybook/react";
import { Source, SourceTrigger, SourceContent } from "~/components/ui/source";

const meta = {
  title: "UI Kit/Source",
  component: Source,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  // Source requires href + children; the stories supply their own composition
  // via `render`, so provide meta-level defaults to satisfy the prop types.
  args: { href: "https://example.com", children: null },
} satisfies Meta<typeof Source>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Source href="https://www.nytimes.com/2024/01/15/health/sleep-habits-productivity">
      <SourceTrigger label={1} />
      <SourceContent
        title="How Sleep Habits Shape Productivity"
        description="New research shows consistent sleep schedules can improve cognitive performance by up to 20%."
      />
    </Source>
  ),
};

export const WithFavicon: Story = {
  render: () => (
    <Source href="https://github.com/anthropics/anthropic-sdk-python">
      <SourceTrigger showFavicon />
      <SourceContent
        title="Anthropic SDK for Python"
        description="The official Python library for the Anthropic API, providing access to Claude models."
      />
    </Source>
  ),
};

export const MultipleSources: Story = {
  render: () => (
    <div className="flex items-center gap-2 text-sm text-fg">
      Based on recent studies
      <Source href="https://www.ncbi.nlm.nih.gov/sleep-research">
        <SourceTrigger label={1} />
        <SourceContent
          title="Sleep Research Study 2024"
          description="A comprehensive study on sleep quality and its effects on daily performance."
        />
      </Source>
      <Source href="https://www.health.harvard.edu/exercise-benefits">
        <SourceTrigger label={2} />
        <SourceContent
          title="Exercise and Mental Health"
          description="Harvard Health article on the cognitive benefits of regular exercise."
        />
      </Source>
    </div>
  ),
};
