import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, SlidersHorizontal, Sparkles } from "lucide-react";
import { ARTIFACT_DESCRIPTORS } from "@lifecoach/schemas";
import { ViewHeader } from "~/components/ui/ViewHeader";
import { Button } from "~/components/ui/Button";
import { formControlClass } from "~/components/ui/formStyles";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "~/components/ui/dropdown-menu";
import { api, type ArtifactRow } from "~/lib/api";
import { toast } from "~/lib/use-toast";
import { ArtifactCard } from "~/components/artifacts/ArtifactCard";
import { EditArtifactSheet } from "~/components/artifacts/EditArtifactSheet";
import { ViewArtifactSheet } from "~/components/artifacts/ViewArtifactSheet";
import { ConfirmDeleteDialog } from "~/components/artifacts/ConfirmDeleteDialog";

export const Route = createFileRoute("/artifacts")({
  component: ArtifactsRoute,
});

const LIMIT = 20;

// ─── Generate button ─────────────────────────────────────────────────────────

function GenerateButton(): JSX.Element {
  const qc = useQueryClient();

  const generate = useMutation({
    mutationFn: api.generateArtifacts,
    onSuccess: ({ created, candidateDocuments, documentsScanned }) => {
      void qc.invalidateQueries({ queryKey: ["artifacts"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
      const made =
        created.length === 0
          ? "No new artifacts found"
          : `${created.length} new artifact${created.length === 1 ? "" : "s"}`;
      // Surface the scan funnel so a low yield is explainable: how many documents
      // were swept vs. how many tripped a type heuristic (and cost a model call).
      toast.success(made, `Scanned ${documentsScanned} docs, ${candidateDocuments} candidates`);
    },
    onError: (err: unknown) => {
      toast.error("Scan failed", err instanceof Error ? err.message : String(err));
    },
  });

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => generate.mutate()}
      disabled={generate.isPending}
      loading={generate.isPending}
    >
      <Sparkles className="size-3.5" strokeWidth={1.75} />
      {generate.isPending ? "extracting…" : "Extract Artifacts"}
    </Button>
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
        ...(typeFilter !== "all" ? { type: typeFilter } : {}),
        ...(q ? { q } : {}),
        limit: LIMIT,
        offset: page * LIMIT,
      }),
  });

  const [viewingArtifact, setViewingArtifact] = useState<ArtifactRow | null>(null);
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
            <DropdownMenuContent align="start" className="min-w-48 border-accent/40">
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
              className={formControlClass("w-full bg-surface px-3 py-1.5 text-sm")}
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
                  <li>• Run <span className="text-fg-muted">Extract Artifacts</span> above to scan immediately.</li>
                </ul>
              </div>
            )
          )}

          {!isLoading && items.length > 0 && (
            <ul className="space-y-3">
              {items.map((a) => (
                <ArtifactCard
                  key={a.id}
                  artifact={a}
                  onView={() => setViewingArtifact(a)}
                  onEdit={() => setEditingArtifact(a)}
                  onDelete={() => setDeletingArtifact(a)}
                />
              ))}
            </ul>
          )}

          {/* Pagination — always show a count; show Prev/Next only across pages */}
          {!isLoading && items.length > 0 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              {total > LIMIT && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Prev
                </Button>
              )}
              <span className="text-xs text-fg-faint">
                Showing {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}
              </span>
              {total > LIMIT && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={(page + 1) * LIMIT >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <ViewArtifactSheet
        artifact={viewingArtifact}
        onClose={() => setViewingArtifact(null)}
      />

      <EditArtifactSheet
        artifact={editingArtifact}
        onClose={() => setEditingArtifact(null)}
      />

      <ConfirmDeleteDialog
        artifact={deletingArtifact}
        onCancel={() => setDeletingArtifact(null)}
      />
    </div>
  );
}
