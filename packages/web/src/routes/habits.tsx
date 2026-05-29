/**
 * /habits route — three-tab Habits surface.
 *
 * Today (default) — HabitCard list grouped by parent goal.
 * Calendar        — HabitGrid (Arch•a•Track) with optimistic cell-toggle.
 * All             — full list including paused/archived with status filter.
 *
 * Pattern: mirrors memory.tsx three-view container (Wave 5c).
 *
 * ADHD-3: Visible next action — every card has its today-cell on the right.
 * ADHD-8: Selected month, tab state persist within the session.
 */
import { useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Repeat2, Plus } from "lucide-react";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { TabNav } from "~/components/ui/TabNav";
import { Button } from "~/components/ui/Button";
import { EmptyState } from "~/components/ui/EmptyState";
import { cn } from "~/lib/cn";
import { toast } from "~/lib/use-toast";
import { api, type HabitRow } from "~/lib/api";
import { dateKey, computeStreak, isCadenceDueOn } from "~/lib/habit";
import { HabitCard } from "~/components/habits/HabitCard";
import { HabitGrid } from "~/components/habits/HabitGrid";
import { HabitDetailSheet } from "~/components/habits/HabitDetailSheet";
import { MonthNav } from "~/components/habits/MonthNav";
import { NewHabitDialog } from "~/components/habits/NewHabitDialog";

export const Route = createFileRoute("/habits")({
  component: HabitsRoute,
});

type TabId = "today" | "calendar" | "all";

function HabitsRoute(): JSX.Element {
  const [tab, setTab] = useState<TabId>("today");
  const [editingHabit, setEditingHabit] = useState<HabitRow | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);

  // Calendar month state — persists across sheet open/close (ADHD-8).
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const today = dateKey(now);

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "today", label: "Today" },
    { id: "calendar", label: "Calendar" },
    { id: "all", label: "All" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader
        title="Habits"
        subtitle="Daily practices that build toward your goals"
        actions={
          <Button variant="primary" size="sm" onClick={() => setNewDialogOpen(true)}>
            <Plus className="size-3.5" strokeWidth={1.75} />
            New habit
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto mobile-safe-bottom">
        <TabNav<TabId> tabs={tabs} active={tab} onChange={setTab} variant="underline" />
        <div className="mx-auto max-w-3xl px-4 py-4 md:px-6">
          {tab === "today" && (
            <TodayTab
              today={today}
              onOpenDetail={setEditingHabit}
              onNewHabit={() => setNewDialogOpen(true)}
            />
          )}
          {tab === "calendar" && (
            <CalendarTab
              year={calYear}
              month={calMonth}
              today={today}
              onMonthChange={(y, m) => { setCalYear(y); setCalMonth(m); }}
              onOpenDetail={setEditingHabit}
            />
          )}
          {tab === "all" && (
            <AllTab onOpenDetail={setEditingHabit} />
          )}
        </div>
      </div>

      <HabitDetailSheet
        habit={editingHabit}
        onClose={() => setEditingHabit(null)}
      />
      <NewHabitDialog
        open={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
      />
    </div>
  );
}

// ─── Today Tab ─────────────────────────────────────────────────────────────────

interface TodayTabProps {
  today: string;
  onOpenDetail: (habit: HabitRow) => void;
  onNewHabit: () => void;
}

function TodayTab({ today, onOpenDetail, onNewHabit }: TodayTabProps): JSX.Element {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["habits", "active"],
    queryFn: () => api.habits({ status: "active" }),
    staleTime: 30_000,
  });

  // Resolve parent goal IDs to titles for group headers. Active goals are
  // already prefetched by /goals; we hit the cache when available.
  const { data: goalsData } = useQuery({
    queryKey: ["goals", "active"],
    queryFn: () => api.goals("active"),
    staleTime: 30_000,
  });
  const goalTitleById = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of goalsData?.goals ?? []) m.set(g.id, g.title);
    return m;
  }, [goalsData]);

  const habits = data?.habits ?? [];
  const todayDate = new Date(today + "T00:00:00");

  // Batch-fetch today's month data for streak/completion state.
  const [calYear] = useState(new Date().getFullYear());
  const [calMonth] = useState(new Date().getMonth() + 1);
  const habitIds = habits.map((h) => h.id);

  const { data: batchData } = useQuery({
    queryKey: ["habits", "month-batch", calYear, calMonth, habitIds.join(",")],
    queryFn: () =>
      habitIds.length > 0
        ? api.habitMonthBatch(habitIds, calYear, calMonth)
        : Promise.resolve({ byHabit: {} }),
    enabled: habitIds.length > 0,
    staleTime: 30_000,
  });

  // Build Map<habitId, Map<dateKey, count>>.
  const byHabit = useMemo<Map<string, Map<string, number>>>(() => {
    const raw = batchData?.byHabit ?? {};
    return new Map(
      Object.entries(raw as Record<string, Record<string, number>>).map(([id, dayMap]) => [
        id,
        new Map(Object.entries(dayMap)),
      ]),
    );
  }, [batchData]);

  const completeMut = useMutation({
    mutationFn: ({ habitId }: { habitId: string }) =>
      api.completeHabit(habitId, { date: today }),
    onSuccess: (_data, { habitId }) => {
      // ADHD-6: quick reversal — Undo in the toast.
      const completionId = _data.completion.id;
      const id = toast({
        title: "Logged",
        variant: "success",
        action: {
          label: "Undo",
          onClick: () => {
            void api.uncompleteHabit(habitId, completionId).then(() => {
              void qc.invalidateQueries({ queryKey: ["habits"] });
              toast.dismiss(id);
            });
          },
        },
      });
      void qc.invalidateQueries({ queryKey: ["habits"] });
    },
    onError: (err: unknown) => {
      toast.error("Couldn't log", err instanceof Error ? err.message : String(err));
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-md bg-surface-elevated" />
        ))}
      </div>
    );
  }

  if (habits.length === 0) {
    return (
      <EmptyState
        icon={<Repeat2 className="size-8 text-fg-faint" strokeWidth={1.5} />}
        title="No habits yet"
        body="Create your first habit to start tracking daily practices."
        action={{ label: "Create your first habit", onClick: onNewHabit }}
      />
    );
  }

  // Group by parentGoalId.
  const groups = useMemo(() => {
    const grouped = new Map<string | null, HabitRow[]>();
    for (const habit of habits) {
      const key = habit.parentGoalId ?? null;
      const list = grouped.get(key) ?? [];
      list.push(habit);
      grouped.set(key, list);
    }
    // Sort habits within each group alphabetically.
    for (const list of grouped.values()) {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return grouped;
  }, [habits]);

  return (
    <div className="space-y-6">
      {Array.from(groups.entries()).map(([goalId, groupHabits]) => (
        <section key={goalId ?? "__standalone"}>
          {/* Group header — show the actual goal title; fall back to a
              short id only if the goal hasn't loaded yet (cache miss). */}
          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-fg-faint">
            {goalId
              ? (goalTitleById.get(goalId) ?? `Goal: ${goalId.slice(0, 8)}…`)
              : "Independent habits"}
          </h2>
          <div className="space-y-2">
            {groupHabits.map((habit) => {
              const completions = byHabit.get(habit.id) ?? new Map<string, number>();
              const { current, lastCompletedKey } = computeStreak(completions, today);
              const isDoneToday = (completions.get(today) ?? 0) >= 1;
              const isDue = isCadenceDueOn(habit.cadence, todayDate);

              const todayState: "empty" | "done" | "disabled" = isDoneToday
                ? "done"
                : !isDue
                  ? "disabled"
                  : "empty";

              return (
                <HabitCard
                  key={habit.id}
                  habit={habit}
                  todayState={todayState}
                  streak={current}
                  lastCompletedKey={lastCompletedKey}
                  todayKey={today}
                  parentGoalTitle={
                    habit.parentGoalId
                      ? goalTitleById.get(habit.parentGoalId)
                      : undefined
                  }
                  onToggle={() => completeMut.mutate({ habitId: habit.id })}
                  onOpenDetail={() => onOpenDetail(habit)}
                />
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Calendar Tab ──────────────────────────────────────────────────────────────

interface CalendarTabProps {
  year: number;
  month: number;
  today: string;
  onMonthChange: (year: number, month: number) => void;
  onOpenDetail: (habit: HabitRow) => void;
}

function CalendarTab({
  year,
  month,
  today,
  onMonthChange,
  onOpenDetail: _onOpenDetail,
}: CalendarTabProps): JSX.Element {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["habits", "active"],
    queryFn: () => api.habits({ status: "active" }),
    staleTime: 30_000,
  });

  const habits = data?.habits ?? [];
  const habitIds = habits.map((h) => h.id);

  const { data: batchData, isLoading: batchLoading } = useQuery({
    queryKey: ["habits", "month-batch", year, month, habitIds.join(",")],
    queryFn: () =>
      habitIds.length > 0
        ? api.habitMonthBatch(habitIds, year, month)
        : Promise.resolve({ byHabit: {} }),
    enabled: habitIds.length > 0,
    staleTime: 60_000,
  });

  const byHabit = useMemo<Map<string, Map<string, number>>>(() => {
    const raw = batchData?.byHabit ?? {};
    return new Map(
      Object.entries(raw as Record<string, Record<string, number>>).map(([id, dayMap]) => [
        id,
        new Map(Object.entries(dayMap)),
      ]),
    );
  }, [batchData]);

  // Optimistic toggle on cell click.
  const completeMut = useMutation({
    mutationFn: ({
      habitId,
      key,
    }: {
      habitId: string;
      key: string;
    }) => api.completeHabit(habitId, { date: key }),
    onSuccess: (_data, { habitId }) => {
      const completionId = _data.completion.id;
      const id = toast({
        title: "Logged",
        variant: "success",
        action: {
          label: "Undo",
          onClick: () => {
            void api.uncompleteHabit(habitId, completionId).then(() => {
              void qc.invalidateQueries({ queryKey: ["habits", "month-batch"] });
              toast.dismiss(id);
            });
          },
        },
      });
      void qc.invalidateQueries({ queryKey: ["habits", "month-batch", year, month] });
      void qc.invalidateQueries({ queryKey: ["habits"] });
    },
    onError: (err: unknown) => {
      toast.error("Couldn't log", err instanceof Error ? err.message : String(err));
    },
  });

  const handleCellClick = useCallback(
    (habitId: string, key: string) => {
      completeMut.mutate({ habitId, key });
    },
    [completeMut],
  );

  return (
    <div className="space-y-4">
      <MonthNav year={year} month={month} onChange={onMonthChange} />

      {(isLoading || batchLoading) && (
        <div className="h-40 animate-pulse rounded-md bg-surface-elevated" />
      )}

      {!isLoading && habits.length === 0 && (
        <p className="py-8 text-center text-xs text-fg-faint">
          No active habits to display.
        </p>
      )}

      {!isLoading && habits.length > 0 && (
        <HabitGrid
          habits={habits}
          year={year}
          month={month}
          byHabit={byHabit}
          onCellClick={handleCellClick}
          todayKey={today}
        />
      )}
    </div>
  );
}

// ─── All Tab ───────────────────────────────────────────────────────────────────

interface AllTabProps {
  onOpenDetail: (habit: HabitRow) => void;
}

type StatusFilter = "active" | "paused" | "archived" | "all";

function AllTab({ onOpenDetail }: AllTabProps): JSX.Element {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const { data, isLoading } = useQuery({
    queryKey: ["habits", statusFilter],
    queryFn: () =>
      statusFilter === "all" ? api.habits({}) : api.habits({ status: statusFilter }),
    staleTime: 30_000,
  });

  const habits = data?.habits ?? [];

  const filterTabs: Array<{ id: StatusFilter; label: string }> = [
    { id: "active", label: "Active" },
    { id: "paused", label: "Paused" },
    { id: "archived", label: "Archived" },
    { id: "all", label: "All" },
  ];

  return (
    <div className="space-y-4">
      {/* Status filter pills */}
      <nav className="flex gap-1.5 overflow-x-auto">
        {filterTabs.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setStatusFilter(f.id)}
            className={cn(
              "inline-flex min-h-8 items-center rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap",
              statusFilter === f.id
                ? "bg-surface-elevated text-fg"
                : "text-fg-muted hover:bg-surface-elevated/40 hover:text-fg",
            )}
          >
            {f.label}
          </button>
        ))}
      </nav>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-surface-elevated" />
          ))}
        </div>
      )}

      {!isLoading && habits.length === 0 && (
        <p className="py-8 text-center text-xs text-fg-faint">
          No {statusFilter === "all" ? "" : statusFilter + " "}habits found.
        </p>
      )}

      {!isLoading && habits.length > 0 && (
        <ul className="space-y-1.5">
          {habits.map((habit) => (
            <li key={habit.id}>
              <button
                type="button"
                onClick={() => onOpenDetail(habit)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border border-border-subtle bg-surface px-3 py-2.5",
                  "text-left transition-colors hover:bg-surface-elevated",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  "focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{habit.title}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-[10px] capitalize text-fg-muted">{habit.cadence}</span>
                    {habit.status !== "active" && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] capitalize",
                          habit.status === "paused"
                            ? "bg-warning-500/10 text-warning-500"
                            : "bg-surface-elevated text-fg-faint",
                        )}
                      >
                        {habit.status}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
