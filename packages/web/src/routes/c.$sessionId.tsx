import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/lib/api";
import { ChatView } from "~/components/chat/ChatView";

export const Route = createFileRoute("/c/$sessionId")({
  component: SessionRoute,
});

function SessionRoute(): JSX.Element {
  const { sessionId } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.session(sessionId),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-fg-faint">
        Loading…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive-300">
        {error instanceof Error ? error.message : "Failed to load session"}
      </div>
    );
  }

  return <ChatView sessionId={sessionId} initialMessages={data?.messages ?? []} />;
}
