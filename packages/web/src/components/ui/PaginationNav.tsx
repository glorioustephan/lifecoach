interface PaginationNavProps {
  currentPage: number;
  totalPages: number;
  itemsShown: number;
  totalItems: number;
  onLoadMore: () => void;
  isLoading?: boolean;
}

export function PaginationNav({
  currentPage,
  totalPages,
  itemsShown,
  totalItems,
  onLoadMore,
  isLoading,
}: PaginationNavProps): JSX.Element | null {
  // Don't show pagination if only one page
  if (totalPages <= 1) {
    return null;
  }

  const hasMore = currentPage < totalPages;

  return (
    <div className="flex items-center justify-between border-t border-border pt-4">
      <div className="flex-1" />
      <div className="text-center text-xs text-fg-muted">
        {itemsShown.toLocaleString()} of {totalItems.toLocaleString()}
      </div>
      <div className="flex flex-1 justify-end">
        {hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoading}
            className="rounded-md border border-border-subtle px-3 py-1.5 text-sm text-fg-muted transition-colors hover:border-accent/40 hover:bg-surface-elevated hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
