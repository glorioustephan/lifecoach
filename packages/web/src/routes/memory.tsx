import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ViewHeader } from "~/components/ui/ViewHeader";

export const Route = createFileRoute("/memory")({
  component: MemoryRoute,
});

interface FactRow {
  id: string;
  category: string;
  subject: string;
  body: string;
  confidence: number;
  validTo: number | null;
}

function MemoryRoute(): JSX.Element {
  const { data, isLoading } = useQuery<{ facts: FactRow[] }>({
    queryKey: ["memory", "facts"],
    queryFn: async () => {
      const resp = await fetch("/api/memory/facts");
      if (!resp.ok) throw new Error(resp.statusText);
      return resp.json();
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader title="Memory" subtitle="What the coach knows about you" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-4 md:px-6">
          {isLoading && (
            <ul className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <li
                  key={i}
                  className="h-14 animate-pulse rounded-md border border-border-subtle bg-surface/50"
                />
              ))}
            </ul>
          )}
          {!isLoading && (data?.facts.length ?? 0) === 0 && (
            <p className="mt-12 text-center text-sm text-fg-muted">
              No facts stored yet. Chat with your coach — facts will land here as
              you share things about yourself.
            </p>
          )}
          {!isLoading && data && data.facts.length > 0 && (
            <ul className="divide-y divide-border-subtle rounded-md border border-border bg-surface">
              {data.facts.slice(0, 100).map((f) => (
                <li key={f.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-fg">{f.subject}</span>
                    <span className="rounded-sm border border-border bg-surface-elevated px-1.5 py-0.5 text-[10px] text-fg-faint">
                      {f.category}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-fg-muted">{f.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
