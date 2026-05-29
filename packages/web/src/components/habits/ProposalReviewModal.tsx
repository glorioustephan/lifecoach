/**
 * ProposalReviewModal — bulk-create habits and tasks from agent proposals.
 *
 * Opens when the user clicks "Create N items" on an assistant message that
 * called propose_actionable_items. Each candidate can be reviewed, edited,
 * and individually checked/unchecked before confirming.
 *
 * Design principles cited inline:
 *  ADHD-2: Progressive disclosure — rationale and notes start collapsed.
 *  ADHD-6: Quick reversal — toast includes Undo / View CTA after success.
 *  ADHD-9: One required field per step — title is the only non-optional field.
 *  ADHD-10: Predictable interaction surfaces — same gesture (click) = toggle.
 */
import { useState, useCallback, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, X } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "~/components/ui/Button";
import { cn } from "~/lib/cn";
import { formControlClass, compactFormControlClass } from "~/components/ui/formStyles";
import { toast } from "~/lib/use-toast";
import { api } from "~/lib/api";
import type { GoalRow } from "~/lib/api";

// ── Candidate types ───────────────────────────────────────────────────────────

export interface HabitCandidate {
  type: "habit";
  title: string;
  cadence: "daily" | "weekly" | "monthly";
  rationale?: string;
  notes?: string;
}

export interface TaskCandidate {
  type: "task";
  title: string;
  dueAt?: string;
  rationale?: string;
  notes?: string;
}

// ── Component props ───────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  candidates: Array<HabitCandidate | TaskCandidate>;
  parentGoalSuggestion?: {
    title: string;
    kind: "outcome" | "process" | "identity";
    rationale?: string;
  };
  sessionId?: string;
}

// ── Editable candidate state ──────────────────────────────────────────────────

interface EditableCandidate {
  original: HabitCandidate | TaskCandidate;
  title: string;
  cadence: "daily" | "weekly" | "monthly";
  dueAt: string;
  checked: boolean;
}

const toEditable = (c: HabitCandidate | TaskCandidate): EditableCandidate => ({
  original: c,
  title: c.title,
  cadence: c.type === "habit" ? c.cadence : "daily",
  dueAt: c.type === "task" && c.dueAt ? c.dueAt : "",
  checked: true,
});

// ── CandidateCard ─────────────────────────────────────────────────────────────

interface CandidateCardProps {
  candidate: EditableCandidate;
  index: number;
  onChange: (index: number, patch: Partial<EditableCandidate>) => void;
}

const CandidateCard = ({ candidate, index, onChange }: CandidateCardProps): JSX.Element => {
  const [editingTitle, setEditingTitle] = useState(false);
  const rationale =
    "rationale" in candidate.original ? candidate.original.rationale : undefined;
  const notes = "notes" in candidate.original ? candidate.original.notes : undefined;

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        candidate.checked
          ? "border-border bg-surface-elevated"
          : "border-border-subtle bg-surface opacity-50",
      )}
    >
      <div className="flex items-start gap-2">
        {/* ADHD-10: tap-to-toggle checkbox */}
        <input
          type="checkbox"
          checked={candidate.checked}
          onChange={(e) => onChange(index, { checked: e.target.checked })}
          aria-label={`Include "${candidate.title}"`}
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-accent"
        />

        <div className="min-w-0 flex-1">
          {/* Type pill */}
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                candidate.original.type === "habit"
                  ? "bg-accent/15 text-accent"
                  : "bg-warning-500/15 text-warning-500",
              )}
            >
              {candidate.original.type}
            </span>
          </div>

          {/* Title — inline editable on click (ADHD-9: edit in context, no separate form) */}
          {editingTitle ? (
            <input
              type="text"
              value={candidate.title}
              onChange={(e) => onChange(index, { title: e.target.value })}
              onBlur={() => setEditingTitle(false)}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className={compactFormControlClass("w-full text-sm font-medium")}
              aria-label="Edit title"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingTitle(true)}
              className="w-full cursor-text text-left text-sm font-medium text-fg"
            >
              {candidate.title}
            </button>
          )}

          {/* Cadence / dueAt editor */}
          <div className="mt-1.5">
            {candidate.original.type === "habit" ? (
              <select
                value={candidate.cadence}
                onChange={(e) =>
                  onChange(index, {
                    cadence: e.target.value as "daily" | "weekly" | "monthly",
                  })
                }
                className={compactFormControlClass("pr-6 text-xs")}
                aria-label="Cadence"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            ) : (
              <input
                type="date"
                value={candidate.dueAt}
                onChange={(e) => onChange(index, { dueAt: e.target.value })}
                className={compactFormControlClass("text-xs")}
                aria-label="Due date (optional)"
              />
            )}
          </div>

          {/* ADHD-2: progressive disclosure for rationale and notes */}
          {(rationale || notes) && (
            <Collapsible.Root className="mt-2">
              <Collapsible.Trigger className="flex items-center gap-1 text-[11px] text-fg-faint hover:text-fg-muted transition-colors">
                <ChevronDown className="size-3 transition-transform [[data-state=open]_&]:rotate-180" strokeWidth={1.75} />
                Why this?
              </Collapsible.Trigger>
              <Collapsible.Content className="mt-1.5 space-y-1">
                {rationale && (
                  <p className="text-xs text-fg-muted leading-relaxed">{rationale}</p>
                )}
                {notes && (
                  <p className="text-xs text-fg-faint leading-relaxed italic">{notes}</p>
                )}
              </Collapsible.Content>
            </Collapsible.Root>
          )}
        </div>
      </div>
    </div>
  );
};

// ── ProposalReviewModal ───────────────────────────────────────────────────────

export const ProposalReviewModal = ({
  open,
  onClose,
  candidates,
  parentGoalSuggestion,
  sessionId: _sessionId,
}: Props): JSX.Element => {
  const qc = useQueryClient();
  const navigate = useNavigate();

  // ── Editable state ──────────────────────────────────────────────────────────
  const [editables, setEditables] = useState<EditableCandidate[]>(() =>
    candidates.map(toEditable),
  );

  // Re-initialize when candidates prop changes (new message opens modal).
  // We use a memo key instead of an effect to avoid double-render.
  const candidatesKey = candidates.map((c) => c.title).join("|");
  useMemo(() => {
    setEditables(candidates.map(toEditable));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidatesKey]);

  const handleChange = useCallback(
    (index: number, patch: Partial<EditableCandidate>) => {
      setEditables((prev) =>
        prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
      );
    },
    [],
  );

  const checkedItems = editables.filter((e) => e.checked);
  const checkedCount = checkedItems.length;

  // ── Goal grouping state (ADHD-2: progressive disclosure) ───────────────────
  const [goalDisclosureOpen, setGoalDisclosureOpen] = useState(false);
  const [createNewGoal, setCreateNewGoal] = useState(!!parentGoalSuggestion);
  const [newGoalTitle, setNewGoalTitle] = useState(parentGoalSuggestion?.title ?? "");
  const [newGoalKind, setNewGoalKind] = useState<"outcome" | "process" | "identity">(
    parentGoalSuggestion?.kind ?? "process",
  );
  const [selectedGoalId, setSelectedGoalId] = useState<string>("");

  // Load active goals for the typeahead picker.
  const { data: goalsData } = useQuery({
    queryKey: ["goals", "active"],
    queryFn: () => api.goals("active"),
    enabled: goalDisclosureOpen && !createNewGoal,
    staleTime: 30_000,
  });
  const activeGoals: GoalRow[] = goalsData?.goals ?? [];

  // ── Bulk-create mutation ────────────────────────────────────────────────────
  const bulkCreate = useMutation({
    mutationFn: () => {
      const items = checkedItems.map((e) => {
        if (e.original.type === "habit") {
          return {
            type: "habit" as const,
            title: e.title,
            cadence: e.cadence,
            ...(e.original.notes ? { notes: e.original.notes } : {}),
          };
        }
        return {
          type: "task" as const,
          title: e.title,
          ...(e.dueAt ? { dueAt: new Date(e.dueAt).getTime() } : {}),
          ...(e.original.notes ? { notes: e.original.notes } : {}),
        };
      });

      const payload: Parameters<typeof api.proposeBulk>[0] = { items };
      if (createNewGoal && newGoalTitle.trim()) {
        payload.goalToCreate = {
          title: newGoalTitle.trim(),
          kind: newGoalKind,
        };
      } else if (!createNewGoal && selectedGoalId) {
        payload.parentGoalId = selectedGoalId;
      }

      return api.proposeBulk(payload);
    },
    onSuccess: (result) => {
      const habitCount = result.habits.length;
      const taskCount = result.tasks.length;
      const parts: string[] = [];
      if (habitCount > 0) parts.push(`${habitCount} habit${habitCount !== 1 ? "s" : ""}`);
      if (taskCount > 0) parts.push(`${taskCount} task${taskCount !== 1 ? "s" : ""}`);
      const summary = parts.join(", ");
      const goalName = result.goal?.title;

      // ADHD-6: quick reversal — toast includes a View CTA.
      toast({
        title: `Created ${summary}${goalName ? ` under "${goalName}"` : ""}`,
        variant: "success",
        action: {
          label: "View",
          onClick: () => void navigate({ to: "/habits" }),
        },
      });

      void qc.invalidateQueries({ queryKey: ["habits"] });
      void qc.invalidateQueries({ queryKey: ["tasks"] });
      void qc.invalidateQueries({ queryKey: ["goals"] });

      onClose();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      // ADHD-6: keep modal open on failure so the user can retry.
      toast.error("Couldn't create items", message);
    },
  });

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (checkedCount === 0 || bulkCreate.isPending) return;
    bulkCreate.mutate();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-[1px]" />
        <Dialog.Content
          className={cn(
            "fixed inset-0 z-50 flex items-center justify-center p-4 outline-none",
          )}
          onClick={() => onClose()}
        >
          {/* Stop click propagation from the panel to the overlay close */}
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-xl",
              "border border-border bg-surface shadow-2xl",
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <Dialog.Title className="text-base font-semibold text-fg">
                Review {checkedCount} item{checkedCount !== 1 ? "s" : ""}
              </Dialog.Title>
              {/* Visually-hidden description satisfies Radix's aria-describedby
                  requirement on DialogContent without adding visual clutter. */}
              <Dialog.Description className="sr-only">
                Review the agent's recommended habits and tasks. Edit titles or
                cadence inline, optionally group them under a goal, then create
                the selected items in one step.
              </Dialog.Description>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex size-7 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-surface-elevated hover:text-fg"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* Candidate list — all checked by default (ADHD-10: default to action) */}
              <div className="space-y-2">
                {editables.map((c, i) => (
                  <CandidateCard
                    key={i}
                    candidate={c}
                    index={i}
                    onChange={handleChange}
                  />
                ))}
              </div>

              {/* ADHD-2: "Group under a goal" is a collapsible disclosure */}
              <Collapsible.Root
                open={goalDisclosureOpen}
                onOpenChange={setGoalDisclosureOpen}
                className="mt-4"
              >
                <Collapsible.Trigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-fg-muted transition-colors hover:bg-surface-elevated hover:text-fg">
                  <ChevronDown
                    className={cn(
                      "size-4 transition-transform",
                      goalDisclosureOpen && "rotate-180",
                    )}
                    strokeWidth={1.75}
                  />
                  Group these under a goal?
                  {(createNewGoal && newGoalTitle) || selectedGoalId ? (
                    <span className="ml-auto text-xs text-accent">
                      {createNewGoal
                        ? `New: ${newGoalTitle}`
                        : activeGoals.find((g) => g.id === selectedGoalId)?.title ?? ""}
                    </span>
                  ) : null}
                </Collapsible.Trigger>

                <Collapsible.Content className="mt-2 rounded-lg border border-border-subtle bg-surface p-3">
                  {/* Toggle: create new vs pick existing */}
                  <div className="mb-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCreateNewGoal(true)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs transition-colors",
                        createNewGoal
                          ? "bg-accent text-accent-fg"
                          : "border border-border text-fg-muted hover:bg-surface-elevated",
                      )}
                    >
                      Create new
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateNewGoal(false)}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-xs transition-colors",
                        !createNewGoal
                          ? "bg-accent text-accent-fg"
                          : "border border-border text-fg-muted hover:bg-surface-elevated",
                      )}
                    >
                      Pick existing
                    </button>
                  </div>

                  {createNewGoal ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={newGoalTitle}
                        onChange={(e) => setNewGoalTitle(e.target.value)}
                        placeholder="Goal title"
                        className={formControlClass("w-full px-3 py-1.5 text-sm")}
                        aria-label="New goal title"
                      />
                      <select
                        value={newGoalKind}
                        onChange={(e) =>
                          setNewGoalKind(e.target.value as typeof newGoalKind)
                        }
                        className={formControlClass("w-full px-2 py-1.5 text-sm")}
                        aria-label="Goal kind"
                      >
                        <option value="process">Process goal (metric / habit cluster)</option>
                        <option value="outcome">Outcome goal (bounded, has a due date)</option>
                        <option value="identity">Identity goal (vote accumulation)</option>
                      </select>
                      {parentGoalSuggestion?.rationale && (
                        <p className="text-xs text-fg-faint leading-relaxed">
                          {parentGoalSuggestion.rationale}
                        </p>
                      )}
                    </div>
                  ) : (
                    <select
                      value={selectedGoalId}
                      onChange={(e) => setSelectedGoalId(e.target.value)}
                      className={formControlClass("w-full px-2 py-1.5 text-sm")}
                      aria-label="Select existing goal"
                    >
                      <option value="">No goal (stand-alone)</option>
                      {activeGoals.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                    </select>
                  )}
                </Collapsible.Content>
              </Collapsible.Root>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onClose}
                disabled={bulkCreate.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={checkedCount === 0 || bulkCreate.isPending}
                loading={bulkCreate.isPending}
              >
                Create {checkedCount} item{checkedCount !== 1 ? "s" : ""}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
