import type { Meta, StoryObj } from "@storybook/react";
import {
  Steps,
  StepsTrigger,
  StepsContent,
  StepsItem,
  StepsBar,
} from "~/components/ui/steps";
import { CheckCircle2, Circle } from "lucide-react";

const meta = {
  title: "UI Kit/Steps",
  component: Steps,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[500px] rounded-lg bg-surface p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Steps>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Steps defaultOpen>
      <StepsTrigger leftIcon={<CheckCircle2 className="size-4 text-accent" />}>
        Planning your week (3 steps)
      </StepsTrigger>
      <StepsContent>
        <StepsItem>Reviewed your goals and current progress.</StepsItem>
        <StepsItem>Identified your top 3 priorities.</StepsItem>
        <StepsItem>Scheduled focused work blocks on your calendar.</StepsItem>
      </StepsContent>
    </Steps>
  ),
};

export const Collapsed: Story = {
  render: () => (
    <Steps defaultOpen={false}>
      <StepsTrigger leftIcon={<Circle className="size-4 text-fg-faint" />}>
        Analyzing habits (click to expand)
      </StepsTrigger>
      <StepsContent>
        <StepsItem>Collected 30 days of activity data.</StepsItem>
        <StepsItem>Found consistent patterns in your productive hours.</StepsItem>
      </StepsContent>
    </Steps>
  ),
};

export const WithCustomBar: Story = {
  render: () => (
    <Steps defaultOpen>
      <StepsTrigger>Processing data</StepsTrigger>
      <StepsContent bar={<StepsBar className="bg-accent/40" />}>
        <StepsItem>Fetched financial transactions for the month.</StepsItem>
        <StepsItem>Categorized expenses into 8 groups.</StepsItem>
        <StepsItem>Compared against your budget targets.</StepsItem>
      </StepsContent>
    </Steps>
  ),
};
