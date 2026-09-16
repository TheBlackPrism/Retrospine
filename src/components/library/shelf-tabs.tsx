"use client";

import { motion } from "motion/react";
import Link from "next/link";
import type { ReadingStatus } from "@/lib/db/schema";
import { READING_STATUSES, STATUS_LABELS } from "@/lib/shelves";
import { cn } from "@/lib/utils";

export function ShelfTabs({
  active,
  counts,
}: {
  active: ReadingStatus;
  counts: Record<ReadingStatus, number>;
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
      <div
        role="tablist"
        className="inline-flex gap-1 rounded-full border border-border/70 bg-card/70 p-1 shadow-sm backdrop-blur"
      >
        {READING_STATUSES.map((status) => {
          const isActive = status === active;
          return (
            <Link
              key={status}
              role="tab"
              aria-selected={isActive}
              href={`/library?shelf=${status}`}
              scroll={false}
              className={cn(
                "relative flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                isActive
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="shelf-pill"
                  className="absolute inset-0 rounded-full bg-primary shadow-lift"
                  transition={{ type: "spring", stiffness: 500, damping: 38 }}
                />
              )}
              <span className="relative">{STATUS_LABELS[status]}</span>
              <span
                className={cn(
                  "relative rounded-full px-1.5 text-[11px] tabular-nums",
                  isActive ? "bg-primary-foreground/20" : "bg-muted",
                )}
              >
                {counts[status]}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
