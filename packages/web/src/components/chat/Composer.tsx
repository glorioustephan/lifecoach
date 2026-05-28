/**
 * Composer — chat input bar.
 *
 * Wraps prompt-kit's `PromptInput` composable as the internal engine.
 * This gives us: auto-growing textarea via `PromptInputTextarea`, controlled
 * value/loading state via `usePromptInput` context, and the `PromptInputActions`
 * slot for the attach + send buttons.
 *
 * Lifecoach-specific concerns kept in this wrapper:
 *   - IngestProvider integration (file-attach button + hidden file input)
 *   - Date-seeded placeholder via `placeholderForToday()`
 *   - Agent-aware disabled state (passed from ChatView `streaming` prop)
 *   - Submit: Enter (no Shift) submits, Shift+Enter newlines (§4.3)
 *
 * Per ui-design-system §1.1 — Decision: Wrap (PromptInput → Composer).
 */
import { useRef, useState } from "react";
import { ArrowUp, Paperclip } from "lucide-react";
import { cn } from "~/lib/cn";
import { placeholderForToday } from "~/lib/composer-placeholder";
import { useIngest } from "~/components/ingest/IngestProvider";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputActions,
} from "~/components/ui/prompt-input";
import { IconButton } from "~/components/ui/IconButton";

interface Props {
  disabled?: boolean;
  onSubmit: (text: string) => void;
}

export const Composer = ({ disabled, onSubmit }: Props): JSX.Element => {
  const [value, setValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const placeholder = placeholderForToday();
  const { openWithFile } = useIngest();

  const handleSubmit = (): void => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  };

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="mx-auto w-full max-w-2xl px-3 pb-3 md:pb-6">
      {/*
       * PromptInput is the root context provider (value, loading, maxHeight,
       * onSubmit). It handles auto-grow via PromptInputTextarea's layout effect.
       * We keep value/setValue in local state so ChatView can clear it on send.
       */}
      <PromptInput
        value={value}
        onValueChange={setValue}
        onSubmit={handleSubmit}
        isLoading={disabled ?? false}
        disabled={disabled ?? false}
        maxHeight={200}
        className={cn(
          // Override prompt-kit defaults (rounded-3xl, p-2, shadow-xs) with lifecoach style.
          // tailwind-merge keeps last conflicting class, so these win.
          "flex items-end gap-2 rounded-lg border border-border bg-surface px-3 py-2 shadow-none",
          "transition-colors focus-within:border-accent/60",
        )}
      >
        {/* Attach file button */}
        <PromptInputActions className="mb-0.5 self-end">
          <IconButton
            type="button"
            aria-label="Attach file"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            size="sm"
            className="shrink-0"
          >
            <Paperclip className="size-4" strokeWidth={1.75} />
          </IconButton>
        </PromptInputActions>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.csv,.md,.markdown,application/pdf,text/csv,text/markdown"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) openWithFile(file);
            // Reset so picking the same file twice fires onChange a second time
            e.target.value = "";
          }}
        />

        {/* Auto-growing textarea — PromptInputTextarea handles resize + Enter key */}
        <PromptInputTextarea
          placeholder={placeholder}
          rows={1}
          aria-label="Message your coach"
          className={cn(
            "flex-1 py-1.5 text-sm leading-relaxed text-fg",
            "placeholder:text-fg-faint",
            // Textarea-specific overrides on top of prompt-kit defaults
            "min-h-[auto]",
          )}
        />

        {/* Send button */}
        <PromptInputActions className="mb-0.5 self-end">
          <IconButton
            type="button"
            onClick={handleSubmit}
            disabled={!canSend}
            aria-label="Send"
            variant={canSend ? "primary" : "default"}
            size="sm"
            className="shrink-0 active:scale-95"
          >
            <ArrowUp className="size-4" strokeWidth={2} />
          </IconButton>
        </PromptInputActions>
      </PromptInput>
    </div>
  );
};
