import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/sources")({
  component: SourcesRoute,
});

function SourcesRoute(): null {
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to Settings > Sources tab
    void navigate({ to: "/settings", search: { tab: "sources" }, replace: true });
  }, [navigate]);

  return null;
}
