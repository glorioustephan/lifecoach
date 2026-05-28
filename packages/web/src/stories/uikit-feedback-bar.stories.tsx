import type { Meta, StoryObj } from "@storybook/react";
import { FeedbackBar } from "~/components/ui/feedback-bar";
import { Sparkles } from "lucide-react";

const meta = {
  title: "UI Kit/FeedbackBar",
  component: FeedbackBar,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    title: { control: "text" },
  },
  decorators: [
    (Story) => (
      <div className="w-[480px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FeedbackBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Was this response helpful?",
    onHelpful: () => alert("Helpful"),
    onNotHelpful: () => alert("Not helpful"),
    onClose: () => alert("Closed"),
  },
};

export const WithIcon: Story = {
  args: {
    title: "Did this suggestion work for you?",
    icon: <Sparkles className="size-4 text-accent" />,
    onHelpful: () => {},
    onNotHelpful: () => {},
    onClose: () => {},
  },
};
