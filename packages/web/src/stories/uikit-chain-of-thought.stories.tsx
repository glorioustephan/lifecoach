import type { Meta, StoryObj } from "@storybook/react";
import { Brain } from "lucide-react";
import {
  ChainOfThought,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
  ChainOfThoughtContent,
  ChainOfThoughtItem,
} from "~/components/ui/chain-of-thought";

const meta = {
  title: "UI Kit/ChainOfThought",
  component: ChainOfThought,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[560px] rounded-lg bg-surface p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChainOfThought>;

export default meta;
type Story = StoryObj<typeof  ChainOfThought>;

export const Default: Story = {
  render: () => (
    <ChainOfThought>
      <ChainOfThoughtStep defaultOpen>
        <ChainOfThoughtTrigger>Analyzing your goals</ChainOfThoughtTrigger>
        <ChainOfThoughtContent>
          <ChainOfThoughtItem>
            Looking at your 5 active goals and their current progress levels.
          </ChainOfThoughtItem>
          <ChainOfThoughtItem>
            Identified 2 goals at risk of missing their deadline.
          </ChainOfThoughtItem>
        </ChainOfThoughtContent>
      </ChainOfThoughtStep>
      <ChainOfThoughtStep defaultOpen>
        <ChainOfThoughtTrigger>Checking your calendar</ChainOfThoughtTrigger>
        <ChainOfThoughtContent>
          <ChainOfThoughtItem>
            Found 3 open slots this week that align with your focus times.
          </ChainOfThoughtItem>
        </ChainOfThoughtContent>
      </ChainOfThoughtStep>
      <ChainOfThoughtStep defaultOpen>
        <ChainOfThoughtTrigger>Building your plan</ChainOfThoughtTrigger>
        <ChainOfThoughtContent>
          <ChainOfThoughtItem>
            Prioritized tasks by impact and urgency using your stated values.
          </ChainOfThoughtItem>
        </ChainOfThoughtContent>
      </ChainOfThoughtStep>
    </ChainOfThought>
  ),
};

export const WithCustomIcon: Story = {
  render: () => (
    <ChainOfThought>
      <ChainOfThoughtStep defaultOpen>
        <ChainOfThoughtTrigger leftIcon={<Brain className="size-3.5 text-accent" />}>
          Deep reasoning in progress
        </ChainOfThoughtTrigger>
        <ChainOfThoughtContent>
          <ChainOfThoughtItem>
            Weighing multiple strategies for goal achievement.
          </ChainOfThoughtItem>
          <ChainOfThoughtItem>
            Cross-referencing past patterns from your journal entries.
          </ChainOfThoughtItem>
        </ChainOfThoughtContent>
      </ChainOfThoughtStep>
    </ChainOfThought>
  ),
};

export const Collapsed: Story = {
  render: () => (
    <ChainOfThought>
      <ChainOfThoughtStep>
        <ChainOfThoughtTrigger>Step 1 — click to expand</ChainOfThoughtTrigger>
        <ChainOfThoughtContent>
          <ChainOfThoughtItem>Hidden content revealed on expand.</ChainOfThoughtItem>
        </ChainOfThoughtContent>
      </ChainOfThoughtStep>
      <ChainOfThoughtStep>
        <ChainOfThoughtTrigger>Step 2 — also collapsed</ChainOfThoughtTrigger>
        <ChainOfThoughtContent>
          <ChainOfThoughtItem>More hidden reasoning here.</ChainOfThoughtItem>
        </ChainOfThoughtContent>
      </ChainOfThoughtStep>
    </ChainOfThought>
  ),
};
