import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderView } from "~/components/ui/PlaceholderView";

export const Route = createFileRoute("/inbox")({
  component: () => (
    <PlaceholderView
      title="Inbox"
      subtitle="Today's agent-generated insights and reflections"
      note="The morning ritual lives here — agent-surfaced insights, daily reflections, and anything that needs your eyes."
    />
  ),
});
