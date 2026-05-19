import { useEffect, useRef, useState } from "react";
import { ArrowUp, Paperclip } from "lucide-react";
import { cn } from "~/lib/cn";
import { placeholderForToday } from "~/lib/composer-placeholder";

interface Props {
  disabled?: boolean;
  onSubmit: (text: string) => void;
}

/**
 * Composer. Auto-growing textarea + send button. Date-seeded placeholder.
 * Cmd/Ctrl+Enter or Enter (without shift) submits.
 */
export const Composer = ({ disabled, onSubmit }: Props): JSX.Element => {
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const placeholder = placeholderForToday();

  // Auto-grow the textarea.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  const handleSubmit = (): void => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  };

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-2xl px-3 pb-3 md:pb-6",
      )}
    >
      <div
        className={cn(
          "flex items-end gap-2 rounded-lg border border-border bg-surface px-3 py-2",
          "transition-colors focus-within:border-accent/60",
        )}
      >
        <button
          type="button"
          aria-label="Attach file"
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-surface-elevated hover:text-fg-muted"
        >
          <Paperclip className="size-4" strokeWidth={1.75} />
        </button>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          className={cn(
            "flex-1 resize-none bg-transparent py-1.5 text-sm leading-relaxed text-fg",
            "placeholder:text-fg-faint focus:outline-none disabled:opacity-50",
          )}
          aria-label="Message your coach"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || value.trim().length === 0}
          aria-label="Send"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-md transition-all",
            "active:scale-95",
            value.trim().length > 0
              ? "bg-accent text-accent-fg hover:bg-accent-400"
              : "bg-surface-elevated text-fg-faint",
            disabled && "opacity-50",
          )}
        >
          <ArrowUp className="size-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
};
