/**
 * Shell story — the full layout chrome (RailNav + content area + TabBar).
 *
 * Shell renders <Outlet /> which requires the router to mount a matching
 * route. We use the minimal in-memory router shim that renders a placeholder
 * content area in the outlet, so the shell chrome is fully visible without
 * needing any real routes.
 */
import type { Meta, StoryObj } from "@storybook/react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createRouter,
  createMemoryHistory,
  createRootRoute,
  RouterProvider,
} from "@tanstack/react-router";
import { AgentStateProvider } from "~/components/chat/agent-state";
import { RailNav } from "~/components/shell/RailNav";
import { TabBar } from "~/components/shell/TabBar";
import { makeStoryQueryClient } from "./providers";

const STATUS_DATA = {
  lastSession: { startedAt: Date.now() - 12 * 60_000 },
  embedder: { enabled: true },
  todoist: true,
};

function ShellPreview({ content }: { content: React.ReactNode }) {
  const qc = makeStoryQueryClient();
  qc.setQueryData(["status"], STATUS_DATA);

  // Root route renders the shell chrome (RailNav + content + TabBar). The story
  // content is injected directly rather than through a child route + <Outlet />,
  // which keeps the in-memory router to a single route.
  const rootRouteWithContent = createRootRoute({
    component: () => (
      <div className="flex h-dvh w-full">
        <RailNav />
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          {content}
        </main>
        <TabBar />
      </div>
    ),
  });

  const router = createRouter({
    routeTree: rootRouteWithContent,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return (
    <QueryClientProvider client={qc}>
      <AgentStateProvider>
        <RouterProvider router={router} />
      </AgentStateProvider>
    </QueryClientProvider>
  );
}

const meta = {
  title: "Shell/Shell",
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ShellPreview
      content={
        <div className="flex h-full items-center justify-center">
          <div className="text-center space-y-2">
            <p className="text-sm font-medium text-fg">Chat view</p>
            <p className="text-xs text-fg-faint">Main content renders here via &lt;Outlet /&gt;</p>
          </div>
        </div>
      }
    />
  ),
};

export const WithContent: Story = {
  render: () => (
    <ShellPreview
      content={
        <div className="flex h-full flex-col">
          <header className="border-b border-border">
            <div className="mx-auto flex h-16 max-w-2xl items-center px-4">
              <h1 className="text-sm font-medium text-fg">Artifacts</h1>
            </div>
          </header>
          <div className="flex-1 overflow-auto px-4 py-6">
            <div className="mx-auto max-w-2xl grid gap-3 sm:grid-cols-2">
              {["Meal plan · Jan 2024", "Workout routine", "Q1 Financial review", "Reflection · Week 4"].map((item) => (
                <div key={item} className="rounded-lg border border-border-subtle bg-surface-elevated p-4 text-sm text-fg-muted">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      }
    />
  ),
};
