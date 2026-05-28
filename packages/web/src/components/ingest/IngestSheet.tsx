import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckCircle2, FileText, AlertCircle } from "lucide-react";
import { useIngest } from "./IngestProvider";
import { Sheet, SheetBody, SheetHeader } from "~/components/ui/Sheet";
import { cn } from "~/lib/cn";
import { toast } from "~/lib/use-toast";

interface IngestResponse {
  result: {
    document: { id: string; title: string | null; mime: string | null; body: string };
    chunkCount: number;
    embedded: boolean;
    factsExtracted: number;
    measurementsExtracted: number;
    skipped: boolean;
    extractionError?: string;
    extractionNotes?: string;
  };
}

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const guessType = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".csv")) return "CSV";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "Markdown";
  return "Unknown";
};

export const IngestSheet = (): JSX.Element => {
  const { pendingFile, close } = useIngest();
  const open = pendingFile !== null;

  // Reset extract toggle each time we open with a new file
  const [extract, setExtract] = useState(true);
  useEffect(() => {
    if (pendingFile) setExtract(true);
  }, [pendingFile]);

  const qc = useQueryClient();
  const navigate = useNavigate();

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      if (!extract) form.append("extract", "false");
      const resp = await fetch("/api/ingest", { method: "POST", body: form });
      const body = (await resp.json().catch(() => ({}))) as
        | IngestResponse
        | { error?: string };
      if (!resp.ok) {
        throw new Error(
          ("error" in body && body.error) || `${resp.status} ${resp.statusText}`,
        );
      }
      return body as IngestResponse;
    },
    onSuccess: ({ result }) => {
      void qc.invalidateQueries({ queryKey: ["memory"] });
      void qc.invalidateQueries({ queryKey: ["status"] });
      void qc.invalidateQueries({ queryKey: ["sources"] });
      if (result.skipped) {
        toast.info("Already ingested", result.document.title ?? undefined);
      } else {
        const parts: string[] = [];
        if (result.factsExtracted > 0) parts.push(`${result.factsExtracted} facts`);
        if (result.measurementsExtracted > 0)
          parts.push(`${result.measurementsExtracted} measurements`);
        if (result.chunkCount > 0) parts.push(`${result.chunkCount} chunks`);
        toast.success(
          `Ingested ${result.document.title ?? "file"}`,
          parts.length > 0 ? parts.join(" · ") : undefined,
        );
      }
    },
    onError: (err: unknown) => {
      toast.error("Ingest failed", err instanceof Error ? err.message : String(err));
    },
  });

  // Stable ref so the effect dep array can be honest — upload.reset identity
  // changes on every render but we only ever want to call the current version.
  const uploadResetRef = useRef(upload.reset);
  uploadResetRef.current = upload.reset;

  // Clear result when we open with a new file
  useEffect(() => {
    if (pendingFile) uploadResetRef.current();
  }, [pendingFile]);

  const status = useMemo<"idle" | "pending" | "success" | "error">(() => {
    if (upload.isError) return "error";
    if (upload.isSuccess) return "success";
    if (upload.isPending) return "pending";
    return "idle";
  }, [upload.isError, upload.isSuccess, upload.isPending]);

  const handleOpenChange = (next: boolean): void => {
    if (!next) close();
  };

  const handleViewInMemory = (): void => {
    close();
    void navigate({ to: "/memory" });
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange} side="bottom" width="md:w-[480px]">
      <SheetHeader
        title={status === "success" ? "Ingested" : "Ingest file"}
        onClose={close}
      />
      <SheetBody>
        <div className="px-5 py-4">
          {pendingFile && status === "idle" && (
            <IngestForm
              file={pendingFile}
              extract={extract}
              onExtractChange={setExtract}
              onIngest={() => upload.mutate(pendingFile)}
              onCancel={close}
            />
          )}
          {pendingFile && status === "pending" && (
            <PendingState file={pendingFile} />
          )}
          {status === "success" && upload.data && (
            <SuccessState
              data={upload.data}
              onClose={close}
              onView={handleViewInMemory}
            />
          )}
          {status === "error" && (
            <ErrorState
              message={upload.error instanceof Error ? upload.error.message : String(upload.error)}
              onRetry={() => pendingFile && upload.mutate(pendingFile)}
              onCancel={close}
            />
          )}
        </div>
      </SheetBody>
    </Sheet>
  );
};

const FileSummary = ({ file }: { file: File }): JSX.Element => (
  <div className="flex items-center gap-3 rounded-md border border-border-subtle bg-surface px-3 py-2.5">
    <FileText className="size-5 shrink-0 text-fg-muted" strokeWidth={1.5} />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-fg">{file.name}</p>
      <p className="mt-0.5 text-xs text-fg-faint">
        {guessType(file.name)} · {formatBytes(file.size)}
      </p>
    </div>
  </div>
);

const IngestForm = ({
  file,
  extract,
  onExtractChange,
  onIngest,
  onCancel,
}: {
  file: File;
  extract: boolean;
  onExtractChange: (v: boolean) => void;
  onIngest: () => void;
  onCancel: () => void;
}): JSX.Element => (
  <div className="space-y-4">
    <FileSummary file={file} />

    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border-subtle bg-surface/50 px-3 py-2.5 transition-colors hover:bg-surface">
      <input
        type="checkbox"
        checked={extract}
        onChange={(e) => onExtractChange(e.target.checked)}
        className="mt-0.5 size-4 accent-accent"
      />
      <span className="text-sm">
        <span className="block font-medium text-fg">Extract facts and measurements</span>
        <span className="mt-0.5 block text-xs text-fg-muted">
          Use the LLM to pull structured facts (preferences, routines) and
          numeric measurements (lab values) into typed memory. Uncheck for
          reference material you only want recallable, not interpreted.
        </span>
      </span>
    </label>

    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-surface-elevated/50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onIngest}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-400"
      >
        Ingest
      </button>
    </div>
  </div>
);

const PendingState = ({ file }: { file: File }): JSX.Element => (
  <div className="space-y-4">
    <FileSummary file={file} />
    <div className="flex items-center gap-3 rounded-md border border-border-subtle bg-surface/50 px-3 py-3 text-sm text-fg-muted">
      <span aria-hidden className="size-2 animate-pulse rounded-full bg-accent" />
      Parsing, chunking, embedding…
    </div>
    <p className="text-xs text-fg-faint">
      A long document might take a few seconds. Feel free to wait or close — the
      ingestion will continue server-side.
    </p>
  </div>
);

const SuccessState = ({
  data,
  onClose,
  onView,
}: {
  data: IngestResponse;
  onClose: () => void;
  onView: () => void;
}): JSX.Element => {
  const r = data.result;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-md border border-success-500/30 bg-success-500/5 px-3 py-3 text-sm">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-500" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-fg">
            {r.skipped ? "Already ingested" : "Ingested"}
          </p>
          <p className="mt-0.5 text-xs text-fg-muted">{r.document.title ?? "(untitled)"}</p>
        </div>
      </div>

      {!r.skipped && (
        <dl className="space-y-1 rounded-md border border-border-subtle bg-surface/50 px-3 py-2.5 text-xs">
          <Row k="Chunks" v={r.chunkCount} />
          <Row k="Embedded" v={r.embedded ? "yes" : "no (embedder off)"} />
          <Row k="Facts extracted" v={r.factsExtracted} />
          <Row k="Measurements extracted" v={r.measurementsExtracted} />
          {r.extractionNotes && (
            <div className="mt-2 border-t border-border-subtle pt-2 text-fg-muted">
              {r.extractionNotes}
            </div>
          )}
        </dl>
      )}

      {r.extractionError && (
        <div className="rounded-md border border-warning-500/30 bg-warning-500/5 px-3 py-2.5 text-xs text-warning-200">
          Extraction warning: {r.extractionError}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-surface-elevated/50"
        >
          Close
        </button>
        <button
          type="button"
          onClick={onView}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-400"
        >
          View in Memory
        </button>
      </div>
    </div>
  );
};

const ErrorState = ({
  message,
  onRetry,
  onCancel,
}: {
  message: string;
  onRetry: () => void;
  onCancel: () => void;
}): JSX.Element => (
  <div className="space-y-4">
    <div className="flex items-start gap-3 rounded-md border border-destructive-500/40 bg-destructive-500/5 px-3 py-3 text-sm">
      <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive-500" strokeWidth={1.75} />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-fg">Ingest failed</p>
        <p className="mt-0.5 break-words text-xs text-destructive-300">{message}</p>
      </div>
    </div>
    <div className="flex justify-end gap-2 pt-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-surface-elevated/50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          "rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg",
          "transition-colors hover:bg-accent-400",
        )}
      >
        Retry
      </button>
    </div>
  </div>
);

const Row = ({ k, v }: { k: string; v: unknown }): JSX.Element => (
  <div className="flex items-center justify-between gap-3">
    <dt className="text-fg-muted">{k}</dt>
    <dd className="font-mono text-fg">{String(v)}</dd>
  </div>
);
