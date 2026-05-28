/**
 * Composed "Chat page" story — a realistic conversation showing:
 * - Greeting from the assistant
 * - A few Message bubbles (user + assistant)
 * - A ToolCallDisclosure mid-conversation
 * - The Composer at the bottom
 *
 * No router required — this is a presentational composition.
 * ChatStateProvider + IngestProvider are needed for Composer + MessageActions.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ChatStateProvider } from "~/components/chat/chat-state";
import { IngestProvider } from "~/components/ingest/IngestProvider";
import { AgentStateProvider } from "~/components/chat/agent-state";
import { Message } from "~/components/chat/Message";
import { Composer } from "~/components/chat/Composer";
import { ToolCallDisclosure, type ToolCallState } from "~/components/chat/ToolCallDisclosure";
import { makeStoryQueryClient } from "./providers";

const toolCall: ToolCallState = {
  toolUseId: "tool_goals_check",
  name: "query_goals",
  input: { userId: "u_123", filter: "active" },
  status: "complete",
  output: "Found 4 active goals. Priority: 'Complete marathon training' (due in 9 days, 68% complete).",
  startedAt: Date.now() - 2400,
  finishedAt: Date.now() - 1200,
};

const CONVERSATION = [
  {
    role: "assistant" as const,
    content:
      "Good morning! I've reviewed your week so far. You're doing well on your journaling streak (21 days!) and your sleep has been more consistent.\n\nShall I pull up your current goals to see what we should focus on today?",
    isRunStart: true,
  },
  {
    role: "user" as const,
    content: "Yes, please check my goals and see what's most urgent.",
    isRunStart: true,
  },
  {
    role: "assistant" as const,
    content: "",
    isRunStart: true,
    tool: toolCall,
  },
  {
    role: "assistant" as const,
    content:
      "Based on your goals, here's what needs attention today:\n\n1. **Marathon training** (due in 9 days) — you're at 68%. You need one more long run this week to stay on track.\n2. **Read 12 books** — currently at 5 books, 3 months left. Aim for one chapter per evening.\n\nEverything else is on track. Want me to schedule the long run on your calendar?",
    isRunStart: false,
  },
];

function ChatPage() {
  const qc = makeStoryQueryClient();
  return (
    <QueryClientProvider client={qc}>
      <AgentStateProvider>
        <ChatStateProvider>
          <IngestProvider>
            <div className="flex h-[700px] w-[760px] flex-col overflow-hidden rounded-xl border border-border bg-bg">
              {/* Message list */}
              <div className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
                  {CONVERSATION.map((item, i) => (
                    <div key={i}>
                      {item.tool && (
                        <div className="mb-3 ml-10">
                          <ToolCallDisclosure call={item.tool} />
                        </div>
                      )}
                      {(item.role !== "assistant" || item.content.length > 0) && (
                        <Message
                          role={item.role}
                          content={item.content}
                          isRunStart={item.isRunStart}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
              {/* Composer */}
              <div className="border-t border-border">
                <Composer disabled={false} onSubmit={(t) => console.log("send:", t)} />
              </div>
            </div>
          </IngestProvider>
        </ChatStateProvider>
      </AgentStateProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Pages/ChatPage",
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => <ChatPage />,
};

export const Streaming: Story = {
  render: () => {
    const qc = makeStoryQueryClient();
    return (
      <QueryClientProvider client={qc}>
        <AgentStateProvider>
          <ChatStateProvider>
            <IngestProvider>
              <div className="flex h-[500px] w-[760px] flex-col overflow-hidden rounded-xl border border-border bg-bg">
                <div className="flex-1 overflow-y-auto">
                  <div className="mx-auto max-w-2xl space-y-5 px-4 py-6">
                    <Message
                      role="user"
                      content="What should I focus on this afternoon?"
                      isRunStart
                    />
                    <Message
                      role="assistant"
                      content="Looking at your schedule and energy patterns for the afternoon"
                      streaming
                      isRunStart
                    />
                  </div>
                </div>
                <div className="border-t border-border">
                  <Composer disabled onSubmit={() => {}} />
                </div>
              </div>
            </IngestProvider>
          </ChatStateProvider>
        </AgentStateProvider>
      </QueryClientProvider>
    );
  },
};
