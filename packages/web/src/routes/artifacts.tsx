import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Cloud,
  Copy,
  Pencil,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { ARTIFACT_DESCRIPTORS } from "@lifecoach/schemas";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { TabNav } from "~/components/ui/TabNav";
import { Button } from "~/components/ui/Button";
import { IconButton } from "~/components/ui/IconButton";
import { TypeBadge, TagBadge } from "~/components/ui/Badge";
import { Sheet, SheetBody, SheetHeader } from "~/components/ui/Sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "~/components/ui/dropdown-menu";
import { Markdown } from "~/components/chat/Markdown";
import { api, type ArtifactRow } from "~/lib/api";
import { formatRelative } from "~/lib/time";
import { cn } from "~/lib/cn";

export const Route = createFileRoute("/artifacts")({
  component: ArtifactsRoute,
});

const LIMIT = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const writeToClipboard = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  }
};

// ─── Generate button ─────────────────────────────────────────────────────────

function GenerateButton(): JSX.Element {
  const qc = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: api.generateArtifacts,
    onSuccess: ({ created }) => {
      void qc.invalidateQueries({ queryKey: ["artifacts"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
      setBanner(
        created.length === 0
          ? "No new artifacts found."
          : `${created.length} artifact${created.length === 1 ? "" : "s"} created.`,
      );
      setTimeout(() => setBanner(null), 4000);
    },
    onError: (err: unknown) => {
      setBanner(err instanceof Error ? `Scan failed: ${err.message}` : "Scan failed.");
      setTimeout(() => setBanner(null), 6000);
    },
  });

  return (
    <div className="flex items-center gap-2">
      {banner && (
        <span className="text-xs text-fg-muted">{banner}</span>
      )}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => generate.mutate()}
        disabled={generate.isPending}
        loading={generate.isPending}
      >
        <Sparkles className="size-3.5" strokeWidth={1.75} />
        {generate.isPending ? "scanning…" : "Generate now"}
      </Button>
    </div>
  );
}

// ─── Main route ───────────────────────────────────────────────────────────────

function ArtifactsRoute(): JSX.Element {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  // Debounce search
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string): void => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQ(value);
      setPage(0);
    }, 300);
  };

  // Reset page when filter/search changes
  const handleTypeChange = (t: string): void => {
    setTypeFilter(t);
    setPage(0);
  };

  const { data, isLoading } = useQuery({
    queryKey: ["artifacts", { type: typeFilter, q, page }],
    queryFn: () =>
      api.artifacts({
        type: typeFilter === "all" ? undefined : typeFilter,
        q: q || undefined,
        limit: LIMIT,
        offset: page * LIMIT,
      }),
  });

  const [editingArtifact, setEditingArtifact] = useState<ArtifactRow | null>(null);
  const [deletingArtifact, setDeletingArtifact] = useState<ArtifactRow | null>(null);

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  // Clamp out-of-range page (e.g. after deleting the last item on a later page).
  useEffect(() => {
    if (!isLoading && page > 0 && page * LIMIT >= total) {
      setPage(Math.max(0, Math.ceil(total / LIMIT) - 1));
    }
  }, [isLoading, page, total]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader
        title="Artifacts"
        subtitle="Recipes and other reusable artifacts surfaced from your conversations"
        actions={<GenerateButton />}
      />

      <div className="flex-1 overflow-y-auto mobile-safe-bottom">
        {/* Filter (radio dropdown) + search as siblings; scrolls with content. */}
        <div className="mx-auto mt-8 flex max-w-2xl items-center gap-2 px-4 md:px-6">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-sm text-fg outline-none transition-colors hover:bg-surface-elevated focus:border-accent/40 data-[state=open]:border-accent/40">
              <SlidersHorizontal className="size-4 text-fg-muted" />
              <span>
                {typeFilter === "all"
                  ? "All types"
                  : ARTIFACT_DESCRIPTORS.find((d) => d.id === typeFilter)?.label ?? "All types"}
              </span>
              <ChevronDown className="size-4 text-fg-muted" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-48">
              <DropdownMenuLabel>Filter by type</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={typeFilter} onValueChange={(v) => handleTypeChange(v)}>
                <DropdownMenuRadioItem value="all">All types</DropdownMenuRadioItem>
                {ARTIFACT_DESCRIPTORS.map((d) => (
                  <DropdownMenuRadioItem key={d.id} value={d.id}>
                    {d.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex-1">
            <label htmlFor="artifact-search" className="sr-only">Search artifacts</label>
            <input
              id="artifact-search"
              type="search"
              placeholder="Search…"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-surface px-3 py-1.5 text-sm text-fg placeholder:text-fg-faint outline-none focus:border-accent/40 transition-colors"
            />
          </div>
        </div>
        <div className="mx-auto max-w-2xl px-4 py-4 md:px-6">
          {isLoading && (
            <ul className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <li
                  key={i}
                  className="h-16 animate-pulse rounded-md border border-border-subtle bg-surface/50"
                />
              ))}
            </ul>
          )}

          {!isLoading && items.length === 0 && (
            q || typeFilter !== "all" ? (
              <p className="mt-12 text-center text-sm text-fg-muted">
                No artifacts match your filters.
              </p>
            ) : (
              <div className="mx-auto mt-12 max-w-sm text-center text-sm text-fg-muted">
                <p className="font-medium text-fg">No artifacts yet</p>
                <p className="mt-2">Artifacts appear three ways:</p>
                <ul className="mt-2 space-y-1 text-left text-xs text-fg-faint">
                  <li>• Press <span className="text-fg-muted">Save</span> under a coach reply that contains one (e.g. a recipe).</li>
                  <li>• A daily background scan surfaces them from past conversations.</li>
                  <li>• Run <span className="text-fg-muted">Generate now</span> above to scan immediately.</li>
                </ul>
              </div>
            )
          )}

          {!isLoading && items.length > 0 && (
            <ul className="divide-y divide-border-subtle rounded-md border border-border bg-surface">
              {items.map((a) => (
                <ArtifactCard
                  key={a.id}
                  artifact={a}
                  onEdit={() => setEditingArtifact(a)}
                  onDelete={() => setDeletingArtifact(a)}
                />
              ))}
            </ul>
          )}

          {/* Pagination */}
          {total > LIMIT && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Prev
              </Button>
              <span className="text-xs text-fg-faint">
                {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={(page + 1) * LIMIT >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Edit sheet */}
      <EditArtifactSheet
        artifact={editingArtifact}
        onClose={() => setEditingArtifact(null)}
      />

      {/* Delete confirm */}
      <ConfirmDeleteDialog
        artifact={deletingArtifact}
        onCancel={() => setDeletingArtifact(null)}
      />
    </div>
  );
}

// ─── Artifact card ────────────────────────────────────────────────────────────

function ArtifactCard({
  artifact: a,
  onEdit,
  onDelete,
}: {
  artifact: ArtifactRow;
  onEdit: () => void;
  onDelete: () => void;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [capacitiesState, setCapacitiesState] = useState<"idle" | "ok" | "error">("idle");
  const capacitiesMsg = useRef("");

  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 1400);
      return () => clearTimeout(t);
    }
  }, [copied]);

  useEffect(() => {
    if (capacitiesState !== "idle") {
      const t = setTimeout(() => setCapacitiesState("idle"), 2500);
      return () => clearTimeout(t);
    }
  }, [capacitiesState]);

  const handleCopy = async (): Promise<void> => {
    await writeToClipboard(a.body);
    setCopied(true);
  };

  const handleCapacities = async (): Promise<void> => {
    try {
      await api.artifactToCapacities(a.id);
      setCapacitiesState("ok");
    } catch (err) {
      capacitiesMsg.current =
        err instanceof Error ? err.message : "Failed to save to Capacities";
      setCapacitiesState("error");
    }
  };

  const preview = a.body.length > 600 ? a.body.slice(0, 600) + "…" : a.body;

  return (
    <li className="group/card px-4 py-3">
      {/* Header row */}
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <TypeBadge type={a.type} />
          <span className="text-sm font-medium text-fg truncate">{a.title}</span>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-fg-faint">
          {formatRelative(a.createdAt)}
        </span>
      </div>

      {/* Tags */}
      {a.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {a.tags.map((tag) => (
            <TagBadge key={tag} tag={tag} />
          ))}
        </div>
      )}

      {/* Body preview */}
      <div className="relative mt-2 max-h-48 overflow-hidden text-sm text-fg [&>*]:text-sm">
        <Markdown>{preview}</Markdown>
        {a.body.length > 600 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent" />
        )}
      </div>

      {/* Action row — always visible on touch, hover-reveal on desktop */}
      <div className="mt-3 flex items-center gap-1 md:opacity-0 md:group-hover/card:opacity-100 md:focus-within:opacity-100 transition-opacity duration-150">
        {/* Copy */}
        <IconButton
          variant="default"
          size="sm"
          aria-label={copied ? "Copied" : "Copy"}
          title={copied ? "Copied" : "Copy"}
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="size-3.5 text-success-500" strokeWidth={1.75} />
          ) : (
            <Copy className="size-3.5" strokeWidth={1.75} />
          )}
        </IconButton>

        {/* Save to Capacities */}
        <IconButton
          variant="default"
          size="sm"
          aria-label={
            capacitiesState === "ok"
              ? "Saved"
              : capacitiesState === "error"
                ? "Error"
                : "Save to Capacities"
          }
          title={
            capacitiesState === "ok"
              ? "Saved"
              : capacitiesState === "error"
                ? "Error"
                : "Save to Capacities"
          }
          onClick={handleCapacities}
        >
          {capacitiesState === "ok" ? (
            <Check className="size-3.5 text-success-500" strokeWidth={1.75} />
          ) : (
            <Cloud
              className={cn(
                "size-3.5",
                capacitiesState === "error" ? "text-destructive-300" : "",
              )}
              strokeWidth={1.75}
            />
          )}
        </IconButton>
        {capacitiesState === "error" && (
          <span className="text-[10px] text-destructive-300">{capacitiesMsg.current}</span>
        )}

        {/* Edit */}
        <IconButton
          variant="default"
          size="sm"
          aria-label="Edit"
          title="Edit"
          onClick={onEdit}
        >
          <Pencil className="size-3.5" strokeWidth={1.75} />
        </IconButton>

        {/* Delete */}
        <IconButton
          variant="destructive"
          size="sm"
          aria-label="Delete"
          title="Delete"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" strokeWidth={1.75} />
        </IconButton>
      </div>
    </li>
  );
}

// ─── Edit sheet ───────────────────────────────────────────────────────────────

function EditArtifactSheet({
  artifact,
  onClose,
}: {
  artifact: ArtifactRow | null;
  onClose: () => void;
}): JSX.Element {
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [tab, setTab] = useState<"view" | "edit">("view");

  // Seed form state when artifact changes
  useEffect(() => {
    if (artifact) {
      setTitle(artifact.title);
      setBody(artifact.body);
      setTagsRaw(artifact.tags.join(", "));
      setTab("view");
    }
  }, [artifact]);

  const dirty =
    !!artifact &&
    (title !== artifact.title ||
      body !== artifact.body ||
      tagsRaw !== artifact.tags.join(", "));

  // Guard against losing edits on Escape / overlay-click / X.
  const requestClose = (): void => {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  };

  const save = useMutation({
    mutationFn: () => {
      if (!artifact) throw new Error("No artifact");
      const tags = tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      return api.updateArtifact(artifact.id, { title, body, tags });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["artifacts"] });
      onClose();
    },
  });

  return (
    <Sheet open={!!artifact} onOpenChange={(open) => !open && requestClose()} side="right" width="w-[520px]">
      <SheetHeader
        title="Edit artifact"
        onClose={requestClose}
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => save.mutate()}
            disabled={save.isPending || !dirty}
            loading={save.isPending}
          >
            {save.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
        }
      />
      <SheetBody>
        <div className="px-4 py-4">
          {save.isError && (
            <div className="rounded-md border border-destructive-500/40 bg-destructive-500/5 px-3 py-2 text-xs text-destructive-300 mb-4">
              {save.error instanceof Error ? save.error.message : "Save failed"}
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5 mb-4">
            <label htmlFor="artifact-title" className="text-xs uppercase tracking-wide text-fg-faint">Title</label>
            <input
              id="artifact-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint outline-none focus:border-accent/40 transition-colors"
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5 mb-4">
            <label htmlFor="artifact-tags" className="text-xs uppercase tracking-wide text-fg-faint">
              Tags <span className="normal-case text-fg-faint">(comma-separated)</span>
            </label>
            <input
              id="artifact-tags"
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="e.g. dinner, quick, healthy"
              className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint outline-none focus:border-accent/40 transition-colors"
            />
          </div>

          {/* Body tabs — view vs edit */}
          <div className="mb-3">
            <TabNav
              tabs={[
                { id: "view" as const, label: "View" },
                { id: "edit" as const, label: "Edit" },
              ]}
              active={tab}
              onChange={setTab}
              variant="pill"
              width="none"
            />
          </div>

          {/* Body content — full width in selected tab */}
          <div>
            {tab === "view" && (
              <div className="min-h-[300px] rounded-md border border-border-subtle bg-surface/50 px-4 py-3 text-sm text-fg overflow-y-auto">
                <Markdown>{body}</Markdown>
              </div>
            )}
            {tab === "edit" && (
              <div className="space-y-1.5">
                <label htmlFor="artifact-body" className="text-xs uppercase tracking-wide text-fg-faint">Body</label>
                <textarea
                  id="artifact-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full min-h-[300px] rounded-md border border-border-subtle bg-surface px-3 py-2 font-mono text-xs text-fg outline-none focus:border-accent/40 resize-y transition-colors"
                />
              </div>
            )}
          </div>
        </div>
      </SheetBody>
    </Sheet>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function ConfirmDeleteDialog({
  artifact,
  onCancel,
}: {
  artifact: ArtifactRow | null;
  onCancel: () => void;
}): JSX.Element | null {
  const qc = useQueryClient();

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteArtifact(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["artifacts"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
      onCancel();
    },
  });

  if (!artifact) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-artifact-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="delete-artifact-title" className="text-base font-semibold text-fg">
          Delete this artifact?
        </h2>
        <p className="mt-2 text-sm text-fg-muted">
          <span className="font-medium text-fg">"{artifact.title}"</span> will be
          permanently deleted and cannot be recovered.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleteMut.isPending}
            className="rounded-md px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-elevated/50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => deleteMut.mutate(artifact.id)}
            disabled={deleteMut.isPending}
            className="rounded-md bg-destructive-500/90 px-3 py-1.5 text-sm text-bg transition-colors hover:bg-destructive-500 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive-300 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {deleteMut.isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
