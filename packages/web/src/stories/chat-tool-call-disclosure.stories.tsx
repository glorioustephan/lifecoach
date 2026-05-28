import type { Meta, StoryObj } from "@storybook/react";
import { ToolCallDisclosure } from "~/components/chat/ToolCallDisclosure";

const meta = {
  title: "Chat/ToolCallDisclosure",
  component: ToolCallDisclosure,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[600px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ToolCallDisclosure>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Running: Story = {
  args: {
    call: {
      toolUseId: "tool_running",
      name: "search_memory",
      input: { query: "exercise goals", limit: 5 },
      status: "running",
      startedAt: Date.now() - 1200,
    },
  },
};

export const Complete: Story = {
  args: {
    call: {
      toolUseId: "tool_complete",
      name: "query_goals",
      input: { userId: "u_123", filter: "active" },
      status: "complete",
      output: "Found 4 active goals. Top priority: 'Complete marathon training plan' (due in 12 days).",
      startedAt: Date.now() - 3400,
      finishedAt: Date.now() - 1100,
    },
  },
};

export const Error: Story = {
  args: {
    call: {
      toolUseId: "tool_error",
      name: "fetch_calendar",
      input: { start: "2024-02-01", end: "2024-02-07" },
      status: "error",
      error: "Google Calendar OAuth token has expired. Please reconnect your calendar.",
      startedAt: Date.now() - 800,
      finishedAt: Date.now() - 300,
    },
  },
};

export const WithArrayOutput: Story = {
  args: {
    call: {
      toolUseId: "tool_array",
      name: "list_habits",
      input: { period: "last_7_days" },
      status: "complete",
      output: [
        { text: "Morning meditation: 6/7 days" },
        { text: "Exercise: 4/7 days" },
        { text: "Journaling: 7/7 days ✓" },
      ],
      startedAt: Date.now() - 4500,
      finishedAt: Date.now() - 1800,
    },
  },
};

export const LongRunning: Story = {
  args: {
    call: {
      toolUseId: "tool_long",
      name: "analyze_financial_data",
      input: { months: 12, categories: ["food", "transport", "health", "entertainment"] },
      status: "complete",
      output: "Annual spending analysis complete. Total: $42,800. Largest category: Housing (38%). Biggest change vs. prior year: Entertainment +24%.",
      startedAt: Date.now() - 12_400,
      finishedAt: Date.now() - 200,
    },
  },
};
