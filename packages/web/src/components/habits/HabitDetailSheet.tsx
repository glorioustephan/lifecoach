/**
 * HabitDetailSheet — per-habit edit sheet with three tabs.
 *
 * Mirrors GoalEditSheet.tsx structure: thin router + tab files.
 * Tabs:
 *   Overview — title, cadence, parent goal/milestone, notes. Save/Archive.
 *   Calendar — MonthNav + HabitCalendar + last 5 completions.
 *   History  — paginated completion log with per-row delete.
 *
 * Resets to Overview whenever a new habit is opened (ADHD-8).
 * Dirty-guard on close uses useConfirmDiscard.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { Sheet, SheetBody, SheetHeader } from "~/components/ui/Sheet";
import { TabNav } from "~/components/ui/TabNav";
import { Button } from "~/components/ui/Button";
import { IconButton } from "~/components/ui/IconButton";
import { formControlClass } from "~/components/ui/formStyles";
import { cn } from "~/lib/cn";
import { toast } from "~/lib/use-toast";
import { useConfirmDiscard } from "~/lib/use-confirm-discard";
import { api, type HabitRow } from "~/lib/api";
import { dateKey, computeStreak } from "~/lib/habit";
import { MonthNav } from "./MonthNav";
import { HabitCalendar } from "./HabitCalendar";

type Tab = "overview" | "calendar" | "history";

interface HabitDetailSheetProps {
  habit: HabitRow | null;
  onClose: () => void;
}

// ─── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  habit,
  onClose,
}: {
  habit: HabitRow;
  onClose: () => void;
}): JSX.Element {
  const qc = useQueryClient();
  const [title, setTitle] = useState(habit.title);
  const [cadence, setCadence] = useState<HabitRow["cadence"]>(habit.cadence);
  const [notes, setNotes] = useState(habit.notes ?? "");
  const [parentGoalId, setParentGoalId] = useState(habit.parentGoalId ?? "");

  const isDirty =
    title.trim() !== habit.title ||
    cadence !== habit.cadence ||
    notes !== (habit.notes ?? "") ||
    parentGoalId !== (habit.parentGoalId ?? "");

  const confirmDiscard = useConfirmDiscard(isDirty);

  // Seed from habit when the detail sheet opens a different habit.
  useEffect(() => {
    setTitle(habit.title);
    setCadence(habit.cadence);
    setNotes(habit.notes ?? "");
    setParentGoalId(habit.parentGoalId ?? "");
  }, [habit.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: goalsData } = useQuery({
    queryKey: ["goals", "active"],
    queryFn: () => api.goals("active"),
    staleTime: 30_000,
  });
  const goals = goalsData?.goals ?? [];

  const saveMut = useMutation({
    mutationFn: () =>
      api.updateHabit(habit.id, {
        title: title.trim(),
        cadence,
        notes: notes.trim() || null,
        parentGoalId: parentGoalId || null,
      }),
    onSuccess: () => {
      toast.success("Saved");
      void qc.invalidateQueries({ queryKey: ["habits"] });
    },
    onError: (err: unknown) => {
      toast.error("Couldn't save", err instanceof Error ? err.message : String(err));
    },
  });

  const archiveMut = useMutation({
    mutationFn: () => api.archiveHabit(habit.id),
    onSuccess: () => {
      toast.success("Archived");
      void qc.invalidateQueries({ queryKey: ["habits"] });
      onClose();
    },
    onError: (err: unknown) => {
      toast.error("Couldn't archive", err instanceof Error ? err.message : String(err));
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saveMut.isPending) return;
    saveMut.mutate();
  };

  const handleClose = () => {
    if (confirmDiscard()) onClose();
  };

  return (
    <form onSubmit={handleSave} className="space-y-4 p-4 md:p-6">
      {/* Title */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-fg-muted" htmlFor="habit-title">
          Title
        </label>
        <input
          id="habit-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className={formControlClass("w-full px-3 py-2 text-sm")}
        />
      </div>

      {/* Cadence */}
      <div className="space-y-1.5">
        <span className="block text-xs font-medium text-fg-muted">Cadence</span>
        <div className="flex gap-2">
          {(["daily", "weekly", "monthly"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCadence(c)}
              className={cn(
                "flex-1 rounded-md border py-2 text-xs capitalize transition-colors",
                cadence === c
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border-subtle text-fg-muted hover:bg-surface-elevated hover:text-fg",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Parent goal */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-fg-muted" htmlFor="habit-goal">
          Parent goal (optional)
        </label>
        <select
          id="habit-goal"
          value={parentGoalId}
          onChange={(e) => setParentGoalId(e.target.value)}
          className={formControlClass("w-full px-2 py-1.5 text-sm")}
        >
          <option value="">None (stand-alone habit)</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-fg-muted" htmlFor="habit-notes">
          Notes (optional)
        </label>
        <textarea
          id="habit-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Context — dose, timing, cues, why this matters…"
          className={formControlClass("w-full resize-none px-3 py-2 text-sm")}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => {
            if (window.confirm("Archive this habit? You can unarchive it from the All tab.")) {
              archiveMut.mutate();
            }
          }}
          disabled={archiveMut.isPending}
          loading={archiveMut.isPending}
        >
          Archive
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleClose}
            disabled={saveMut.isPending}
          >
            Discard
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!isDirty || !title.trim() || saveMut.isPending}
            loading={saveMut.isPending}
          >
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}

// ─── Calendar Tab ──────────────────────────────────────────────────────────────

function CalendarTab({ habit }: { habit: HabitRow }): JSX.Element {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const today = dateKey(now);

  const { data, isLoading } = useQuery({
    queryKey: ["habits", habit.id, "month", year, month],
    queryFn: () => api.habitMonth(habit.id, year, month),
    staleTime: 60_000,
  });

  const completionMap = new Map<string, number>(
    Object.entries(data?.completions ?? {}),
  );

  // Recent completions for the mini-list below the grid.
  const { data: detailData } = useQuery({
    queryKey: ["habits", habit.id],
    queryFn: () => api.habit(habit.id),
    staleTime: 30_000,
  });
  const recentCompletions = detailData?.recentCompletions ?? [];

  const completeMut = useMutation({
    mutationFn: (key: string) => api.completeHabit(habit.id, { date: key }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["habits", habit.id, "month", year, month] });
      void qc.invalidateQueries({ queryKey: ["habits", habit.id] });
      void qc.invalidateQueries({ queryKey: ["habits"] });
      toast.success("Logged");
    },
    onError: (err: unknown) => {
      toast.error("Couldn't log", err instanceof Error ? err.message : String(err));
    },
  });

  return (
    <div className="space-y-4 p-4 md:p-6">
      <MonthNav year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-md bg-surface-elevated" />
      ) : (
        <HabitCalendar
          year={year}
          month={month}
          completions={completionMap}
          todayKey={today}
          habitTitle={habit.title}
          onCellClick={(key) => completeMut.mutate(key)}
        />
      )}

      {/* Recent completions */}
      {recentCompletions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-fg-faint">
            Recent completions
          </p>
          <ul className="space-y-1">
            {recentCompletions.slice(0, 5).map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-xs text-fg-muted"
              >
                <span>
                  {new Date(c.completedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                {c.origin !== "manual" && (
                  <span className="rounded-sm bg-surface-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-fg-faint">
                    {c.origin}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── History Tab ───────────────────────────────────────────────────────────────

function HistoryTab({ habit }: { habit: HabitRow }): JSX.Element {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["habits", habit.id],
    queryFn: () => api.habit(habit.id),
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: (completionId: string) => api.uncompleteHabit(habit.id, completionId),
    onSuccess: () => {
      toast.success("Removed");
      void qc.invalidateQueries({ queryKey: ["habits", habit.id] });
      void qc.invalidateQueries({ queryKey: ["habits"] });
    },
    onError: (err: unknown) => {
      toast.error("Couldn't remove", err instanceof Error ? err.message : String(err));
    },
  });

  const completions = data?.recentCompletions ?? [];

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-surface-elevated" />
        ))}
      </div>
    );
  }

  if (completions.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-xs text-fg-faint">
        No completions yet. Tap the cell on any day to log one.
      </p>
    );
  }

  return (
    <ul className="space-y-1 p-4 md:p-6">
      {completions.map((c) => (
        <li
          key={c.id}
          className="flex items-center justify-between rounded-md border border-border-subtle bg-surface px-3 py-2"
        >
          <div className="flex flex-col">
            <span className="text-xs font-medium text-fg">
              {new Date(c.completedAt).toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            {c.notes && (
              <span className="mt-0.5 text-[11px] text-fg-muted">{c.notes}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {c.origin !== "manual" && (
              <span className="rounded-sm bg-surface-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-fg-faint">
                {c.origin}
              </span>
            )}
            {/* ADHD-6: quick reversal — delete completion to undo logging. */}
            <IconButton
              variant="destructive"
              size="sm"
              aria-label="Delete completion"
              onClick={() => deleteMut.mutate(c.id)}
              disabled={deleteMut.isPending}
            >
              <Trash2 className="size-3.5" strokeWidth={1.75} />
            </IconButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── HabitDetailSheet ─────────────────────────────────────────────────────────

export const HabitDetailSheet = ({
  habit,
  onClose,
}: HabitDetailSheetProps): JSX.Element | null => {
  const [tab, setTab] = useState<Tab>("overview");

  // ADHD-8: Reset to Overview whenever a new habit is opened so the user
  // lands somewhere predictable, not mid-history of the previous habit.
  useEffect(() => {
    if (habit) setTab("overview");
  }, [habit?.id]);

  if (!habit) return null;

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      side="right"
      width="w-full md:w-[560px]"
    >
      <SheetHeader title={habit.title} onClose={onClose} />
      <TabNav<Tab>
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "calendar", label: "Calendar" },
          { id: "history", label: "History" },
        ]}
        active={tab}
        onChange={setTab}
        variant="underline"
        width="none"
      />
      <SheetBody>
        {tab === "overview" && <OverviewTab habit={habit} onClose={onClose} />}
        {tab === "calendar" && <CalendarTab habit={habit} />}
        {tab === "history" && <HistoryTab habit={habit} />}
      </SheetBody>
    </Sheet>
  );
};
