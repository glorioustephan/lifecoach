/**
 * Shared story providers for chat and shell stories.
 *
 * - QueryClientProvider: provides a no-network QueryClient with sane defaults
 * - AgentStateProvider: agent status context
 * - ChatStateProvider: chat message list context
 * - IngestProvider: file ingest context
 *
 * Router-dependent stories use a minimal MemoryRouter shim below.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { AgentStateProvider } from "~/components/chat/agent-state";
import { ChatStateProvider } from "~/components/chat/chat-state";
import { IngestProvider } from "~/components/ingest/IngestProvider";

/** Single shared QueryClient for Storybook (never retry, never background-fetch). */
export const makeStoryQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { retry: false },
    },
  });

/** Wraps children in all providers needed by chat/shell components. */
export function ChatProviders({ children }: { children: ReactNode }) {
  const qc = makeStoryQueryClient();
  return (
    <QueryClientProvider client={qc}>
      <AgentStateProvider>
        <ChatStateProvider>
          <IngestProvider>{children}</IngestProvider>
        </ChatStateProvider>
      </AgentStateProvider>
    </QueryClientProvider>
  );
}

/**
 * Minimal router shim for TanStack Router v1.
 *
 * Shell/RailNav/TabBar call `useRouterState()` and render `<Link>` which both
 * require a router context. Rather than booting the full file-based router
 * (which tries to import `routeTree.gen.ts` and all route modules), we create
 * a minimal in-memory router with a single root route that renders the story.
 *
 * This is the lightest-weight approach: only `createRouter` + one route.
 */
import {
  createRouter,
  createMemoryHistory,
  createRootRoute,
  RouterProvider,
} from "@tanstack/react-router";

export function withTanStackRouter(children: ReactNode) {
  const rootRoute = createRootRoute({
    component: () => <>{children}</>,
  });

  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });

  return <RouterProvider router={router} />;
}
