import type { Meta, StoryObj } from "@storybook/react";
import { Tool } from "~/components/ui/tool";

const meta = {
  title: "UI Kit/Tool",
  component: Tool,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[560px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tool>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InputStreaming: Story = {
  args: {
    toolPart: {
      type: "search_web",
      state: "input-streaming",
      toolCallId: "call_abc123",
    },
    defaultOpen: true,
  },
};

export const InputAvailable: Story = {
  args: {
    toolPart: {
      type: "query_goals",
      state: "input-available",
      input: { userId: "u_123", limit: 10, filter: "active" },
      toolCallId: "call_def456",
    },
    defaultOpen: true,
  },
};

export const OutputAvailable: Story = {
  args: {
    toolPart: {
      type: "create_task",
      state: "output-available",
      input: { title: "Review quarterly goals", dueDate: "2024-02-01" },
      output: { id: "task_789", created: true, message: "Task created successfully" },
      toolCallId: "call_ghi789",
    },
    defaultOpen: true,
  },
};

export const OutputError: Story = {
  args: {
    toolPart: {
      type: "fetch_calendar",
      state: "output-error",
      input: { startDate: "2024-01-01", endDate: "2024-01-31" },
      errorText: "Authentication failed: Calendar access token expired",
      toolCallId: "call_jkl012",
    },
    defaultOpen: true,
  },
};

export const Collapsed: Story = {
  args: {
    toolPart: {
      type: "analyze_habits",
      state: "output-available",
      input: { period: "last_30_days" },
      output: { insights: ["Sleep improved by 12%", "Exercise streak: 7 days"] },
      toolCallId: "call_mno345",
    },
    defaultOpen: false,
  },
};
