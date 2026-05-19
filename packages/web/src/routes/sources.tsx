import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ViewHeader } from "~/components/ui/ViewHeader";

export const Route = createFileRoute("/sources")({
  component: SourcesRoute,
});

interface Source {
  id: string;
  name: string;
  connected: boolean;
  tasks?: number;
  ingestedFiles?: number;
  watchedPath?: string;
}

function SourcesRoute(): JSX.Element {
  const { data, isLoading } = useQuery<{ sources: Source[] }>({
    queryKey: ["sources"],
    queryFn: async () => {
      const resp = await fetch("/api/sources");
      if (!resp.ok) throw new Error(resp.statusText);
      return resp.json();
    },
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader title="Sources" subtitle="Where your data comes from" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-3 px-4 py-4 md:px-6">
          {isLoading && (
            <>
              <div className="h-24 animate-pulse rounded-md border border-border-subtle bg-surface/50" />
              <div className="h-24 animate-pulse rounded-md border border-border-subtle bg-surface/50" />
              <div className="h-24 animate-pulse rounded-md border border-border-subtle bg-surface/50" />
            </>
          )}
          {!isLoading &&
            data?.sources.map((s) => (
              <div
                key={s.id}
                className="rounded-md border border-border bg-surface p-4"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`size-2 rounded-full ${
                      s.connected ? "bg-success-500" : "bg-neutral-600"
                    }`}
                    aria-hidden
                  />
                  <h2 className="text-sm font-medium text-fg">{s.name}</h2>
                  <span className="ml-auto text-xs text-fg-muted">
                    {s.connected ? "Connected" : "Not configured"}
                  </span>
                </div>
                {s.tasks !== undefined && (
                  <p className="mt-2 text-xs text-fg-muted">
                    {s.tasks} active task{s.tasks === 1 ? "" : "s"} mirrored
                  </p>
                )}
                {s.ingestedFiles !== undefined && (
                  <p className="mt-2 text-xs text-fg-muted">
                    {s.ingestedFiles} file{s.ingestedFiles === 1 ? "" : "s"} ingested
                  </p>
                )}
                {s.watchedPath && (
                  <p className="mt-0.5 font-mono text-[10px] text-fg-faint">
                    {s.watchedPath}
                  </p>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
