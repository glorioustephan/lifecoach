import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "~/lib/api";
import { ViewHeader } from "~/components/ui/ViewHeader";

export const Route = createFileRoute("/settings")({
  component: SettingsRoute,
});

function SettingsRoute(): JSX.Element {
  const { data: status } = useQuery({ queryKey: ["status"], queryFn: api.status });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: api.profile });

  const formatValue = (v: unknown): string => {
    if (Array.isArray(v)) return v.join(", ");
    if (typeof v === "string") return v;
    return JSON.stringify(v);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader title="Settings" />
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-4 md:px-6">
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
                  className="grid grid-cols-[max-content_1fr] gap-3 px-4 py-3"
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
          </section>

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
              <Row k="Facts" v={status?.counts.facts ?? "—"} />
              <Row k="Documents" v={status?.counts.documents ?? "—"} />
              <Row k="Measurements" v={status?.counts.measurements ?? "—"} />
              <Row k="Active tasks" v={status?.counts.activeTasks ?? "—"} />
              <Row k="Sessions" v={status?.counts.sessions ?? "—"} />
              <Row k="Messages" v={status?.counts.messages ?? "—"} />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

const Row = ({ k, v }: { k: string; v: unknown }): JSX.Element => (
  <div className="grid grid-cols-[max-content_1fr] gap-3 px-4 py-2.5">
    <dt className="text-xs uppercase tracking-wide text-fg-faint">{k}</dt>
    <dd className="text-sm text-fg">{String(v ?? "—")}</dd>
  </div>
);
