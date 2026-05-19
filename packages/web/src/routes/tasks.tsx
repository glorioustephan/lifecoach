import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Circle } from "lucide-react";
import { ViewHeader } from "~/components/ui/ViewHeader";

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
}

function priorityColor(p: number | null): string {
  if (p === 4) return "bg-destructive-500";
  if (p === 3) return "bg-warning-500";
  if (p === 2) return "bg-neutral-500";
  return "";
}

function TasksRoute(): JSX.Element {
  const { data, isLoading } = useQuery<{ tasks: TaskRow[] }>({
    queryKey: ["tasks", "active"],
    queryFn: async () => {
      const resp = await fetch("/api/tasks?status=active&limit=100");
      if (!resp.ok) throw new Error(resp.statusText);
      return resp.json();
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader title="Tasks" subtitle="Your active Todoist, lightly" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-4 md:px-6">
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
          {!isLoading && (data?.tasks.length ?? 0) === 0 && (
            <p className="mt-12 text-center text-sm text-fg-muted">
              No active tasks. Run <code className="rounded-sm bg-surface px-1 font-mono text-xs">pnpm -w run lifecoach sync todoist</code> or ask your coach to sync.
            </p>
          )}
          {!isLoading && data && data.tasks.length > 0 && (
            <ul className="divide-y divide-border-subtle rounded-md border border-border bg-surface">
              {data.tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                  <Circle className="mt-0.5 size-5 text-fg-faint" strokeWidth={1.75} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">{t.content}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
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
          )}
        </div>
      </div>
    </div>
  );
}
