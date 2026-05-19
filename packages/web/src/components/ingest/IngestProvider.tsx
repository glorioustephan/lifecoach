import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface Ctx {
  pendingFile: File | null;
  openWithFile: (file: File) => void;
  close: () => void;
}

const IngestContext = createContext<Ctx | null>(null);

/**
 * Shared state for the drag-drop ingest flow. Lives at the root so:
 *  - DropZone (global overlay) can open the sheet on file drop
 *  - The composer's paperclip can open the sheet from a file picker
 *  - The IngestSheet itself can close from the modal
 *
 * Holds a single File at a time — multi-file ingest is a future iteration.
 */
export const IngestProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const openWithFile = useCallback((file: File) => setPendingFile(file), []);
  const close = useCallback(() => setPendingFile(null), []);
  const value = useMemo<Ctx>(
    () => ({ pendingFile, openWithFile, close }),
    [pendingFile, openWithFile, close],
  );
  return <IngestContext.Provider value={value}>{children}</IngestContext.Provider>;
};

export const useIngest = (): Ctx => {
  const ctx = useContext(IngestContext);
  if (!ctx) throw new Error("useIngest must be used inside IngestProvider");
  return ctx;
};
