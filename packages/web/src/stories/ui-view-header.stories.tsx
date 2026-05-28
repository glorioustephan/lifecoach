import type { Meta, StoryObj } from "@storybook/react";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { Button } from "~/components/ui/Button";
import { Plus } from "lucide-react";

const meta = {
  title: "UI/ViewHeader",
  component: ViewHeader,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof ViewHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Goals",
  },
};

export const WithSubtitle: Story = {
  args: {
    title: "Memory",
    subtitle: "47 entries across 6 categories",
  },
};

export const WithAction: Story = {
  args: {
    title: "Artifacts",
    subtitle: "12 saved",
    actions: (
      <Button variant="primary" size="sm">
        <Plus className="size-4" />
        New artifact
      </Button>
    ),
  },
};

export const Wide: Story = {
  args: {
    title: "Financial Overview",
    subtitle: "Q1 2024 summary",
    width: "wide",
    actions: (
      <Button variant="secondary" size="sm">Export</Button>
    ),
  },
};
