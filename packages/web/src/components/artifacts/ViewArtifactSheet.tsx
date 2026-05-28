import { useRef, useState } from "react";
import { Check, Cloud, Copy } from "lucide-react";
import { Sheet, SheetBody, SheetHeader } from "~/components/ui/Sheet";
import { IconButton } from "~/components/ui/IconButton";
import { TypeBadge, TagBadge } from "~/components/ui/Badge";
import { Markdown } from "~/components/chat/Markdown";
import { api, type ArtifactRow } from "~/lib/api";
import { formatRelative } from "~/lib/time";
import { cn } from "~/lib/cn";
import { useTimedReset } from "~/lib/use-timed-reset";
import { writeToClipboard } from "./_shared";

/**
 * Read-only artifact sheet — full body Markdown, with Copy and
 * Save-to-Capacities actions in the header. Editing happens in
 * EditArtifactSheet.
 */
export function ViewArtifactSheet({
  artifact,
  onClose,
}: {
  artifact: ArtifactRow | null;
  onClose: () => void;
}): JSX.Element {
  const [copied, setCopied] = useState(false);
  const [capacitiesState, setCapacitiesState] = useState<"idle" | "ok" | "error">("idle");
  const capacitiesMsg = useRef("");

  useTimedReset(copied, () => setCopied(false), 1400);
  useTimedReset(capacitiesState !== "idle", () => setCapacitiesState("idle"), 2500);

  const handleCopy = async (): Promise<void> => {
    if (!artifact) return;
    await writeToClipboard(artifact.body);
    setCopied(true);
  };

  const handleCapacities = async (): Promise<void> => {
    if (!artifact) return;
    try {
      await api.artifactToCapacities(artifact.id);
      setCapacitiesState("ok");
    } catch (err) {
      capacitiesMsg.current =
        err instanceof Error ? err.message : "Failed to save to Capacities";
      setCapacitiesState("error");
    }
  };

  return (
    <Sheet
      open={!!artifact}
      onOpenChange={(open) => !open && onClose()}
      side="right"
      width="w-full md:w-[560px]"
    >
      <SheetHeader
        title={artifact?.title ?? ""}
        onClose={onClose}
        action={
          <div className="flex items-center gap-1">
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
          </div>
        }
      />
      <SheetBody>
        {artifact && (
          <div className="px-4 py-4">
            <div className="flex items-center gap-2">
              <TypeBadge type={artifact.type} />
              <span className="text-xs text-fg-faint">
                {formatRelative(artifact.createdAt)}
              </span>
            </div>

            {artifact.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {artifact.tags.map((tag) => (
                  <TagBadge key={tag} tag={tag} />
                ))}
              </div>
            )}

            {capacitiesState === "error" && (
              <p className="mt-2 text-[11px] text-destructive-300">{capacitiesMsg.current}</p>
            )}

            <div className="mt-4 text-sm text-fg">
              <Markdown>{artifact.body}</Markdown>
            </div>

            <p className="mt-6 text-[11px] text-fg-faint">
              {artifact.origin} · updated {formatRelative(artifact.updatedAt)}
            </p>
          </div>
        )}
      </SheetBody>
    </Sheet>
  );
}
