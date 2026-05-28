import type { Meta, StoryObj } from "@storybook/react";
import { CodeBlock, CodeBlockCode, CodeBlockGroup } from "~/components/ui/code-block";

const meta = {
  title: "UI Kit/CodeBlock",
  component: CodeBlock,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TypeScript: Story = {
  render: () => (
    <CodeBlock>
      <CodeBlockCode
        language="typescript"
        code={`interface WeeklyGoal {\n  id: string;\n  title: string;\n  progress: number;\n  dueDate: Date;\n}\n\nconst updateProgress = (goal: WeeklyGoal, delta: number): WeeklyGoal => ({\n  ...goal,\n  progress: Math.min(100, goal.progress + delta),\n});`}
      />
    </CodeBlock>
  ),
};

export const JavaScript: Story = {
  render: () => (
    <CodeBlock>
      <CodeBlockCode
        language="javascript"
        code={`async function fetchGoals(userId) {\n  const response = await fetch(\`/api/goals?user=\${userId}\`);\n  if (!response.ok) throw new Error('Failed to fetch goals');\n  return response.json();\n}`}
      />
    </CodeBlock>
  ),
};

export const WithHeader: Story = {
  render: () => (
    <CodeBlock>
      <CodeBlockGroup className="px-4 py-2 border-b border-border">
        <span className="text-xs font-mono text-fg-faint">goals.ts</span>
      </CodeBlockGroup>
      <CodeBlockCode
        language="typescript"
        code={`export const Goals = {\n  list: () => fetch('/api/goals').then(r => r.json()),\n  create: (data: Partial<Goal>) => fetch('/api/goals', { method: 'POST', body: JSON.stringify(data) }),\n};`}
      />
    </CodeBlock>
  ),
};

export const PlainText: Story = {
  render: () => (
    <CodeBlock>
      <CodeBlockCode
        language="plaintext"
        code="No syntax highlighting for plain text content."
      />
    </CodeBlock>
  ),
};
