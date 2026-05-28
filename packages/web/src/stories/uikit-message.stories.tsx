import type { Meta, StoryObj } from "@storybook/react";
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageActions,
  MessageAction,
} from "~/components/ui/message";
import { Button } from "~/components/ui/Button";
import { Copy } from "lucide-react";

const meta = {
  title: "UI Kit/Message",
  component: Message,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[600px] space-y-4 p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Message>;

export default meta;
type Story = StoryObj<typeof  Message>;

export const UserMessage: Story = {
  render: () => (
    <Message className="justify-end">
      <MessageContent className="max-w-[80%] rounded-xl rounded-br-sm">
        Hey, can you help me with my goals for this week?
      </MessageContent>
    </Message>
  ),
};

export const AssistantMessage: Story = {
  render: () => (
    <Message>
      <MessageAvatar src="" alt="Lifecoach" fallback="LC" />
      <MessageContent markdown>
        {"Of course! Let's start by reviewing what you accomplished last week. Here are some suggestions:\n\n1. **Daily exercise** — aim for 30 minutes\n2. **Deep work** — 2 focused sessions per day\n3. **Reflection** — 5 minutes each evening\n\nWhich would you like to tackle first?"}
      </MessageContent>
    </Message>
  ),
};

export const WithActions: Story = {
  render: () => (
    <Message>
      <MessageAvatar src="" alt="Lifecoach" fallback="LC" />
      <div className="flex flex-col gap-1">
        <MessageContent>
          Here is your weekly summary.
        </MessageContent>
        <MessageActions>
          <MessageAction tooltip="Copy to clipboard">
            <Button variant="ghost" size="icon">
              <Copy className="size-4" />
            </Button>
          </MessageAction>
        </MessageActions>
      </div>
    </Message>
  ),
};
