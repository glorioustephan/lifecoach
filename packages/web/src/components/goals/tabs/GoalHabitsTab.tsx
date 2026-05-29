/**
 * GoalHabitsTab — habits tab on the GoalEditSheet.
 * Lists habits where parentGoalId === goal.id.
 * Mirrors EvidenceTab.tsx structure.
 *
 * ADHD-3: Visible next action — each HabitCard shows today's cell.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Plus } from "lucide-react";
import { Button } from "~/components/ui/Button";
import { compactFormControlClass } from "~/components/ui/formStyles";
import { api, type GoalRow, type HabitRow } from "~/lib/api";
import { dateKey, computeStreak, isCadenceDueOn } from "~/lib/habit";
import { HabitCard } from "~/components/habits/HabitCard";
import { HabitDetailSheet } from "~/components/habits/HabitDetailSheet";
import { NewHabitDialog } from "~/components/habits/NewHabitDialog";
import { toast } from "~/lib/use-toast";

export function GoalHabitsTab({ goal }: { goal: GoalRow }): JSX.Element {
  const qc = useQueryClient();
  const [editingHabit, setEditingHabit] = useState<HabitRow | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);

  const today = dateKey(new Date());
  const todayDate = new Date(today + "T00:00:00");
  const now = new Date();
  const calYear = now.getFullYear();
  const calMonth = now.getMonth() + 1;

  // Habits linked to this goal.
  const { data, isLoading } = useQuery({
    queryKey: ["habits", "goal", goal.id],
    queryFn: () => api.habits({ parentGoalId: goal.id }),
    staleTime: 30_000,
  });

  const habits = data?.habits ?? [];
  const habitIds = habits.map((h) => h.id);

  // Batch month data for streak computation.
  const { data: batchData } = useQuery({
    queryKey: ["habits", "month-batch", calYear, calMonth, habitIds.join(",")],
    queryFn: () =>
      habitIds.length > 0
        ? api.habitMonthBatch(habitIds, calYear, calMonth)
        : Promise.resolve({ byHabit: {} }),
    enabled: habitIds.length > 0,
    staleTime: 30_000,
  });

  const byHabit = new Map<string, Map<string, number>>(
    Object.entries((batchData?.byHabit ?? {}) as Record<string, Record<string, number>>).map(
      ([id, dayMap]) => [id, new Map(Object.entries(dayMap))],
    ),
  );

  const handleToggle = async (habit: HabitRow) => {
    await api.completeHabit(habit.id, { date: today });
    void qc.invalidateQueries({ queryKey: ["habits", "goal", goal.id] });
    void qc.invalidateQueries({ queryKey: ["habits", "month-batch"] });
    void qc.invalidateQueries({ queryKey: ["habits"] });
  };

  // "Link existing habit" — fetch all active habits and offer those that
  // aren't already linked to a goal as a single-select.
  const { data: allHabitsData } = useQuery({
    queryKey: ["habits", "active"],
    queryFn: () => api.habits({ status: "active" }),
    staleTime: 30_000,
  });
  const linkableHabits = useMemo(
    () => (allHabitsData?.habits ?? []).filter((h) => !h.parentGoalId),
    [allHabitsData],
  );
  const [pickedHabitId, setPickedHabitId] = useState("");
  const linkMut = useMutation({
    mutationFn: (habitId: string) =>
      api.updateHabit(habitId, { parentGoalId: goal.id }),
    onSuccess: (_data, habitId) => {
      const linked = linkableHabits.find((h) => h.id === habitId);
      toast.success("Habit linked", linked?.title);
      setPickedHabitId("");
      void qc.invalidateQueries({ queryKey: ["habits"] });
    },
    onError: (err: unknown) => {
      toast.error("Couldn't link", err instanceof Error ? err.message : String(err));
    },
  });

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Top actions row: link existing OR create new. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {linkableHabits.length > 0 && (
          <>
            <label htmlFor="link-habit-picker" className="sr-only">
              Link an existing habit to this goal
            </label>
            <select
              id="link-habit-picker"
              value={pickedHabitId}
              onChange={(e) => setPickedHabitId(e.target.value)}
              className={compactFormControlClass("max-w-[14rem]")}
              disabled={linkMut.isPending}
            >
              <option value="">Link existing habit…</option>
              {linkableHabits.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.title}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              size="sm"
              disabled={!pickedHabitId || linkMut.isPending}
              loading={linkMut.isPending}
              onClick={() => linkMut.mutate(pickedHabitId)}
            >
              <Link2 className="size-3.5" strokeWidth={1.75} />
              Link
            </Button>
          </>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setNewDialogOpen(true)}
        >
          <Plus className="size-3.5" strokeWidth={1.75} />
          Create linked habit
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-surface-elevated" />
          ))}
        </div>
      )}

      {!isLoading && habits.length === 0 && (
        <p className="text-xs text-fg-faint">
          No habits linked to this goal yet. Create one above, or pick an
          existing unlinked habit from the dropdown.
        </p>
      )}

      {!isLoading && habits.length > 0 && (
        <ul className="space-y-2">
          {habits.map((habit) => {
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
              <li key={habit.id}>
                <HabitCard
                  habit={habit}
                  todayState={todayState}
                  streak={current}
                  lastCompletedKey={lastCompletedKey}
                  todayKey={today}
                  onToggle={() => void handleToggle(habit)}
                  onOpenDetail={() => setEditingHabit(habit)}
                />
              </li>
            );
          })}
        </ul>
      )}

      <HabitDetailSheet
        habit={editingHabit}
        onClose={() => setEditingHabit(null)}
      />
      <NewHabitDialog
        open={newDialogOpen}
        onClose={() => setNewDialogOpen(false)}
        defaultParentGoalId={goal.id}
      />
    </div>
  );
}
