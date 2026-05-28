import type { Meta, StoryObj } from "@storybook/react";
import { Textarea } from "~/components/ui/textarea";

const meta = {
  title: "UI Kit/Textarea",
  component: Textarea,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[400px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    placeholder: "Write your reflection here…",
    rows: 4,
  },
};

export const WithValue: Story = {
  args: {
    value: "Today was productive. I completed my three main tasks and had a great workout session in the morning.",
    rows: 4,
  },
};

export const Disabled: Story = {
  args: {
    placeholder: "Input disabled",
    disabled: true,
    rows: 3,
  },
};
