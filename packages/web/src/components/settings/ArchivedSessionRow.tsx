import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "~/lib/api";
import { formatRelative } from "~/lib/time";
import { toast } from "~/lib/use-toast";

type ArchivedSession = NonNullable<
  Awaited<ReturnType<typeof api.archivedSessions>>["sessions"]
>[number];

/**
 * Single row in the Archived Conversations list. Restore button calls
 * api.unarchiveSession and invalidates the sessions query.
 */
export function ArchivedSessionRow({ session }: { session: ArchivedSession }): JSX.Element {
  const qc = useQueryClient();
  const unarchive = useMutation({
    mutationFn: () => api.unarchiveSession(session.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sessions"] });
      toast.success("Session restored");
    },
    onError: (err: unknown) => {
      toast.error("Restore failed", err instanceof Error ? err.message : String(err));
    },
  });

  const label = session.summary ?? session.preview ?? "(empty conversation)";

  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-fg">{label}</p>
        <p className="mt-1 text-xs text-fg-faint">
          Archived {formatRelative(session.archivedAt ?? 0)} · {session.messageCount} messages
        </p>
      </div>
      <button
        type="button"
        onClick={() => unarchive.mutate()}
        disabled={unarchive.isPending}
        className="shrink-0 rounded-md border border-border-subtle px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-accent/40 hover:text-fg disabled:opacity-50"
      >
        {unarchive.isPending ? "Restoring…" : "Restore"}
      </button>
    </div>
  );
}
