import type { Meta, StoryObj } from "@storybook/react";
import { PlaceholderView } from "~/components/ui/PlaceholderView";

const meta = {
  title: "UI/PlaceholderView",
  component: PlaceholderView,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="flex h-[500px] flex-col bg-bg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PlaceholderView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Goals",
    note: "Set and track long-term goals with AI-powered milestone suggestions.",
  },
};

export const WithSubtitle: Story = {
  args: {
    title: "Tasks",
    subtitle: "Sync with Todoist",
    note: "Manage your tasks and integrate them with your goals and habits.",
  },
};
