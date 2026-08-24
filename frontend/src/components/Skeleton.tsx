import { cn } from "../ui";

// Generic bar
interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}
export function Skeleton({ className, style }: SkeletonProps) {
  return <div className={cn("skeleton", className)} style={style} aria-hidden="true" />;
}

// Category card skeleton - matches popular category button shape
export function SkeletonCategoryCard({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-row items-center gap-[0.85rem] min-h-[4.8rem] min-w-0 py-[0.85rem] px-[1rem] rounded-[1.25rem] border border-solid border-[rgba(29,36,43,0.06)] bg-white overflow-hidden",
        compact && "min-h-14 py-2 px-[0.65rem] gap-[0.55rem]",
      )}
      aria-hidden="true"
    >
      <Skeleton className={cn("shrink-0 rounded-[0.85rem]", compact ? "w-8 h-8" : "w-[2.75rem] h-[2.75rem]")} />
      <div className="flex flex-col gap-[0.4rem] flex-1 min-w-0">
        <Skeleton className="h-[0.85rem] w-[65%] rounded-full" />
        <Skeleton className="h-[0.7rem] w-[40%] rounded-full" />
      </div>
    </div>
  );
}

// Provider card skeleton - matches ProviderCard shape
export function SkeletonCard() {
  return (
    <div
      className="rounded-2xl border border-solid border-[rgba(29,36,43,0.07)] bg-white p-4 flex flex-col gap-3 overflow-hidden"
      aria-hidden="true"
    >
      <div className="flex gap-3 items-start">
        <Skeleton className="shrink-0 w-12 h-12 rounded-xl" />
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-[0.95rem] w-[55%] rounded-full" />
          <Skeleton className="h-[0.75rem] w-[35%] rounded-full" />
        </div>
        <Skeleton className="shrink-0 w-16 h-7 rounded-full" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-[0.75rem] w-full rounded-full" />
        <Skeleton className="h-[0.75rem] w-[80%] rounded-full" />
      </div>
      <div className="flex gap-2 mt-1">
        <Skeleton className="h-8 flex-1 rounded-xl" />
        <Skeleton className="h-8 flex-1 rounded-xl" />
      </div>
    </div>
  );
}

// Table row skeleton
export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <Skeleton className="h-[0.8rem] rounded-full" style={{ width: i === 0 ? "60%" : "45%" }} />
        </td>
      ))}
    </tr>
  );
}

// Text lines skeleton
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  const widths = ["100%", "85%", "70%", "90%", "60%"];
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-[0.8rem] rounded-full" style={{ width: widths[i % widths.length] }} />
      ))}
    </div>
  );
}
