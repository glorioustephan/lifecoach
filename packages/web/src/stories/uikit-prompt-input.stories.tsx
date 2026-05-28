import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { ArrowUp, Paperclip } from "lucide-react";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
} from "~/components/ui/prompt-input";

const meta = {
  title: "UI Kit/PromptInput",
  component: PromptInput,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PromptInput>;

export default meta;
type Story = StoryObj<typeof  PromptInput>;

export const Default: Story = {
  render: () => {
    const [value, setValue] = useState("");
    return (
      <PromptInput value={value} onValueChange={setValue}>
        <PromptInputTextarea placeholder="Message your coach…" />
        <PromptInputActions>
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-fg"
          >
            <ArrowUp className="size-4" />
          </button>
        </PromptInputActions>
      </PromptInput>
    );
  },
};

export const WithAttachButton: Story = {
  render: () => {
    const [value, setValue] = useState("");
    return (
      <PromptInput
        value={value}
        onValueChange={setValue}
        className="flex items-end gap-2 rounded-lg border border-border bg-surface px-3 py-2"
      >
        <PromptInputActions className="mb-0.5 self-end">
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-md text-fg-faint hover:bg-surface-elevated"
          >
            <Paperclip className="size-4" />
          </button>
        </PromptInputActions>
        <PromptInputTextarea
          placeholder="Message your coach…"
          className="flex-1 text-sm"
        />
        <PromptInputActions className="mb-0.5 self-end">
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-fg"
          >
            <ArrowUp className="size-4" />
          </button>
        </PromptInputActions>
      </PromptInput>
    );
  },
};

export const Loading: Story = {
  render: () => (
    <PromptInput isLoading value="Waiting for response…">
      <PromptInputTextarea placeholder="Message your coach…" />
      <PromptInputActions>
        <div className="flex size-9 items-center justify-center rounded-md bg-surface-elevated">
          <span className="size-3 animate-pulse rounded-full bg-fg-faint" />
        </div>
      </PromptInputActions>
    </PromptInput>
  ),
};

export const Disabled: Story = {
  render: () => (
    <PromptInput disabled>
      <PromptInputTextarea placeholder="Message your coach…" />
    </PromptInput>
  ),
};
