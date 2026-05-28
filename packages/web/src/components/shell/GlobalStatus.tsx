import { useQuery } from "@tanstack/react-query";
import { api } from "~/lib/api";
import { useAgentState } from "../chat/agent-state";

const formatRelative = (ts: number): string => {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
};

/**
 * Always-visible status footer at the bottom of the laptop rail.
 * Shows last sync time, agent state, and connection health.
 */
export const GlobalStatus = (): JSX.Element => {
  const { data: status } = useQuery({
    queryKey: ["status"],
    queryFn: api.status,
    refetchInterval: 30_000,
  });
  const agentState = useAgentState();
  const glowOpacity = agentState === "idle" ? 0 : agentState === "thinking" ? 0.18 : 0.32;

  return (
    <div
      className="rail-footer mx-3 my-3 rounded-md border border-border-subtle bg-surface/50 px-3 py-2.5 text-xs"
      style={{ ["--agent-glow-opacity" as string]: glowOpacity }}
    >
      <div className="mb-1.5 flex items-center justify-between text-fg-muted">
        <span>Status</span>
        <span className="font-mono text-[10px] text-fg-faint">
          {status?.lastSession
            ? formatRelative(status.lastSession.startedAt)
            : "—"}
        </span>
      </div>
      <ul className="space-y-1 text-[11px] text-fg-faint">
        <li className="flex items-center justify-between">
          <span>Agent</span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={
                agentState === "idle"
                  ? "size-2 rounded-full bg-fg-faint"
                  : "size-2 animate-pulse rounded-full bg-accent"
              }
              aria-hidden
            />
            {agentState}
          </span>
        </li>
        <li className="flex items-center justify-between">
          <span>Embedder</span>
          <span>{status?.embedder.enabled ? "on" : "off"}</span>
        </li>
        <li className="flex items-center justify-between">
          <span>Todoist</span>
          <span>{status?.todoist ? "connected" : "—"}</span>
        </li>
      </ul>
    </div>
  );
};
