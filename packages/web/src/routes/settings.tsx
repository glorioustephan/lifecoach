import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { api } from "~/lib/api";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { TabNav } from "~/components/ui/TabNav";
import { cn } from "~/lib/cn";
import { useTheme } from "~/lib/theme";
import { ImportExportSection } from "~/components/settings/ImportExportSection";
import { MonarchConnectionSection } from "~/components/settings/MonarchConnectionSection";
import { SourceRow } from "~/components/settings/SourceRow";
import { ArtifactExtractionSection } from "~/components/settings/ArtifactExtractionSection";
import { ArchivedSessionRow } from "~/components/settings/ArchivedSessionRow";

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
  const { theme, setTheme } = useTheme();

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
          .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
          .replace(/[_-]+/g, " ")
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
            <>
              <section className="rounded-md border border-border bg-surface">
                <header className="border-b border-border-subtle px-4 py-3">
                  <h2 className="text-sm font-medium text-fg">Appearance</h2>
                </header>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm text-fg">Theme</div>
                    <div className="text-xs text-fg-faint">
                      {theme === "dark" ? "Dark mode" : "Light mode"}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={theme === "dark"}
                    aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className={cn(
                      "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
                      theme === "dark"
                        ? "border-accent/40 bg-accent/15"
                        : "border-border bg-surface-elevated",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "inline-flex size-5 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform duration-200 ease-out",
                        theme === "dark" ? "translate-x-[22px]" : "translate-x-0.5",
                      )}
                    >
                      {theme === "dark" ? (
                        <Moon className="size-3" strokeWidth={2} />
                      ) : (
                        <Sun className="size-3" strokeWidth={2} />
                      )}
                    </span>
                  </button>
                </div>
              </section>

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
            </>
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
                    <ArchivedSessionRow key={s.id} session={s} />
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

const Row = ({ k, v }: { k: string; v: unknown }): JSX.Element => (
  <div className="flex flex-col gap-0.5 px-4 py-3 md:grid md:grid-cols-[140px_1fr] md:items-start md:gap-4">
    <dt className="text-xs text-fg-faint">{k}</dt>
    <dd className="text-sm text-fg">{String(v ?? "—")}</dd>
  </div>
);
