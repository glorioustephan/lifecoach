import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Circle, CheckCircle2, Loader2 } from "lucide-react";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { PaginationNav } from "~/components/ui/PaginationNav";
import { cn } from "~/lib/cn";

export const Route = createFileRoute("/tasks")({
  component: TasksRoute,
});

interface TaskRow {
  id: string;
  content: string;
  projectName: string | null;
  priority: number | null;
  dueAt: number | null;
  dueString: string | null;
  labels: string[];
  completedAt: number | null;
}

function priorityColor(p: number | null): string {
  if (p === 4) return "bg-destructive-500";
  if (p === 3) return "bg-warning-500";
  if (p === 2) return "bg-neutral-500";
  return "";
}

const PAGE_SIZE = 25;

function TasksRoute(): JSX.Element {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ tasks: TaskRow[]; total: number }>({
    queryKey: ["tasks", "active", page],
    queryFn: async () => {
      const resp = await fetch(`/api/tasks?status=active&page=${page}&limit=${PAGE_SIZE}`);
      if (!resp.ok) throw new Error(resp.statusText);
      return resp.json();
    },
  });

  const complete = useMutation({
    mutationFn: async (id: string) => {
      const resp = await fetch(`/api/tasks/${id}/complete`, { method: "POST" });
      if (!resp.ok) throw new Error(resp.statusText);
      return resp.json();
    },
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
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks", "active", page], ctx.prev);
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
                    <button
                      type="button"
                      onClick={() => complete.mutate(t.id)}
                      disabled={complete.isPending && complete.variables === t.id}
                      className="group mt-0.5 flex size-8 shrink-0 -ml-1.5 items-center justify-center rounded-full hover:bg-success-500/10 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                      title="Mark task as complete"
                    >
                      {complete.isPending && complete.variables === t.id ? (
                        <Loader2 className="size-5 animate-spin text-success-500" strokeWidth={1.75} />
                      ) : (
                        <Circle className="size-5 text-fg-faint group-hover:text-success-500/60 transition-colors" strokeWidth={1.75} />
                      )}
                    </button>
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
