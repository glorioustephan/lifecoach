import type { Meta, StoryObj } from "@storybook/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Message } from "~/components/chat/Message";
import { ChatStateProvider } from "~/components/chat/chat-state";
import { makeStoryQueryClient } from "./providers";

const withProviders = (qc: QueryClient) => (Story: React.FC) => (
  <QueryClientProvider client={qc}>
    <ChatStateProvider>
      <Story />
    </ChatStateProvider>
  </QueryClientProvider>
);

const meta = {
  title: "Chat/Message",
  component: Message,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => {
      const qc = makeStoryQueryClient();
      return (
        <div className="w-[640px] space-y-4 rounded-lg bg-bg p-6">
          {withProviders(qc)(Story as React.FC)}
        </div>
      );
    },
  ],
} satisfies Meta<typeof Message>;

export default meta;
type Story = StoryObj<typeof  Message>;

export const UserMessage: Story = {
  args: {
    role: "user",
    content: "What should I focus on today?",
    isRunStart: true,
  },
};

export const AssistantMessage: Story = {
  args: {
    role: "assistant",
    content:
      "Good morning! Based on your goals, I'd recommend focusing on your deep work session first — you have a clean 2-hour block before your 11am standup.\n\nAfterwards, take 10 minutes to review your weekly progress. You're on track for 3 out of 4 goals.",
    isRunStart: true,
  },
};

export const AssistantStreaming: Story = {
  args: {
    role: "assistant",
    content: "Thinking through your request",
    streaming: true,
    isRunStart: true,
  },
};

export const AssistantContinuation: Story = {
  args: {
    role: "assistant",
    content: "Also, don't forget to log your workout from yesterday.",
    isRunStart: false,
  },
};

export const AssistantWithCode: Story = {
  args: {
    role: "assistant",
    content:
      "Here's a quick habit tracker snippet:\n\n```typescript\ninterface Habit {\n  name: string;\n  streak: number;\n  lastDone: Date;\n}\n\nconst checkHabit = (h: Habit): boolean =>\n  Date.now() - h.lastDone.getTime() < 86_400_000;\n```\n\nYou can adapt this for your journaling habit.",
    isRunStart: true,
  },
};
