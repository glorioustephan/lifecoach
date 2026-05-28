import type { Meta, StoryObj } from "@storybook/react";
import { IconButton } from "~/components/ui/IconButton";
import { Trash2, Check, Copy, X, Settings } from "lucide-react";

const meta = {
  title: "UI/IconButton",
  component: IconButton,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["default", "destructive", "success"] },
    size: { control: "select", options: ["sm", "md", "lg"] },
    disabled: { control: "boolean" },
  },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof  IconButton>;

export const Default: Story = {
  args: {
    children: <Settings className="size-4" />,
    "aria-label": "Settings",
  },
};

export const Destructive: Story = {
  args: {
    variant: "destructive",
    children: <Trash2 className="size-4" />,
    "aria-label": "Delete",
  },
};

export const Success: Story = {
  args: {
    variant: "success",
    children: <Check className="size-4" />,
    "aria-label": "Confirm",
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <IconButton size="sm" aria-label="Small copy">
        <Copy className="size-3.5" />
      </IconButton>
      <IconButton size="md" aria-label="Medium copy">
        <Copy className="size-4" />
      </IconButton>
      <IconButton size="lg" aria-label="Large copy">
        <Copy className="size-5" />
      </IconButton>
    </div>
  ),
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <IconButton variant="default" aria-label="Settings">
        <Settings className="size-4" />
      </IconButton>
      <IconButton variant="destructive" aria-label="Delete">
        <Trash2 className="size-4" />
      </IconButton>
      <IconButton variant="success" aria-label="Confirm">
        <Check className="size-4" />
      </IconButton>
      <IconButton disabled aria-label="Close">
        <X className="size-4" />
      </IconButton>
    </div>
  ),
};
