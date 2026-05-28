import type { Meta, StoryObj } from "@storybook/react";
import { Card, CardHeader, CardTitle, CardContent } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";

const meta = {
  title: "UI/Card",
  component: Card,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[400px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof  Card>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-fg-muted">
          You completed 4 out of 5 goals this week. Your consistency is improving.
        </p>
      </CardContent>
    </Card>
  ),
};

export const WithAction: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Run a 5k</CardTitle>
          <span className="text-xs text-success-500">On track</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-fg-muted">
            <span>Progress</span>
            <span>65%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface">
            <div className="h-1.5 w-[65%] rounded-full bg-accent" />
          </div>
          <Button variant="secondary" size="sm" className="w-full">
            View details
          </Button>
        </div>
      </CardContent>
    </Card>
  ),
};

export const Plain: Story = {
  render: () => (
    <Card className="p-4">
      <p className="text-sm text-fg">A simple card without sub-components.</p>
    </Card>
  ),
};
