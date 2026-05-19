import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertCircle, Calendar, Target, CheckCircle2, ScrollText } from "lucide-react";
import { api, type GoalRow } from "~/lib/api";
import { cn } from "~/lib/cn";

/**
 * The morning briefing — a composed panel that pulls from every system that
 * matters for "what to know about today". Sits at the top of the Inbox view
 * above the insight stack. Designed to be glanceable in under 5 seconds.
 */
export const BriefingPanel = (): JSX.Element | null => {
  const { data, isLoading } = useQuery({
    queryKey: ["briefing"],
    queryFn: api.briefing,
    refetchInterval: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="h-32 animate-pulse rounded-md border border-border-subtle bg-surface/50" />
    );
  }
  if (!data) return null;

  const overdueCount = data.tasks.overdue.length;
  const dueTodayCount = data.tasks.dueToday.length;
  const hasTasks = overdueCount + dueTodayCount > 0;
  const goals = data.goals.active;
  const hasGoals = goals.length > 0;
  const reflection = data.reflection;
  const reflectionTitle = extractReflectionTitle(reflection?.body ?? "");

  const greeting = greetingForNow();

  return (
    <section
      aria-label="Morning briefing"
      className="rounded-md border border-border bg-surface px-4 py-4 md:px-5"
    >
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg">{greeting}</h2>
        <span className="font-mono text-[10px] text-fg-faint">
          {new Date(data.generatedAt).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </span>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {/* Today's tasks */}
        <BriefingTile
          icon={<Calendar className="size-4" strokeWidth={1.75} />}
          title="Today"
          empty={!hasTasks}
          emptyText="Nothing on the plate."
          href="/tasks"
        >
          {overdueCount > 0 && (
            <div className="mb-1.5 flex items-center gap-1.5 text-xs">
              <AlertCircle className="size-3 text-destructive-300" strokeWidth={1.75} />
              <span className="text-destructive-300">
                {overdueCount} overdue
              </span>
            </div>
          )}
          <ul className="space-y-1">
            {[...data.tasks.overdue.slice(0, 3), ...data.tasks.dueToday.slice(0, 3)]
              .slice(0, 4)
              .map((t) => (
                <li key={t.id} className="truncate text-xs text-fg">
                  <span className="text-fg-faint">·</span> {t.content}
                </li>
              ))}
          </ul>
          {dueTodayCount + overdueCount > 4 && (
            <p className="mt-1.5 text-[10px] text-fg-faint">
              +{dueTodayCount + overdueCount - 4} more
            </p>
          )}
        </BriefingTile>

        {/* Goals */}
        <BriefingTile
          icon={<Target className="size-4" strokeWidth={1.75} />}
          title="Goals"
          empty={!hasGoals}
          emptyText="No active goals — set one to anchor recommendations."
          href="/goals"
        >
          <ul className="space-y-1.5">
            {goals.slice(0, 3).map((g) => (
              <li key={g.id}>
                <GoalLine goal={g} />
              </li>
            ))}
          </ul>
          {goals.length > 3 && (
            <p className="mt-1.5 text-[10px] text-fg-faint">+{goals.length - 3} more</p>
          )}
        </BriefingTile>
      </div>

      {/* Latest reflection */}
      {reflection && (
        <Link
          to="/memory"
          className="mt-3 flex items-start gap-3 rounded-md border border-border-subtle bg-surface/50 px-3 py-2.5 transition-colors hover:border-accent/40 hover:bg-surface-elevated/40"
        >
          <ScrollText className="mt-0.5 size-4 shrink-0 text-fg-muted" strokeWidth={1.75} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-wide text-fg-faint">
              latest {reflection.kind} reflection
            </p>
            <p className="mt-0.5 truncate text-sm text-fg">{reflectionTitle ?? "Reflection"}</p>
          </div>
        </Link>
      )}
    </section>
  );
};

interface TileProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
  href: string;
}

const BriefingTile = ({ icon, title, children, empty, emptyText, href }: TileProps): JSX.Element => (
  <Link
    to={href}
    className={cn(
      "block rounded-md border border-border-subtle bg-bg px-3 py-2.5 transition-colors",
      "hover:border-accent/40 hover:bg-surface-elevated/30",
    )}
  >
    <header className="mb-2 flex items-center gap-1.5 text-fg-muted">
      {icon}
      <span className="text-[11px] font-medium uppercase tracking-wide">{title}</span>
    </header>
    {empty ? (
      <p className="text-xs text-fg-faint">{emptyText}</p>
    ) : (
      children
    )}
  </Link>
);

const GoalLine = ({ goal }: { goal: GoalRow }): JSX.Element => {
  const hasTarget =
    goal.targetValue !== null && goal.targetValue !== undefined && goal.targetMetric;
  const progressPercent =
    hasTarget && goal.currentProgress !== null && goal.targetValue
      ? Math.min(100, Math.round((goal.currentProgress! / goal.targetValue) * 100))
      : null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs text-fg">{goal.title}</span>
        {hasTarget && (
          <span className="shrink-0 font-mono text-[10px] text-fg-faint">
            {goal.currentProgress ?? 0}/{goal.targetValue}
          </span>
        )}
      </div>
      {hasTarget && (
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-elevated">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              progressPercent === 100 ? "bg-success-500" : "bg-accent",
            )}
            style={{ width: `${progressPercent ?? 0}%` }}
          />
        </div>
      )}
    </div>
  );
};

const greetingForNow = (): string => {
  const hour = new Date().getHours();
  if (hour < 5) return "Late night, James";
  if (hour < 12) return "Good morning, James";
  if (hour < 17) return "Afternoon, James";
  if (hour < 21) return "Evening, James";
  return "Late, James";
};

const extractReflectionTitle = (body: string): string | null => {
  const m = body.match(/^#\s+(.+?)\s*$/m);
  return m?.[1] ?? null;
};

// Re-export the small icon for accessibility in older browsers
export const _CheckCircle2 = CheckCircle2;
