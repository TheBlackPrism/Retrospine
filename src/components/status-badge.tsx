import type { ReadingStatus } from "@/lib/db/schema";
import { STATUS_LABELS } from "@/lib/shelves";
import { cn } from "@/lib/utils";

const STYLES: Record<ReadingStatus, string> = {
  reading: "bg-amber-soft text-amber-foreground",
  want_to_read: "bg-secondary text-secondary-foreground",
  finished:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  abandoned: "bg-muted text-muted-foreground",
};

export function StatusBadge({
  status,
  className,
}: {
  status: ReadingStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
