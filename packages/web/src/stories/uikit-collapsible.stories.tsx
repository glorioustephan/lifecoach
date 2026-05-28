import type { Meta, StoryObj } from "@storybook/react";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "~/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

const meta = {
  title: "UI Kit/Collapsible",
  component: Collapsible,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[400px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Collapsible>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Collapsible className="rounded-lg border border-border bg-surface">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-fg hover:bg-surface-elevated">
        <span>Weekly Review</span>
        <ChevronDown className="size-4 text-fg-muted transition-transform data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border px-4 py-3 text-sm text-fg-muted">
          <ul className="space-y-1">
            <li>Completed 4 of 5 tasks</li>
            <li>Exercise 3 times</li>
            <li>Journaled every day</li>
          </ul>
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
};

export const OpenByDefault: Story = {
  render: () => (
    <Collapsible defaultOpen className="rounded-lg border border-border bg-surface">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-fg hover:bg-surface-elevated">
        <span>Goals Progress</span>
        <ChevronDown className="size-4 text-fg-muted transition-transform data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border px-4 py-3 space-y-2">
          {["Run 5k: 60%", "Read 12 books: 42%", "Save $10k: 75%"].map((item) => (
            <div key={item} className="text-sm text-fg-muted">{item}</div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  ),
};
