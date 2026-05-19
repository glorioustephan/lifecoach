import { useEffect, useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { useIngest } from "./IngestProvider";

const SUPPORTED_EXT = [".pdf", ".csv", ".md", ".markdown"] as const;

const isSupported = (file: File): boolean => {
  const name = file.name.toLowerCase();
  return SUPPORTED_EXT.some((ext) => name.endsWith(ext));
};

/**
 * Window-level drag-drop overlay. Activates whenever the user drags a file
 * over the page (any route). On drop, hands the file to IngestProvider,
 * which opens the IngestSheet for confirmation.
 *
 * Drag enter/leave events fire on every child element transition; we use a
 * counter to detect when the cursor has actually left the window vs. just
 * crossed an internal boundary.
 */
export const DropZone = (): JSX.Element | null => {
  const { openWithFile } = useIngest();
  const [active, setActive] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  const counterRef = useRef(0);

  useEffect(() => {
    const onDragEnter = (e: DragEvent): void => {
      // Only react to events that include files (not text selections, links, etc.)
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      counterRef.current += 1;
      setActive(true);
    };
    const onDragOver = (e: DragEvent): void => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      // preventDefault on dragover is REQUIRED to allow drop, regardless of
      // whether we'll accept the file. Without it the browser navigates to
      // the file path.
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent): void => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      counterRef.current = Math.max(0, counterRef.current - 1);
      if (counterRef.current === 0) setActive(false);
    };
    const onDrop = (e: DragEvent): void => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      e.preventDefault();
      counterRef.current = 0;
      setActive(false);

      const file = e.dataTransfer.files?.[0];
      if (!file) return;
      if (!isSupported(file)) {
        setRejection(
          `${file.name} — we ingest .pdf, .csv, .md/.markdown right now.`,
        );
        setTimeout(() => setRejection(null), 4000);
        return;
      }
      openWithFile(file);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [openWithFile]);

  if (!active && !rejection) return null;

  if (rejection) {
    return (
      <div
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 md:bottom-8"
      >
        <div className="max-w-md rounded-md border border-warning-500/40 bg-surface-elevated px-4 py-3 text-sm text-warning-200 shadow-lg">
          {rejection}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-bg/85 backdrop-blur-sm"
    >
      <div className="rounded-xl border-2 border-dashed border-accent/60 bg-surface px-8 py-10 text-center shadow-2xl">
        <UploadCloud className="mx-auto mb-3 size-10 text-accent" strokeWidth={1.5} />
        <p className="text-base font-medium text-fg">Drop to ingest</p>
        <p className="mt-1 text-sm text-fg-muted">
          We'll parse, embed, and extract.
        </p>
        <p className="mt-3 text-xs text-fg-faint">.pdf · .csv · .md</p>
      </div>
    </div>
  );
};
