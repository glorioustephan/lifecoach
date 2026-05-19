import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { api } from "~/lib/api";
import { formatRelative } from "~/lib/time";
import { Sheet, SheetBody, SheetHeader } from "~/components/ui/Sheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Used to highlight the currently-active session in the list. */
  activeSessionId?: string;
}

export const SessionListSheet = ({
  open,
  onOpenChange,
  activeSessionId,
}: Props): JSX.Element => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: api.recentSessions,
    enabled: open, // only fetch when the sheet is opened
    refetchInterval: open ? 30_000 : false,
  });

  const handlePick = (id: string): void => {
    onOpenChange(false);
    // Pre-warm the session detail cache so the route load is instant.
    void qc.prefetchQuery({
      queryKey: ["session", id],
      queryFn: () => api.session(id),
    });
    void navigate({ to: "/c/$sessionId", params: { sessionId: id } });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} side="left" width="md:w-[400px] w-[85vw]">
      <SheetHeader title="Past conversations" onClose={() => onOpenChange(false)} />
      <SheetBody>
        {isLoading && (
          <div className="px-4 py-6 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-md border border-border-subtle bg-surface/50"
              />
            ))}
          </div>
        )}
        {!isLoading && (data?.sessions.length ?? 0) === 0 && (
          <div className="px-6 py-16 text-center">
            <MessageCircle className="mx-auto mb-3 size-6 text-fg-faint" strokeWidth={1.5} />
            <p className="text-sm text-fg-muted">No conversations yet.</p>
            <p className="mt-1 text-xs text-fg-faint">
              Start one — they'll show up here.
            </p>
          </div>
        )}
        {!isLoading && data && data.sessions.length > 0 && (
          <ul className="divide-y divide-border-subtle">
            {data.sessions.map((s) => {
              const isActive = s.id === activeSessionId;
              const label =
                s.summary && s.summary.trim().length > 0
                  ? s.summary
                  : s.preview && s.preview.length > 0
                    ? s.preview
                    : "(empty conversation)";
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(s.id)}
                    className={
                      "block w-full px-4 py-3 text-left transition-colors hover:bg-surface-elevated/40" +
                      (isActive ? " bg-surface-elevated/60" : "")
                    }
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm text-fg">{label}</span>
                      <span className="shrink-0 font-mono text-[10px] text-fg-faint">
                        {formatRelative(s.startedAt)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-fg-faint">
                      <span>{s.messageCount} msg{s.messageCount === 1 ? "" : "s"}</span>
                      {isActive && (
                        <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-accent">
                          current
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </SheetBody>
    </Sheet>
  );
};
