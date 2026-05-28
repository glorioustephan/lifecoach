import type { Meta, StoryObj } from "@storybook/react";
import { SystemMessage } from "~/components/ui/system-message";

const meta = {
  title: "UI Kit/SystemMessage",
  component: SystemMessage,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["action", "error", "warning"] },
    fill: { control: "boolean" },
    isIconHidden: { control: "boolean" },
  },
  decorators: [
    (Story) => (
      <div className="w-[500px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SystemMessage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Action: Story = {
  args: {
    variant: "action",
    children: "Your data was synced successfully.",
  },
};

export const ActionFilled: Story = {
  args: {
    variant: "action",
    fill: true,
    children: "You have 3 new messages in your inbox.",
  },
};

export const Error: Story = {
  args: {
    variant: "error",
    children: "Something went wrong while processing your request.",
  },
};

export const ErrorFilled: Story = {
  args: {
    variant: "error",
    fill: true,
    children: "Connection lost. Please check your network and try again.",
  },
};

export const Warning: Story = {
  args: {
    variant: "warning",
    children: "Your session will expire in 5 minutes.",
  },
};

export const WarningFilled: Story = {
  args: {
    variant: "warning",
    fill: true,
    children: "Storage is nearly full. Some features may be limited.",
  },
};

export const WithCta: Story = {
  args: {
    variant: "action",
    children: "New features are available.",
    cta: { label: "Update", onClick: () => alert("Update clicked") },
  },
};

export const NoIcon: Story = {
  args: {
    variant: "action",
    isIconHidden: true,
    children: "A quiet notice without an icon.",
  },
};
