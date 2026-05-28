/**
 * RailNav story — uses a minimal TanStack Router in-memory setup so that
 * `useRouterState()` and `<Link>` resolve without the real file-based router.
 *
 * GlobalStatus calls useQuery + useAgentState; we wrap in QueryClientProvider
 * and AgentStateProvider and pre-seed the status query with mock data so no
 * network call is needed.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AgentStateProvider } from "~/components/chat/agent-state";
import { RailNav } from "~/components/shell/RailNav";
import { makeStoryQueryClient, withTanStackRouter } from "./providers";

const STATUS_DATA = {
  lastSession: { startedAt: Date.now() - 5 * 60_000 },
  embedder: { enabled: true },
  todoist: true,
};

const WithAllProviders = ({ children }: { children: React.ReactNode }) => {
  const qc = makeStoryQueryClient();
  qc.setQueryData(["status"], STATUS_DATA);
  return (
    <QueryClientProvider client={qc}>
      <AgentStateProvider>{children}</AgentStateProvider>
    </QueryClientProvider>
  );
};

const meta = {
  title: "Shell/RailNav",
  component: RailNav,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <WithAllProviders>
        <div className="flex h-[600px] bg-bg">
          {withTanStackRouter(<RailNav />)}
        </div>
      </WithAllProviders>
    ),
  ],
} satisfies Meta<typeof RailNav>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
