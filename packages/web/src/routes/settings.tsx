import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "~/lib/api";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { TabNav } from "~/components/ui/TabNav";
import { cn } from "~/lib/cn";
import { formatRelative } from "~/lib/time";

type Tab = "profile" | "sources" | "system" | "archived";

const VALID_TABS: Tab[] = ["profile", "sources", "system", "archived"];

function isValidTab(v: unknown): v is Tab {
  return typeof v === "string" && (VALID_TABS as string[]).includes(v);
}

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: isValidTab(search.tab) ? search.tab : undefined,
  }),
  component: SettingsRoute,
});

function SettingsRoute(): JSX.Element {
  const search = useSearch({ from: "/settings" });
  const [tab, setTab] = useState<Tab>(search.tab ?? "profile");
  const qc = useQueryClient();

  const { data: status } = useQuery({ queryKey: ["status"], queryFn: api.status });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: api.profile });
  const { data: sources } = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const { data: archived } = useQuery({
    queryKey: ["sessions", "archived"],
    queryFn: api.archivedSessions,
  });

  const tabs = [
    { id: "profile" as const, label: "Profile" },
    { id: "sources" as const, label: "Sources" },
    { id: "system" as const, label: "System" },
    { id: "archived" as const, label: "Archived" },
  ];

  const formatValue = (v: unknown): string => {
    // Never surface stored secrets — encrypted-at-rest values (Monarch
    // email/password/MFA) are written as `enc:v1:…`. Show a status instead.
    if (typeof v === "string" && v.startsWith("enc:v1:")) return "Stored";
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "string") return v;
    return JSON.stringify(v);
  };

  /**
   * Turn a storage key into a human label: dotted namespaces become " - "
   * separated segments, snake/kebab and camelCase become spaced words.
   * e.g. "artifacts.auto_extract_enabled" → "Artifacts - Auto extract enabled".
   */
  const humanizeKey = (key: string): string =>
    key
      .split(".")
      .map((segment) =>
        segment
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase → spaced
          .replace(/[_-]+/g, " ") // snake_case / kebab-case → spaces
          .trim()
          .toLowerCase()
          .replace(/^\w/, (c) => c.toUpperCase()),
      )
      .join(" - ");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader title="Settings" />
      <div className="flex-1 overflow-y-auto mobile-safe-bottom">
        <TabNav tabs={tabs} active={tab} onChange={setTab} />
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
                    className="flex flex-col gap-0.5 px-4 py-3 md:grid md:grid-cols-[140px_1fr] md:items-start md:gap-4"
                  >
                    <span className="min-w-0 break-words text-xs text-fg-faint">
                      {humanizeKey(entry.key)}
                    </span>
                    <span className="min-w-0 break-words text-sm text-fg">
                      {formatValue(entry.value)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-border-subtle">
                <ArtifactExtractionSection />
              </div>
            </section>
          )}

          {tab === "sources" && (
            <>
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
              <MonarchConnectionSection />
              <ImportExportSection />
            </>
          )}

          {tab === "system" && (
            <section className="rounded-md border border-border bg-surface">
              <header className="border-b border-border-subtle px-4 py-3">
                <h2 className="text-sm font-medium text-fg">System</h2>
              </header>
              <dl className="divide-y divide-border-subtle">
                <Row k="Version" v={status?.deployment?.gitSha} />
                <Row k="Branch" v={status?.deployment?.gitBranch} />
                <Row k="Built" v={status?.deployment?.builtAt} />
                <Row k="Environment" v={status?.deployment?.environment} />
                <Row k="Data dir" v={status?.deployment?.dataDir} />
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
              {(archived?.sessions.length ?? 0) === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-fg-faint">
                  No archived conversations.
                </p>
              ) : (
                <div className="divide-y divide-border-subtle">
                  {archived?.sessions.map((s) => (
                    <ArchivedSessionRow key={s.id} session={s} qc={qc} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

type Source = NonNullable<Awaited<ReturnType<typeof api.sources>>["sources"]>[number];

function ImportExportSection(): JSX.Element {
  const qc = useQueryClient();
  const [result, setResult] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const importMut = useMutation({
    mutationFn: (files: File[]) => api.importMarkdown(files, (p) => setProgress(p)),
    onMutate: () => {
      setResult(null);
      setProgress({ done: 0, total: 0 });
    },
    onSuccess: (r) => {
      setProgress(null);
      const parts = [`Imported ${r.imported}`, `skipped ${r.skipped} (dupes)`];
      if (r.failed > 0) parts.push(`failed ${r.failed}`);
      setResult(parts.join(" · ") + (r.errors.length > 0 ? ` — ${r.errors[0]}` : ""));
      void qc.invalidateQueries({ queryKey: ["sources"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
    },
    onError: (err: unknown) => {
      setProgress(null);
      setResult(err instanceof Error ? `error: ${err.message}` : "import failed");
    },
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same files
    if (files.length > 0) importMut.mutate(files);
  };

  const btn =
    "cursor-pointer rounded-md border border-border-subtle px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-accent/40 hover:text-fg";

  return (
    <section className="rounded-md border border-border bg-surface">
      <header className="border-b border-border-subtle px-4 py-3">
        <h2 className="text-sm font-medium text-fg">Import / Export</h2>
        <p className="mt-0.5 text-xs text-fg-faint">
          Import a .zip of markdown (e.g. a Capacities export) or a folder of files — each is
          ingested and deduped. Export dumps your documents, conversations, and reflections to a
          markdown zip for backup.
        </p>
      </header>
      <div className="space-y-2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className={cn(btn, importMut.isPending && "pointer-events-none opacity-50")}>
            {importMut.isPending
              ? progress && progress.total > 0
                ? `importing ${progress.done}/${progress.total}…`
                : "importing…"
              : "Import .zip / files"}
            <input
              type="file"
              accept=".zip,.md,.markdown"
              multiple
              className="hidden"
              onChange={onPick}
              disabled={importMut.isPending}
            />
          </label>
          <label className={cn(btn, importMut.isPending && "pointer-events-none opacity-50")}>
            Import folder
            <input
              type="file"
              multiple
              className="hidden"
              onChange={onPick}
              disabled={importMut.isPending}
              {...({ webkitdirectory: "" } as Record<string, string>)}
            />
          </label>
          <a href={api.exportUrl} download className={btn}>
            Export (.zip)
          </a>
        </div>
        {importMut.isPending && (
          <p className="text-[11px] text-fg-muted">
            {progress && progress.total > 0
              ? `Importing ${progress.done} of ${progress.total} files… keep this tab open.`
              : "Reading upload…"}
          </p>
        )}
        {result && <p className="font-mono text-[11px] text-fg-faint">{result}</p>}
      </div>
    </section>
  );
}

// ─── Monarch Money Connection ────────────────────────────────────────────────

function MonarchConnectionSection(): JSX.Element {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["monarch-settings"],
    queryFn: api.monarchSettings,
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.saveMonarchCredentials({
        email: email.trim(),
        password,
        ...(mfaSecret.trim() ? { mfaSecret: mfaSecret.trim() } : {}),
      }),
    onSuccess: () => {
      setFeedback("Connected — credentials verified and stored.");
      setPassword("");
      setMfaSecret("");
      void qc.invalidateQueries({ queryKey: ["monarch-settings"] });
      void qc.invalidateQueries({ queryKey: ["sources"] });
    },
    onError: (err: unknown) => {
      setFeedback(err instanceof Error ? `Error: ${err.message}` : "Failed to connect.");
    },
  });

  const sync = useMutation({
    mutationFn: api.syncMonarch,
    onSuccess: (r) => {
      setFeedback(
        r.skipped
          ? "A sync is already running."
          : r.result
            ? `Synced — ${r.result.accountsUpserted} accounts · ${r.result.transactionsUpserted} transactions · ${r.result.holdingsSnapshotted} holdings.`
            : "Sync complete.",
      );
      void qc.invalidateQueries({ queryKey: ["monarch-settings"] });
      void qc.invalidateQueries({ queryKey: ["finances"] });
      void qc.invalidateQueries({ queryKey: ["sources"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
    },
    onError: (err: unknown) => {
      setFeedback(err instanceof Error ? `Sync failed: ${err.message}` : "Sync failed.");
    },
  });

  const hasCreds = settings?.hasCredentials ?? false;
  const canSave = email.trim().length > 0 && password.length > 0 && !save.isPending;
  const input =
    "w-full rounded-md border border-border-subtle bg-bg px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
  const btn =
    "cursor-pointer rounded-md border border-border-subtle px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-accent/40 hover:text-fg disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <section className="rounded-md border border-border bg-surface">
      <header className="border-b border-border-subtle px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-medium text-fg">Monarch Money</h2>
          <span
            className={cn(
              "text-[11px] uppercase tracking-wide",
              settings?.connected ? "text-success-500" : "text-fg-faint",
            )}
          >
            {settings?.connected ? "connected" : hasCreds ? "needs attention" : "not configured"}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-fg-faint">
          Connect your Monarch Money account to sync accounts, transactions, budgets, and holdings.
          Credentials are encrypted at rest (requires <code>LIFECOACH_SECRET_KEY</code>).
        </p>
        {settings?.lastSyncAt && (
          <p className="mt-1 font-mono text-[10px] text-fg-faint">
            Last sync: {formatRelative(settings.lastSyncAt)}
          </p>
        )}
        {settings?.lastError && !settings.connected && (
          <p className="mt-1 text-[11px] text-warning-200">{settings.lastError}</p>
        )}
      </header>
      <div className="space-y-2.5 px-4 py-3">
        <div className="space-y-2">
          <input
            type="email"
            autoComplete="off"
            placeholder="Monarch email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={input}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={hasCreds ? "Password (••••••, enter to replace)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
          <input
            type="password"
            autoComplete="off"
            placeholder="MFA secret (optional, TOTP key)"
            value={mfaSecret}
            onChange={(e) => setMfaSecret(e.target.value)}
            className={input}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => save.mutate()} disabled={!canSave} className={btn}>
            {save.isPending ? "Connecting…" : "Save & Connect"}
          </button>
          {hasCreds && (
            <button
              type="button"
              onClick={() => sync.mutate()}
              disabled={sync.isPending}
              className={btn}
            >
              {sync.isPending ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>
        {hasCreds && (
          <p className="text-[11px] text-fg-faint">
            Credentials are saved (encrypted). “Sync now” uses the stored login — you don’t need to
            re-enter anything. The fields above are only for updating them.
          </p>
        )}
        {feedback && <p className="font-mono text-[11px] text-fg-faint">{feedback}</p>}
      </div>
    </section>
  );
}

function SourceRow({ source }: { source: Source }): JSX.Element {
  const qc = useQueryClient();
  const [lastResult, setLastResult] = useState<string | null>(null);

  const sync = useMutation({
    mutationFn: async () => {
      if (source.id === "todoist") {
        const { result } = await api.syncTodoist();
        return `${result.upserted} upserted · ${result.newlyCompleted} completed · ${result.embedded} embedded`;
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

  // Capacities is no longer mirrored (the API only exposes titles), so it's
  // status-only like Google Calendar/Gmail — only Todoist still syncs here.
  const canSync = source.connected && source.id === "todoist";
  const counts: string[] = [];
  if (typeof source.tasks === "number") counts.push(`${source.tasks} tasks`);
  if (typeof source.ingestedFiles === "number") counts.push(`${source.ingestedFiles} files`);

  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">{source.name}</p>
          <p
            className={cn(
              "mt-1 text-[11px] uppercase tracking-wide",
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
    <div className="flex flex-col gap-1 px-4 py-4 md:grid md:grid-cols-[140px_1fr] md:items-start md:gap-4">
      <label htmlFor="artifact-extract-label" className="text-xs text-fg-faint">
        Daily auto-extraction
      </label>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p id="artifact-extract-label" className="text-sm text-fg">Daily auto-extraction</p>
            <p className="mt-1 text-xs text-fg-muted">
              Scans recent conversations each day and saves new recipes &amp; artifacts automatically.
            </p>
            {settings?.autoDisabled && (
              <p className="mt-2 text-[11px] text-warning-200">
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
    </div>
  );
}

type ArchivedSession = NonNullable<
  Awaited<ReturnType<typeof api.archivedSessions>>["sessions"]
>[number];

function ArchivedSessionRow({
  session,
  qc,
}: {
  session: ArchivedSession;
  qc: ReturnType<typeof useQueryClient>;
}): JSX.Element {
  const unarchive = useMutation({
    mutationFn: () => api.unarchiveSession(session.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  const label = session.summary ?? session.preview ?? "(empty conversation)";

  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-fg">{label}</p>
        <p className="mt-1 text-xs text-fg-faint">
          Archived {formatRelative(session.archivedAt ?? 0)} · {session.messageCount} messages
        </p>
      </div>
      <button
        type="button"
        onClick={() => unarchive.mutate()}
        disabled={unarchive.isPending}
        className="shrink-0 rounded-md border border-border-subtle px-2.5 py-1 text-xs text-fg-muted transition-colors hover:border-accent/40 hover:text-fg disabled:opacity-50"
      >
        {unarchive.isPending ? "Restoring…" : "Restore"}
      </button>
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: unknown }): JSX.Element => (
  <div className="flex flex-col gap-0.5 px-4 py-3 md:grid md:grid-cols-[140px_1fr] md:items-start md:gap-4">
    <dt className="text-xs text-fg-faint">{k}</dt>
    <dd className="text-sm text-fg">{String(v ?? "—")}</dd>
  </div>
);
