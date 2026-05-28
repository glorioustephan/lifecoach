import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { Button } from "~/components/ui/Button";

const meta = {
  title: "UI/ConfirmDialog",
  component: ConfirmDialog,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof  ConfirmDialog>;

export const Destructive: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete goal
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Delete this goal?"
          body="This will permanently remove 'Run a 5k' and all associated milestones. This action cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="destructive"
          onCancel={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        />
      </>
    );
  },
};

export const Primary: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Archive session
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Archive this session?"
          body="The conversation will be saved to your history and can be retrieved later. Your memory entries from this session will be preserved."
          confirmLabel="Archive"
          cancelLabel="Keep open"
          variant="primary"
          onCancel={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        />
      </>
    );
  },
};

export const Loading: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Trigger loading state
        </Button>
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Syncing data"
          body="Processing your request..."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="destructive"
          onCancel={() => setOpen(false)}
          onConfirm={() => {}}
          isPending
        />
      </>
    );
  },
};
