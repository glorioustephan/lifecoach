import { createRootRoute } from "@tanstack/react-router";
import { Shell } from "~/components/shell/Shell";
import { AgentStateProvider } from "~/components/chat/agent-state";
import { ChatStateProvider } from "~/components/chat/chat-state";
import { IngestProvider } from "~/components/ingest/IngestProvider";
import { DropZone } from "~/components/ingest/DropZone";
import { IngestSheet } from "~/components/ingest/IngestSheet";

export const Route = createRootRoute({
  component: () => (
    <AgentStateProvider>
      <ChatStateProvider>
        <IngestProvider>
          <Shell />
          <DropZone />
          <IngestSheet />
        </IngestProvider>
      </ChatStateProvider>
    </AgentStateProvider>
  ),
});
