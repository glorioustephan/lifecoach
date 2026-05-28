import type { Meta, StoryObj } from "@storybook/react";
import { Loader } from "~/components/ui/loader";

const meta = {
  title: "UI Kit/Loader",
  component: Loader,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "circular",
        "classic",
        "pulse",
        "pulse-dot",
        "dots",
        "typing",
        "wave",
        "bars",
        "terminal",
        "text-blink",
        "text-shimmer",
        "loading-dots",
      ],
    },
    size: { control: "select", options: ["sm", "md", "lg"] },
    text: { control: "text" },
  },
} satisfies Meta<typeof Loader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Circular: Story = { args: { variant: "circular" } };
export const Classic: Story = { args: { variant: "classic" } };
export const Pulse: Story = { args: { variant: "pulse" } };
export const PulseDot: Story = { args: { variant: "pulse-dot" } };
export const Dots: Story = { args: { variant: "dots" } };
export const Typing: Story = { args: { variant: "typing" } };
export const Wave: Story = { args: { variant: "wave" } };
export const Bars: Story = { args: { variant: "bars" } };
export const Terminal: Story = { args: { variant: "terminal" } };
export const TextBlink: Story = { args: { variant: "text-blink", text: "Thinking" } };
export const TextShimmer: Story = { args: { variant: "text-shimmer", text: "Processing" } };
export const LoadingDots: Story = { args: { variant: "loading-dots", text: "Loading" } };

export const AllVariants: Story = {
  render: () => (
    <div className="grid grid-cols-4 gap-8 p-4">
      {(
        [
          "circular",
          "classic",
          "pulse",
          "pulse-dot",
          "dots",
          "typing",
          "wave",
          "bars",
          "terminal",
          "text-blink",
          "text-shimmer",
          "loading-dots",
        ] as const
      ).map((v) => (
        <div key={v} className="flex flex-col items-center gap-2">
          <Loader variant={v} text="Loading" />
          <span className="text-fg-faint text-xs">{v}</span>
        </div>
      ))}
    </div>
  ),
};
