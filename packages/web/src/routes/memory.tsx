import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { api, type DocumentRow } from "~/lib/api";
import { formatRelative } from "~/lib/time";
import { cn } from "~/lib/cn";

export const Route = createFileRoute("/memory")({
  component: MemoryRoute,
});

type Tab = "facts" | "documents";

interface FactRow {
  id: string;
  category: string;
  subject: string;
  body: string;
  confidence: number;
  validTo: number | null;
}

function MemoryRoute(): JSX.Element {
  const [tab, setTab] = useState<Tab>("facts");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader title="Memory" subtitle="What the coach knows about you" />
      <nav
        aria-label="Memory section"
        className="flex gap-1 border-b border-border-subtle px-4 md:px-6"
      >
        <TabButton active={tab === "facts"} onClick={() => setTab("facts")}>
          Facts
        </TabButton>
        <TabButton active={tab === "documents"} onClick={() => setTab("documents")}>
          Documents
        </TabButton>
      </nav>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-4 md:px-6">
          {tab === "facts" ? <FactsTab /> : <DocumentsTab />}
        </div>
      </div>
    </div>
  );
}

const TabButton = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element => (
  <button
    type="button"
    onClick={onClick}
    role="tab"
    aria-selected={active}
    className={cn(
      "relative -mb-px px-3 py-2 text-sm transition-colors",
      active ? "text-fg" : "text-fg-muted hover:text-fg",
    )}
  >
    {children}
    {active && (
      <span aria-hidden className="absolute inset-x-2 -bottom-px h-px bg-accent" />
    )}
  </button>
);

function FactsTab(): JSX.Element {
  const { data, isLoading } = useQuery<{ facts: FactRow[] }>({
    queryKey: ["memory", "facts"],
    queryFn: async () => {
      const resp = await fetch("/api/memory/facts");
      if (!resp.ok) throw new Error(resp.statusText);
      return resp.json();
    },
  });

  if (isLoading) {
    return (
      <ul className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <li
            key={i}
            className="h-14 animate-pulse rounded-md border border-border-subtle bg-surface/50"
          />
        ))}
      </ul>
    );
  }
  if (!data || data.facts.length === 0) {
    return (
      <p className="mt-12 text-center text-sm text-fg-muted">
        No facts stored yet. Chat with your coach — facts will land here as you
        share things about yourself.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border-subtle rounded-md border border-border bg-surface">
      {data.facts.slice(0, 200).map((f) => (
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
  );
}

function DocumentsTab(): JSX.Element {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["memory", "documents"],
    queryFn: api.documents,
  });
  const [pendingForget, setPendingForget] = useState<DocumentRow | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const forgetMut = useMutation({
    mutationFn: (id: string) => api.forgetDocument(id),
    onSuccess: ({ result }) => {
      setLastResult(
        `Forgot ${result.documentId.slice(0, 8)}… — removed ${result.factsRemoved} facts, ${result.measurementsRemoved} measurements, ${result.embeddingVectorsRemoved} vectors.`,
      );
      void qc.invalidateQueries({ queryKey: ["memory"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
      setPendingForget(null);
    },
    onError: (err: unknown) => {
      setLastResult(`Failed: ${err instanceof Error ? err.message : String(err)}`);
      setPendingForget(null);
    },
  });

  if (isLoading) {
    return (
      <ul className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <li
            key={i}
            className="h-16 animate-pulse rounded-md border border-border-subtle bg-surface/50"
          />
        ))}
      </ul>
    );
  }
  if (!data || data.documents.length === 0) {
    return (
      <p className="mt-12 text-center text-sm text-fg-muted">
        No documents ingested. Drop files in{" "}
        <code className="rounded-sm bg-surface px-1 font-mono text-xs">data/raw/</code>{" "}
        or use{" "}
        <code className="rounded-sm bg-surface px-1 font-mono text-xs">
          pnpm lifecoach ingest
        </code>
        .
      </p>
    );
  }
  return (
    <>
      {lastResult && (
        <div className="mb-3 rounded-md border border-border-subtle bg-surface/50 px-3 py-2 text-xs text-fg-muted">
          {lastResult}
        </div>
      )}
      <ul className="divide-y divide-border-subtle rounded-md border border-border bg-surface">
        {data.documents.map((d) => (
          <li key={d.id} className="flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-medium text-fg">
                  {d.title ?? "(untitled)"}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-fg-faint">
                  {formatRelative(d.ingested_at)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-fg-muted">
                {d.source} · {d.mime ?? "unknown"} · {d.body_chars.toLocaleString()} chars
              </p>
              <p className="mt-0.5 truncate font-mono text-[10px] text-fg-faint">{d.id}</p>
            </div>
            <button
              type="button"
              onClick={() => setPendingForget(d)}
              aria-label={`Forget ${d.title ?? d.id}`}
              className="flex size-9 shrink-0 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-destructive-500/10 hover:text-destructive-300"
            >
              <Trash2 className="size-4" strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>
      <ConfirmForgetDialog
        doc={pendingForget}
        onCancel={() => setPendingForget(null)}
        onConfirm={(id) => forgetMut.mutate(id)}
        pending={forgetMut.isPending}
      />
    </>
  );
}

function ConfirmForgetDialog({
  doc,
  onCancel,
  onConfirm,
  pending,
}: {
  doc: DocumentRow | null;
  onCancel: () => void;
  onConfirm: (id: string) => void;
  pending: boolean;
}): JSX.Element | null {
  if (!doc) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="forget-doc-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="forget-doc-title" className="text-base font-semibold text-fg">
          Forget this document?
        </h2>
        <p className="mt-2 text-sm text-fg-muted">
          This removes{" "}
          <span className="font-medium text-fg">{doc.title ?? "(untitled)"}</span>{" "}
          and every fact, measurement, and embedding the coach derived from it.
          The source file (if still on disk) is untouched.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-elevated/50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(doc.id)}
            disabled={pending}
            className="rounded-md bg-destructive-500/90 px-3 py-1.5 text-sm text-white transition-colors hover:bg-destructive-500 disabled:opacity-50"
          >
            {pending ? "Forgetting…" : "Forget"}
          </button>
        </div>
      </div>
    </div>
  );
}
