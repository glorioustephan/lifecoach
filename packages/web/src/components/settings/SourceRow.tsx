import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/api";
import { cn } from "~/lib/cn";
import { toast } from "~/lib/use-toast";

export type Source = NonNullable<Awaited<ReturnType<typeof api.sources>>["sources"]>[number];

/**
 * Single row in the Sources list. Renders connection status, derived counts,
 * and a Sync button for sources we still mirror (Todoist). Capacities is
 * status-only since its API now only exposes titles.
 */
export function SourceRow({ source }: { source: Source }): JSX.Element {
  const qc = useQueryClient();

  const sync = useMutation({
    mutationFn: async () => {
      if (source.id === "todoist") {
        const { result } = await api.syncTodoist();
        return `${result.upserted} upserted · ${result.newlyCompleted} completed · ${result.embedded} embedded`;
      }
      throw new Error(`No sync for source ${source.id}`);
    },
    onSuccess: (msg) => {
      toast.success(`${source.name} synced`, msg);
      void qc.invalidateQueries({ queryKey: ["sources"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
    },
    onError: (err: unknown) => {
      toast.error(`${source.name} sync failed`, err instanceof Error ? err.message : String(err));
    },
  });

  const canSync = source.connected && source.id === "todoist";
  const counts: string[] = [];
  if (typeof source.tasks === "number") counts.push(`${source.tasks} tasks`);
  if (typeof source.ingestedFiles === "number") counts.push(`${source.ingestedFiles} files`);

  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">{source.name}</p>
          <p
            className={cn(
              "mt-1 text-[11px] uppercase tracking-wide",
              source.connected ? "text-success-500" : "text-fg-faint",
            )}
          >
            {source.connected ? "connected" : "not configured"}
            {counts.length > 0 ? ` · ${counts.join(" · ")}` : ""}
          </p>
        </div>
        {canSync && (
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className={cn(
              "rounded-md border border-border-subtle px-2.5 py-1 text-xs text-fg-muted",
              "transition-colors hover:border-accent/40 hover:text-fg",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {sync.isPending ? "syncing…" : "Sync"}
          </button>
        )}
      </div>
      {source.id === "capacities" && source.connected && !source.defaultSpaceId && (
        <p className="mt-1 text-[10px] text-fg-faint">
          Set <code>CAPACITIES_DEFAULT_SPACE_ID</code> to enable reflection write-back and
          save-to-daily-note tools.
        </p>
      )}
    </div>
  );
}
