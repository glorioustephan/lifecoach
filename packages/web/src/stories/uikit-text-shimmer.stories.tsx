import type { Meta, StoryObj } from "@storybook/react";
import { TextShimmer } from "~/components/ui/text-shimmer";

const meta = {
  title: "UI Kit/TextShimmer",
  component: TextShimmer,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    duration: { control: { type: "range", min: 1, max: 10 } },
    spread: { control: { type: "range", min: 5, max: 45 } },
    as: { control: "text" },
  },
} satisfies Meta<typeof TextShimmer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: "Thinking…",
    duration: 4,
  },
};

export const Heading: Story = {
  args: {
    as: "h2",
    children: "Analyzing your week",
    duration: 3,
    spread: 25,
  },
  decorators: [
    (Story) => (
      <div className="text-xl font-semibold">
        <Story />
      </div>
    ),
  ],
};

export const Narrow: Story = {
  args: {
    children: "Processing",
    spread: 10,
    duration: 2,
  },
};

export const Wide: Story = {
  args: {
    children: "Generating your personalized plan",
    spread: 40,
    duration: 5,
  },
};
