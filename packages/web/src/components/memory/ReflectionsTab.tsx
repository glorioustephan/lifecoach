import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { PaginationNav } from "~/components/ui/PaginationNav";
import { Button } from "~/components/ui/Button";
import { api, type ReflectionRow } from "~/lib/api";
import { formatRelative } from "~/lib/time";
import { toast } from "~/lib/use-toast";
import { Markdown } from "~/components/chat/Markdown";

const REFLECTIONS_PAGE_SIZE = 10;

const KIND_LABEL: Record<ReflectionRow["kind"], string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

/**
 * Reflections tab of the Memory route — generate-on-demand bar + paginated
 * list of past reflections. Extracted from routes/memory.tsx (Wave 5.4).
 */
export function ReflectionsTab({
  page,
  onPageChange,
}: {
  page: number;
  onPageChange: (p: number) => void;
}): JSX.Element {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ reflections: ReflectionRow[]; total: number }>({
    queryKey: ["memory", "reflections", page],
    queryFn: async () => {
      const resp = await fetch(`/api/memory/reflections?page=${page}&limit=${REFLECTIONS_PAGE_SIZE}`);
      if (!resp.ok) throw new Error(resp.statusText);
      return resp.json();
    },
  });

  const totalPages = Math.ceil((data?.total ?? 0) / REFLECTIONS_PAGE_SIZE);
  const itemsShown = data?.reflections.length ?? 0;
  const totalItems = data?.total ?? 0;

  const generate = useMutation({
    mutationFn: (kind: "daily" | "weekly" | "monthly") => api.generateReflection(kind),
    onSuccess: (_data, kind) => {
      void qc.invalidateQueries({ queryKey: ["memory", "reflections"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
      toast.success(`${KIND_LABEL[kind]} reflection ready`);
    },
    onError: (err: unknown) => {
      toast.error("Reflection failed", err instanceof Error ? err.message : String(err));
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-4 py-3">
        <Sparkles className="size-4 text-accent" strokeWidth={1.75} />
        <span className="mr-auto text-sm font-medium text-fg">Generate a reflection</span>
        {(["daily", "weekly", "monthly"] as const).map((k) => (
          <Button
            key={k}
            variant="secondary"
            size="sm"
            onClick={() => generate.mutate(k)}
            disabled={generate.isPending}
            loading={generate.isPending && generate.variables === k}
          >
            {generate.isPending && generate.variables === k ? "reflecting…" : KIND_LABEL[k]}
          </Button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-md border border-border-subtle bg-surface/50"
            />
          ))}
        </div>
      )}

      {!isLoading && totalItems === 0 && (
        <p className="mt-8 text-center text-sm text-fg-muted">
          No reflections yet. Generate one above — it'll synthesize your recent
          conversations, completed tasks, new facts, and measurements into a
          structured summary.
        </p>
      )}

      {!isLoading && data && data.reflections.length > 0 && (
        <>
          <div className="space-y-3">
            {data.reflections.map((r) => (
              <ReflectionCard key={r.id} reflection={r} />
            ))}
          </div>
          <div className="mt-6">
            <PaginationNav
              currentPage={page}
              totalPages={totalPages}
              itemsShown={itemsShown}
              totalItems={totalItems}
              onLoadMore={() => onPageChange(page + 1)}
              isLoading={isLoading}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ReflectionCard({ reflection }: { reflection: ReflectionRow }): JSX.Element {
  const start = new Date(reflection.period_start);
  const end = new Date(reflection.period_end);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const rangeLabel = sameDay
    ? start.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} → ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  return (
    <article className="rounded-md border border-border bg-surface px-5 py-4">
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-sm border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-accent">
            {KIND_LABEL[reflection.kind]}
          </span>
          <span className="text-xs text-fg-muted">{rangeLabel}</span>
        </div>
        <span className="font-mono text-[10px] text-fg-faint">
          {formatRelative(reflection.created_at)}
        </span>
      </header>
      <div className="text-sm text-fg [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:text-xs [&_h2]:uppercase [&_h2]:tracking-wide [&_h2]:text-fg-faint">
        <Markdown>{reflection.body}</Markdown>
      </div>
    </article>
  );
}
