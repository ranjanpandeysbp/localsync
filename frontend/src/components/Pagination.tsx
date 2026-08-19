import { useMemo } from "react";
import { btnSecondary, cn } from "../ui";

export interface PaginationProps {
  page: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  className?: string;
  itemLabel?: string;
  showItemCount?: boolean;
  scrollToTopRef?: React.RefObject<HTMLElement | null>;
}

export function Pagination({
  page,
  totalItems,
  pageSize = 10,
  onPageChange,
  className,
  itemLabel = "items",
  showItemCount = true,
  scrollToTopRef,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  const pages = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, "ellipsis", totalPages];
    }
    if (currentPage >= totalPages - 3) {
      return [1, "ellipsis", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", totalPages];
  }, [currentPage, totalPages]);

  if (totalItems <= pageSize && !showItemCount) {
    return null;
  }

  function handlePageSelect(p: number) {
    if (p < 1 || p > totalPages || p === currentPage) return;
    onPageChange(p);
    if (scrollToTopRef?.current) {
      scrollToTopRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 pt-3 pb-1 text-ink text-[0.88rem]",
        className,
      )}
      aria-label="Pagination Navigation"
    >
      {showItemCount && (
        <p className="m-0 text-muted font-medium text-[0.86rem]">
          {totalItems === 0 ? (
            `0 ${itemLabel}`
          ) : (
            <>
              Showing <span className="font-semibold text-ink">{startItem}–{endItem}</span> of{" "}
              <span className="font-semibold text-ink">{totalItems}</span> {itemLabel}
            </>
          )}
        </p>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center gap-1.5 flex-wrap ml-auto" aria-label="Page selection">
          <button
            type="button"
            className={cn(btnSecondary, "py-1.5 px-3 text-[0.84rem] h-9 min-w-9")}
            disabled={currentPage <= 1}
            onClick={() => handlePageSelect(currentPage - 1)}
            aria-label="Go to previous page"
          >
            Previous
          </button>

          <div className="flex items-center gap-1">
            {pages.map((p, idx) => {
              if (p === "ellipsis") {
                return (
                  <span
                    key={`ellipsis-${idx}`}
                    className="grid place-items-center w-7 h-9 text-muted font-bold select-none"
                    aria-hidden="true"
                  >
                    …
                  </span>
                );
              }
              const pageNumber = p as number;
              const isCurrent = pageNumber === currentPage;
              return (
                <button
                  key={pageNumber}
                  type="button"
                  className={cn(
                    "min-w-9 h-9 px-2 rounded-xl border border-solid font-semibold text-[0.84rem] cursor-pointer transition-colors duration-150",
                    isCurrent
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-white/80 text-ink border-[rgba(29,36,43,0.12)] hover:border-primary/30 hover:bg-primary/5",
                  )}
                  aria-current={isCurrent ? "page" : undefined}
                  aria-label={`Page ${pageNumber}`}
                  onClick={() => handlePageSelect(pageNumber)}
                >
                  {pageNumber}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className={cn(btnSecondary, "py-1.5 px-3 text-[0.84rem] h-9 min-w-9")}
            disabled={currentPage >= totalPages}
            onClick={() => handlePageSelect(currentPage + 1)}
            aria-label="Go to next page"
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
