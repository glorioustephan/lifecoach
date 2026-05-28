import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Sheet, SheetHeader, SheetBody, SheetDescription } from "~/components/ui/Sheet";
import { Button } from "~/components/ui/Button";

const meta = {
  title: "UI/Sheet",
  component: Sheet,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof  Sheet>;

export const Left: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Open left sheet
        </Button>
        <Sheet open={open} onOpenChange={setOpen} side="left" width="w-full md:w-80">
          <SheetHeader title="Navigation" onClose={() => setOpen(false)} />
          <SheetDescription className="sr-only">Navigation sheet</SheetDescription>
          <SheetBody>
            <div className="p-4 space-y-2">
              {["Chat", "Inbox", "Goals", "Memory", "Settings"].map((item) => (
                <div
                  key={item}
                  className="rounded-md px-3 py-2 text-sm text-fg-muted hover:bg-surface-elevated hover:text-fg cursor-pointer"
                >
                  {item}
                </div>
              ))}
            </div>
          </SheetBody>
        </Sheet>
      </>
    );
  },
};

export const Right: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Open right sheet
        </Button>
        <Sheet open={open} onOpenChange={setOpen} side="right" width="w-full md:w-96">
          <SheetHeader title="Session History" onClose={() => setOpen(false)} />
          <SheetDescription className="sr-only">Session history</SheetDescription>
          <SheetBody>
            <div className="divide-y divide-border">
              {[
                "Morning planning — 9:15 AM",
                "Goal review — Yesterday",
                "Weekly reflection — 3 days ago",
                "Habit check-in — 5 days ago",
              ].map((session) => (
                <div key={session} className="px-4 py-3 text-sm text-fg-muted hover:bg-surface-elevated cursor-pointer">
                  {session}
                </div>
              ))}
            </div>
          </SheetBody>
        </Sheet>
      </>
    );
  },
};

export const Bottom: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Open bottom sheet
        </Button>
        <Sheet open={open} onOpenChange={setOpen} side="bottom">
          <SheetHeader title="Upload Document" onClose={() => setOpen(false)} />
          <SheetDescription className="sr-only">Upload a document</SheetDescription>
          <SheetBody>
            <div className="flex flex-col items-center gap-4 p-8">
              <div className="flex h-24 w-full max-w-sm items-center justify-center rounded-lg border border-dashed border-border text-sm text-fg-faint">
                Drop a PDF, CSV, or Markdown file here
              </div>
              <Button variant="primary" size="sm">
                Choose file
              </Button>
            </div>
          </SheetBody>
        </Sheet>
      </>
    );
  },
};
