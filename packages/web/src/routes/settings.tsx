import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "~/lib/api";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { TabNav } from "~/components/ui/TabNav";
import { cn } from "~/lib/cn";
import { formatRelative } from "~/lib/time";

type Tab = "profile" | "sources" | "system" | "archived";

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
});

function SettingsRoute(): JSX.Element {
  const [tab, setTab] = useState<Tab>("profile");

  const { data: status } = useQuery({ queryKey: ["status"], queryFn: api.status });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: api.profile });
  const { data: sources } = useQuery({ queryKey: ["sources"], queryFn: api.sources });

  const tabs = [
    { id: "profile" as const, label: "Profile" },
    { id: "sources" as const, label: "Sources" },
    { id: "system" as const, label: "System" },
    { id: "archived" as const, label: "Archived" },
  ];

  const formatValue = (v: unknown): string => {
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "string") return v;
    return JSON.stringify(v);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader title="Settings" />
      <TabNav
        tabs={tabs}
        active={tab}
        onChange={setTab}
        variant="pill"
      />
      <div className="flex-1 overflow-y-auto mobile-safe-bottom">
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-4 md:px-6">
          {tab === "profile" && (
            <section className="rounded-md border border-border bg-surface">
              <header className="border-b border-border-subtle px-4 py-3">
                <h2 className="text-sm font-medium text-fg">Profile</h2>
              </header>
              <div className="divide-y divide-border-subtle">
                {(profile?.profile ?? []).length === 0 && (
                  <p className="px-4 py-6 text-center text-xs text-fg-faint">
                    Profile is empty. Tell your coach about yourself in chat.
                  </p>
                )}
                {(profile?.profile ?? []).map((entry) => (
                  <div
                    key={entry.key}
                    className="grid grid-cols-[max-content_1fr] items-center gap-3 px-4 py-3"
                  >
                    <span className="text-xs uppercase tracking-wide text-fg-faint">
                      {entry.key}
                    </span>
                    <span className="break-words text-sm text-fg">
                      {formatValue(entry.value)}
                    </span>
                  </div>
                ))}
              </div>
              <ArtifactExtractionSection />
            </section>
          )}

          {tab === "sources" && (
            <section className="rounded-md border border-border bg-surface">
              <header className="border-b border-border-subtle px-4 py-3">
                <h2 className="text-sm font-medium text-fg">Sources</h2>
              </header>
              <div className="divide-y divide-border-subtle">
                {(sources?.sources ?? []).map((s) => (
                  <SourceRow key={s.id} source={s} />
                ))}
              </div>
            </section>
          )}

          {tab === "system" && (
            <section className="rounded-md border border-border bg-surface">
              <header className="border-b border-border-subtle px-4 py-3">
                <h2 className="text-sm font-medium text-fg">System</h2>
              </header>
              <dl className="divide-y divide-border-subtle">
                <Row k="Model" v={status?.model} />
                <Row
                  k="Embedder"
                  v={`${status?.embedder.enabled ? "on" : "off"} (dim ${status?.embedder.dim ?? "—"})`}
                />
                <Row k="Todoist" v={status?.todoist ? "connected" : "not configured"} />
                <Row k="Capacities" v={status?.capacities ? "connected" : "not configured"} />
                <Row k="Facts" v={status?.counts.facts ?? "—"} />
                <Row k="Documents" v={status?.counts.documents ?? "—"} />
                <Row k="Measurements" v={status?.counts.measurements ?? "—"} />
                <Row k="Active tasks" v={status?.counts.activeTasks ?? "—"} />
                <Row k="Sessions" v={status?.counts.sessions ?? "—"} />
                <Row k="Messages" v={status?.counts.messages ?? "—"} />
                <Row k="Artifacts" v={status?.counts.artifacts ?? "—"} />
              </dl>
            </section>
          )}

          {tab === "archived" && (
            <section className="rounded-md border border-border bg-surface">
              <header className="border-b border-border-subtle px-4 py-3">
                <h2 className="text-sm font-medium text-fg">Archived Conversations</h2>
              </header>
              <p className="px-4 py-6 text-center text-xs text-fg-faint">
                No archived conversations yet.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

type Source = NonNullable<Awaited<ReturnType<typeof api.sources>>["sources"]>[number];

function SourceRow({ source }: { source: Source }): JSX.Element {
  const qc = useQueryClient();
  const [lastResult, setLastResult] = useState<string | null>(null);

  const sync = useMutation({
    mutationFn: async () => {
      if (source.id === "todoist") {
        const { result } = await api.syncTodoist();
        return `${result.upserted} upserted · ${result.newlyCompleted} completed · ${result.embedded} embedded`;
      }
      if (source.id === "capacities") {
        const { result } = await api.syncCapacities();
        return `${result.spacesScanned} spaces · ${result.objectsDiscovered} objects · ${result.upserted} upserted · ${result.factsRouted}+${result.projectsRouted} type-routed`;
      }
      throw new Error(`No sync for source ${source.id}`);
    },
    onSuccess: (msg) => {
      setLastResult(msg);
      void qc.invalidateQueries({ queryKey: ["sources"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
    },
    onError: (err: unknown) => {
      setLastResult(err instanceof Error ? `error: ${err.message}` : "sync failed");
    },
  });

  const canSync =
    source.connected && (source.id === "todoist" || source.id === "capacities");
  const counts: string[] = [];
  if (typeof source.tasks === "number") counts.push(`${source.tasks} tasks`);
  if (typeof source.ingestedFiles === "number") counts.push(`${source.ingestedFiles} files`);
  if (typeof source.mirroredObjects === "number") {
    counts.push(`${source.mirroredObjects} mirrored`);
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">{source.name}</p>
          <p
            className={cn(
              "mt-0.5 text-[11px] uppercase tracking-wide",
              source.connected ? "text-success-500" : "text-fg-faint",
            )}
          >
            {source.connected ? "connected" : "not configured"}
            {counts.length > 0 ? ` · ${counts.join(" · ")}` : ""}
          </p>
        </div>
        {canSync && (
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className={cn(
              "rounded-md border border-border-subtle px-2.5 py-1 text-xs text-fg-muted",
              "transition-colors hover:border-accent/40 hover:text-fg",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {sync.isPending ? "syncing…" : "Sync"}
          </button>
        )}
      </div>
      {lastResult && (
        <p className="mt-1 font-mono text-[10px] text-fg-faint">{lastResult}</p>
      )}
      {source.id === "capacities" && source.connected && !source.defaultSpaceId && (
        <p className="mt-1 text-[10px] text-fg-faint">
          Set <code>CAPACITIES_DEFAULT_SPACE_ID</code> to enable reflection write-back and
          save-to-daily-note tools.
        </p>
      )}
    </div>
  );
}

// ─── Artifact Extraction Section ─────────────────────────────────────────────

function ArtifactExtractionSection(): JSX.Element {
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["artifact-settings"],
    queryFn: api.artifactSettings,
  });

  const settings = data?.settings;

  const toggle = useMutation({
    mutationFn: (next: boolean) => api.setArtifactAutoExtract(next),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["artifact-settings"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
    },
  });

  const enabled = settings?.enabled ?? false;

  return (
    <section className="rounded-md border border-border bg-surface">
      <header className="border-b border-border-subtle px-4 py-3">
        <h2 className="text-sm font-medium text-fg">Artifact extraction</h2>
      </header>
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p id="artifact-extract-label" className="text-sm text-fg">Daily auto-extraction</p>
            <p className="mt-0.5 text-xs text-fg-muted">
              Scans recent conversations each day and saves new recipes &amp; artifacts automatically.
            </p>
            {settings?.autoDisabled && (
              <p className="mt-1.5 text-[11px] text-warning-200">
                Paused automatically after 5 empty runs. Toggle on to resume.
              </p>
            )}
            {settings?.lastScanAt && (
              <p className="mt-1 font-mono text-[10px] text-fg-faint">
                Last scan: {formatRelative(settings.lastScanAt)}
              </p>
            )}
          </div>
          {/* Toggle pill */}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-labelledby="artifact-extract-label"
            onClick={() => toggle.mutate(!enabled)}
            disabled={toggle.isPending}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
              enabled ? "bg-accent" : "bg-surface-elevated",
              toggle.isPending && "opacity-60 cursor-not-allowed",
            )}
          >
            <span className="sr-only">{enabled ? "Disable" : "Enable"} daily auto-extraction</span>
            <span
              className={cn(
                "pointer-events-none inline-block size-4 rounded-full bg-bg shadow-sm ring-0 transition-transform",
                enabled ? "translate-x-4" : "translate-x-0",
              )}
            />
          </button>
        </div>
      </div>
    </section>
  );
}

const Row = ({ k, v }: { k: string; v: unknown }): JSX.Element => (
  <div className="grid grid-cols-[max-content_1fr] items-center gap-3 px-4 py-2.5">
    <dt className="text-xs uppercase tracking-wide text-fg-faint">{k}</dt>
    <dd className="text-sm text-fg">{String(v ?? "—")}</dd>
  </div>
);
