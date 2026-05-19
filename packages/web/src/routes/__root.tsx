import { createRootRoute } from "@tanstack/react-router";
import { Shell } from "~/components/shell/Shell";
import { AgentStateProvider } from "~/components/chat/agent-state";
import { ChatStateProvider } from "~/components/chat/chat-state";

export const Route = createRootRoute({
  component: () => (
    <AgentStateProvider>
      <ChatStateProvider>
        <Shell />
      </ChatStateProvider>
    </AgentStateProvider>
  ),
});
