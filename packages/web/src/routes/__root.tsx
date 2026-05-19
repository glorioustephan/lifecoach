import { createRootRoute } from "@tanstack/react-router";
import { Shell } from "~/components/shell/Shell";
import { AgentStateProvider } from "~/components/chat/agent-state";

export const Route = createRootRoute({
  component: () => (
    <AgentStateProvider>
      <Shell />
    </AgentStateProvider>
  ),
});
