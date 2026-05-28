import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Circle, Loader2 } from "lucide-react";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { IconButton } from "~/components/ui/IconButton";
import { PaginationNav } from "~/components/ui/PaginationNav";
import { cn } from "~/lib/cn";
import { api, type TaskRow } from "~/lib/api";
import { toast } from "~/lib/use-toast";

export const Route = createFileRoute("/tasks")({
  component: TasksRoute,
});

function priorityColor(p: number | null): string {
  if (p === 4) return "bg-destructive-500";
  if (p === 3) return "bg-warning-500";
  if (p === 2) return "bg-fg-faint";
  return "";
}

const PAGE_SIZE = 25;

function TasksRoute(): JSX.Element {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ tasks: TaskRow[]; total: number }>({
    queryKey: ["tasks", "active", page],
    queryFn: () => api.tasks({ status: "active", page, limit: PAGE_SIZE }),
  });

  const complete = useMutation({
    mutationFn: (id: string) => api.completeTask(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueryData(["tasks", "active", page]);
      qc.setQueryData(["tasks", "active", page], (old?: { tasks: TaskRow[]; total: number }) =>
        old
          ? {
              tasks: old.tasks.filter((t) => t.id !== id),
              total: old.total - 1,
            }
          : old,
      );
      return { prev };
    },
    onError: (err: unknown, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks", "active", page], ctx.prev);
      toast.error("Could not complete task", err instanceof Error ? err.message : String(err));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
    },
  });

  const itemsShown = data?.tasks.length ?? 0;
  const totalItems = data?.total ?? 0;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader title="Tasks" subtitle="Your active Todoist, lightly" />
      <div className="flex-1 overflow-y-auto mobile-safe-bottom">
        <div className="mx-auto max-w-2xl px-4 pb-4 pt-8 md:px-6">
          {isLoading && (
            <ul className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <li
                  key={i}
                  className="h-12 animate-pulse rounded-md border border-border-subtle bg-surface/50"
                />
              ))}
            </ul>
          )}
          {!isLoading && totalItems === 0 && (
            <p className="mt-12 text-center text-sm text-fg-muted">
              No active tasks. Run <code className="rounded-sm bg-surface px-1 font-mono text-xs">pnpm -w run lifecoach sync todoist</code> or ask your coach to sync.
            </p>
          )}
          {!isLoading && data && data.tasks.length > 0 && (
            <>
              <ul className="divide-y divide-border-subtle rounded-md border border-border bg-surface">
                {data.tasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                    <IconButton
                      type="button"
                      onClick={() => complete.mutate(t.id)}
                      disabled={complete.isPending && complete.variables === t.id}
                      variant="success"
                      size="sm"
                      className="group -ml-1.5 mt-0.5 shrink-0 rounded-full"
                      title="Mark task as complete"
                    >
                      {complete.isPending && complete.variables === t.id ? (
                        <Loader2 className="size-5 animate-spin text-success-500" strokeWidth={1.75} />
                      ) : (
                        <Circle className="size-5 text-fg-faint group-hover:text-success-500/60 transition-colors" strokeWidth={1.75} />
                      )}
                    </IconButton>
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-sm", t.completedAt ? "text-fg-faint line-through" : "text-fg")}>
                        {t.content}
                      </p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
                        {t.priority && (
                          <span
                            aria-hidden
                            className={`size-2 rounded-full ${priorityColor(t.priority)}`}
                          />
                        )}
                        {t.projectName && <span>{t.projectName}</span>}
                        {t.dueString && (
                          <>
                            {t.projectName && <span>·</span>}
                            <span>{t.dueString}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <PaginationNav
                  currentPage={page}
                  totalPages={totalPages}
                  itemsShown={itemsShown}
                  totalItems={totalItems}
                  onLoadMore={() => setPage(page + 1)}
                  isLoading={isLoading}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
