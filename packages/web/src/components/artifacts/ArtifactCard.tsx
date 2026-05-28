import { useRef, useState } from "react";
import { Check, Cloud, Copy, Eye, Pencil, Trash2 } from "lucide-react";
import { IconButton } from "~/components/ui/IconButton";
import { TypeBadge, TagBadge } from "~/components/ui/Badge";
import { Markdown } from "~/components/chat/Markdown";
import { api, type ArtifactRow } from "~/lib/api";
import { formatRelative } from "~/lib/time";
import { cn } from "~/lib/cn";
import { useTimedReset } from "~/lib/use-timed-reset";
import { writeToClipboard } from "./_shared";

/**
 * Single artifact card with hover-revealed action row (view, copy, save to
 * Capacities, edit, delete). Extracted from routes/artifacts.tsx (Wave 5.4).
 */
export function ArtifactCard({
  artifact: a,
  onView,
  onEdit,
  onDelete,
}: {
  artifact: ArtifactRow;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [capacitiesState, setCapacitiesState] = useState<"idle" | "ok" | "error">("idle");
  const capacitiesMsg = useRef("");

  useTimedReset(copied, () => setCopied(false), 1400);
  useTimedReset(capacitiesState !== "idle", () => setCapacitiesState("idle"), 2500);

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
    <li className="group/card rounded-md border border-border bg-surface px-4 py-3">
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
        <IconButton
          variant="default"
          size="sm"
          aria-label="View"
          title="View"
          onClick={onView}
        >
          <Eye className="size-3.5" strokeWidth={1.75} />
        </IconButton>

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

        <IconButton
          variant="default"
          size="sm"
          aria-label="Edit"
          title="Edit"
          onClick={onEdit}
        >
          <Pencil className="size-3.5" strokeWidth={1.75} />
        </IconButton>

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
