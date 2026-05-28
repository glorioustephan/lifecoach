import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type GoalRow } from "~/lib/api";

/**
 * Tasks tab of the GoalEditSheet — read-only list of tasks linked to this
 * goal. Linking happens from the chat agent in Phase 1. Extracted from
 * GoalEditSheet.tsx (Wave 5.4).
 */
export function TasksTab({ goal }: { goal: GoalRow }): JSX.Element {
  const { data } = useQuery({ queryKey: ["tasks", "all"], queryFn: () => api.tasks() });
  const linked = useMemo(
    () => (data?.tasks ?? []).filter((t) => t.goalId === goal.id),
    [data, goal.id],
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <p className="text-xs text-fg-faint">
        Tasks linked to this goal. To link a Todoist task, ask the coach in chat
        to "link &lt;task&gt; to &lt;this goal&gt;".
      </p>
      {linked.length === 0 ? (
        <p className="text-xs text-fg-faint">No linked tasks yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {linked.map((t) => (
            <li
              key={t.id}
              className="rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-fg"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={t.completedAt ? "text-fg-faint line-through" : ""}>
                  {t.content}
                </span>
                {t.dueString && (
                  <span className="text-[10px] font-mono text-fg-faint">{t.dueString}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
