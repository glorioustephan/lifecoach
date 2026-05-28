import type { Meta, StoryObj } from "@storybook/react";
import { Avatar, AvatarImage, AvatarFallback } from "~/components/ui/avatar";

const meta = {
  title: "UI Kit/Avatar",
  component: Avatar,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithFallback: Story = {
  render: () => (
    <Avatar>
      <AvatarImage src="" alt="User" />
      <AvatarFallback>JB</AvatarFallback>
    </Avatar>
  ),
};

export const WithImage: Story = {
  render: () => (
    <Avatar>
      <AvatarImage
        src="https://api.dicebear.com/7.x/avataaars/svg?seed=lifecoach"
        alt="Lifecoach"
      />
      <AvatarFallback>LC</AvatarFallback>
    </Avatar>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {(["size-6", "size-8", "size-10", "size-12", "size-16"] as const).map((size) => (
        <Avatar key={size} className={size}>
          <AvatarFallback className="text-xs">LC</AvatarFallback>
        </Avatar>
      ))}
    </div>
  ),
};
