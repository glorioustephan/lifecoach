import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "~/components/ui/Button";
import { compactFormControlClass, formControlClass } from "~/components/ui/formStyles";
import { api, type GoalRow } from "~/lib/api";
import { cn } from "~/lib/cn";

/**
 * Signals-of-progress section rendered below the Overview tab form.
 * Quantitative signals tie to a measurement metric; qualitative signals are
 * sentence-shaped. Lives in its own form because nesting <form> elements
 * inside the Overview <form> is invalid HTML.
 */
export function SignalsSection({ goal }: { goal: GoalRow }): JSX.Element {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["goals", goal.id, "signals"],
    queryFn: () => api.goalSignals(goal.id),
  });

  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"qualitative" | "quantitative">("qualitative");
  const [metric, setMetric] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      api.createGoalSignal(goal.id, {
        label: label.trim(),
        kind,
        ...(kind === "quantitative" && metric.trim() ? { metric: metric.trim() } : {}),
        ...(kind === "quantitative" && targetValue.trim()
          ? { targetValue: Number(targetValue) }
          : {}),
        ...(kind === "quantitative" && unit.trim() ? { unit: unit.trim() } : {}),
      }),
    onSuccess: () => {
      setLabel("");
      setMetric("");
      setTargetValue("");
      setUnit("");
      void qc.invalidateQueries({ queryKey: ["goals", goal.id, "signals"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteGoalSignal(goal.id, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["goals", goal.id, "signals"] }),
  });

  const signals = data?.signals ?? [];

  return (
    <section className="space-y-3 border-t border-border-subtle pt-4">
      <header className="space-y-0.5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-fg-muted">
          Signals of progress
        </h3>
        <p className="text-[11px] text-fg-faint">
          Several per goal. Quantitative signals tie to a measurement metric;
          qualitative signals are sentence-shaped.
        </p>
      </header>

      {isLoading ? (
        <ul className="space-y-1.5">
          {Array.from({ length: 1 }).map((_, i) => (
            <li
              key={i}
              className="h-10 animate-pulse rounded-md border border-border-subtle bg-surface/50"
            />
          ))}
        </ul>
      ) : signals.length === 0 ? (
        <p className="text-[11px] text-fg-faint">No signals yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {signals.map((s) => {
            const hasTarget = s.targetValue !== null && s.targetValue !== undefined;
            const pct =
              hasTarget && s.targetValue
                ? Math.min(
                    100,
                    Math.round(((s.currentValue ?? 0) / s.targetValue) * 100),
                  )
                : null;
            return (
              <li
                key={s.id}
                className="group flex items-start gap-2 rounded-md border border-border-subtle bg-surface px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">{s.label}</p>
                  {s.kind === "quantitative" && s.metric && (
                    <div className="mt-1">
                      <div className="flex justify-between text-[10px] font-mono text-fg-faint">
                        <span>{s.metric}</span>
                        <span>
                          {s.currentValue ?? 0} / {s.targetValue ?? "—"}
                          {s.unit ? ` ${s.unit}` : ""}
                        </span>
                      </div>
                      {pct !== null && (
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-elevated">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              pct === 100 ? "bg-success-500" : "bg-accent",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(s.id)}
                  aria-label={`Delete signal ${s.label}`}
                  className="text-fg-faint opacity-0 transition-opacity hover:text-destructive-300 group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" strokeWidth={1.75} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (label.trim().length === 0) return;
          createMut.mutate();
        }}
        className="space-y-2 rounded-md border border-border-subtle bg-surface px-3 py-3"
      >
        <div className="flex items-center gap-1">
          {(["qualitative", "quantitative"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] uppercase tracking-wide transition-colors",
                kind === k
                  ? "border-accent/60 bg-accent/15 text-fg"
                  : "border-border-subtle bg-surface text-fg-muted hover:border-accent/30",
              )}
            >
              {k}
            </button>
          ))}
        </div>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={
            kind === "qualitative"
              ? "Sentence — what does success read like?"
              : "Short label, e.g. 'Pace under 5:30/km'"
          }
          className={formControlClass("w-full px-2 py-1.5 text-sm")}
        />
        {kind === "quantitative" && (
          <div className="grid grid-cols-3 gap-2">
            <input
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              placeholder="metric"
              className={compactFormControlClass()}
            />
            <input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="target"
              className={compactFormControlClass()}
            />
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="unit"
              className={compactFormControlClass()}
            />
          </div>
        )}
        <div className="flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            type="submit"
            disabled={label.trim().length === 0 || createMut.isPending}
            loading={createMut.isPending}
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
            Add signal
          </Button>
        </div>
      </form>
    </section>
  );
}
