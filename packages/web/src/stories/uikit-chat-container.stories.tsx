import type { Meta, StoryObj } from "@storybook/react";
import {
  ChatContainerRoot,
  ChatContainerContent,
  ChatContainerScrollAnchor,
} from "~/components/ui/chat-container";

const meta = {
  title: "UI Kit/ChatContainer",
  component: ChatContainerRoot,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="h-[400px] w-[600px] rounded-lg border border-border bg-bg overflow-hidden">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatContainerRoot>;

export default meta;
type Story = StoryObj<typeof  ChatContainerRoot>;

const MESSAGES = [
  { role: "user", content: "Good morning! What should I focus on today?" },
  {
    role: "assistant",
    content:
      "Good morning! Based on your schedule and goals, I'd recommend starting with your deep work session on the project proposal — you have a 2-hour block free before your 11am meeting.\n\nAfter lunch, your energy typically dips, so that's a good time for email and administrative tasks.",
  },
  { role: "user", content: "Sounds good. What about my exercise goal?" },
  {
    role: "assistant",
    content:
      "You're at 3 sessions this week already — great consistency! Your goal is 4 per week, so a 30-minute session this evening would keep you on track without overextending.",
  },
];

export const Default: Story = {
  render: () => (
    <ChatContainerRoot className="h-full flex-col">
      <ChatContainerContent className="flex-col gap-4 p-4">
        {MESSAGES.map((msg, i) => (
          <div
            key={i}
            className={
              msg.role === "user"
                ? "ml-auto max-w-[80%] rounded-xl rounded-br-sm border border-border bg-surface-elevated px-4 py-2.5 text-sm text-fg"
                : "max-w-[90%] border-l-2 border-accent pl-4 py-1 text-sm text-fg"
            }
          >
            {msg.content}
          </div>
        ))}
        <ChatContainerScrollAnchor />
      </ChatContainerContent>
    </ChatContainerRoot>
  ),
};
