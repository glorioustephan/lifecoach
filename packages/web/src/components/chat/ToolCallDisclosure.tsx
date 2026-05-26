/**
 * ToolCallDisclosure — wraps prompt-kit Tool collapsible shell with
 * lifecoach ToolCallState mapping.
 *
 * Per ui-design-system §1.3 — Decision: Wrap.
 * Uses prompt-kit's Tool (Radix Collapsible + semantic status icons) as the
 * engine. The existing ToolCallState shape is preserved and mapped to ToolPart
 * for the shell; the output rendering is lifecoach-specific (SDK returns
 * string|array, not Record<string,unknown>) so the CollapsibleContent is
 * rendered directly with our formatInput/formatOutput helpers.
 *
 * // TODO(handoff): Once tool output shapes stabilize as Record<string,unknown>,
 * migrate to the prompt-kit Tool's built-in key-value output renderer and remove
 * the custom CollapsibleContent block below.
 */
import { useState } from "react";
import { AlertCircle, CheckCircle, ChevronDown, Loader2, XCircle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "~/lib/cn";

export interface ToolCallState {
  toolUseId: string;
  name: string;
  input: unknown;
  status: "running" | "complete" | "error";
  output?: unknown;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const summarizeOutput = (output: unknown): string => {
  if (typeof output === "string") {
    const trimmed = output.trim();
    if (trimmed.length <= 60) return trimmed;
    return trimmed.slice(0, 57) + "…";
  }
  if (Array.isArray(output)) return `${output.length} items`;
  if (output && typeof output === "object") return "[object]";
  return String(output ?? "");
};

const formatInput = (input: unknown): string => {
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
};

const formatOutput = (output: unknown): string => {
  if (typeof output === "string") return output;
  // Tool results from the SDK come back as arrays of content blocks. Flatten.
  if (Array.isArray(output)) {
    return output
      .map((b) => {
        if (typeof b === "string") return b;
        if (b && typeof b === "object" && "text" in b) {
          return String((b as { text: unknown }).text);
        }
        return JSON.stringify(b, null, 2);
      })
      .join("\n");
  }
  return JSON.stringify(output, null, 2);
};

export const ToolCallDisclosure = ({ call }: { call: ToolCallState }): JSX.Element => {
  const [isOpen, setIsOpen] = useState(false);
  const isError = call.status === "error";
  const isRunning = call.status === "running";
  const duration =
    call.finishedAt !== undefined ? formatDuration(call.finishedAt - call.startedAt) : null;

  const getStateIcon = () => {
    if (isRunning) {
      return <Loader2 className="size-3.5 animate-spin text-accent" strokeWidth={1.75} />;
    }
    if (isError) {
      return <XCircle className="size-3.5 text-destructive-500" strokeWidth={1.75} />;
    }
    return <CheckCircle className="size-3.5 text-success-500" strokeWidth={1.75} />;
  };

  return (
    <div
      className={cn(
        "rounded-md border bg-surface text-xs",
        isError ? "border-destructive-500/50" : "border-border",
      )}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger
          aria-controls={`tool-${call.toolUseId}`}
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2",
            "text-left text-fg-muted transition-colors hover:bg-surface-elevated",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          )}
        >
          {getStateIcon()}
          <span className="font-mono text-fg-faint">{call.name}</span>
          <span className="truncate text-fg-muted">
            {isRunning
              ? "running…"
              : isError
                ? (call.error ?? "error").slice(0, 80)
                : summarizeOutput(call.output)}
          </span>
          <span className="ml-auto flex items-center gap-2 text-fg-faint">
            {duration && <span className="font-mono">{duration}</span>}
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                isOpen && "rotate-180",
              )}
              strokeWidth={1.75}
            />
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent
          id={`tool-${call.toolUseId}`}
          className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden"
        >
          <div className="border-t border-border px-3 py-2">
            <div className="mb-2">
              <div className="mb-1 text-[10px] font-mono uppercase tracking-wide text-fg-faint">
                in
              </div>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-all font-mono text-xs text-fg-muted">
                {formatInput(call.input)}
              </pre>
            </div>
            {call.output !== undefined && (
              <div>
                <div className="mb-1 text-[10px] font-mono uppercase tracking-wide text-fg-faint">
                  out
                </div>
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-all font-mono text-xs text-fg-muted">
                  {formatOutput(call.output)}
                </pre>
              </div>
            )}
            {call.error && (
              <div>
                <div className="mb-1 text-[10px] font-mono uppercase tracking-wide text-destructive-300">
                  error
                </div>
                <pre className="whitespace-pre-wrap font-mono text-xs text-destructive-300">
                  {call.error}
                </pre>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
