import type { Meta, StoryObj } from "@storybook/react";
import { Image } from "~/components/ui/image";

const meta = {
  title: "UI Kit/Image",
  component: Image,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof Image>;

export default meta;
type Story = StoryObj<typeof  Image>;

export const Loading: Story = {
  args: {
    alt: "Generated visualization",
    className: "w-64 h-40",
  },
};

export const WithBase64: Story = {
  render: () => (
    <Image
      base64="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
      mediaType="image/png"
      alt="1x1 pixel placeholder"
      className="w-32 h-32 rounded-lg"
    />
  ),
};

export const Placeholder: Story = {
  render: () => (
    <div className="w-[400px] space-y-2">
      <Image alt="Chart loading" className="w-full h-48" />
      <p className="text-xs text-fg-faint text-center">Loading image placeholder state</p>
    </div>
  ),
};
