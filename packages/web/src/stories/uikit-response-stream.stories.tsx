import type { Meta, StoryObj } from "@storybook/react";
import { ResponseStream } from "~/components/ui/response-stream";

const SAMPLE_TEXT =
  "Based on your recent activity, I've identified three key areas for improvement. First, your sleep consistency has been variable — you're getting 7 hours on average but the timing fluctuates by up to 90 minutes. Second, your exercise sessions are strong but you tend to skip Wednesdays. Third, your journaling habit has been consistent for 21 days straight — great work!";

const meta = {
  title: "UI Kit/ResponseStream",
  component: ResponseStream,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[600px] rounded-lg bg-surface p-6 text-sm leading-relaxed text-fg">
        <Story />
      </div>
    ),
  ],
  argTypes: {
    mode: { control: "select", options: ["typewriter", "fade"] },
    speed: { control: { type: "range", min: 1, max: 100 } },
  },
} satisfies Meta<typeof ResponseStream>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Typewriter: Story = {
  args: {
    textStream: SAMPLE_TEXT,
    mode: "typewriter",
    speed: 40,
  },
};

export const Fade: Story = {
  args: {
    textStream: SAMPLE_TEXT,
    mode: "fade",
    speed: 30,
  },
};

export const Fast: Story = {
  args: {
    textStream: SAMPLE_TEXT,
    mode: "typewriter",
    speed: 90,
  },
};

export const Slow: Story = {
  args: {
    textStream: SAMPLE_TEXT,
    mode: "typewriter",
    speed: 8,
  },
};
