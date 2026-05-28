import type { Meta, StoryObj } from "@storybook/react";
import { Markdown } from "~/components/ui/markdown";

const meta = {
  title: "UI Kit/Markdown",
  component: Markdown,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[640px] rounded-lg bg-surface p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Markdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Paragraphs: Story = {
  args: {
    children:
      "This is the first paragraph with some regular prose text. It should wrap at a reasonable width.\n\nThis is the second paragraph. Markdown supports **bold text**, *italic text*, and `inline code`.",
  },
};

export const WithCodeBlock: Story = {
  args: {
    children: "Here is a TypeScript example:\n\n```typescript\ninterface Goal {\n  id: string;\n  title: string;\n  dueDate: Date;\n  progress: number;\n}\n\nconst createGoal = (title: string): Goal => ({\n  id: crypto.randomUUID(),\n  title,\n  dueDate: new Date(),\n  progress: 0,\n});\n```\n\nYou can call it like: `createGoal('Run a 5k')`.",
  },
};

export const WithList: Story = {
  args: {
    children:
      "## Weekly Goals\n\nHere are your top priorities:\n\n- Complete the project proposal\n- Review financial statements\n- Schedule team check-ins\n\n### Ordered steps:\n\n1. Start with the highest impact item\n2. Time-box each task to 90 minutes\n3. Review progress at end of day",
  },
};

export const WithTable: Story = {
  args: {
    children:
      "| Day | Activity | Duration |\n|-----|----------|----------|\n| Mon | Running | 30 min |\n| Wed | Strength | 45 min |\n| Fri | Yoga | 60 min |",
  },
};

export const WithBlockquote: Story = {
  args: {
    children:
      '> "The key is not to prioritize what\'s on your schedule, but to schedule your priorities." — Stephen Covey\n\nThis insight is fundamental to effective goal-setting.',
  },
};
