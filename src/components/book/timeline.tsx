"use client";

import {
  BookmarkCheck,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  StickyNote,
  Trash2,
} from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteMilestoneAction } from "@/lib/actions/library";
import type { ReadingEventSource, ReadingEventType } from "@/lib/db/schema";
import { formatDate } from "@/lib/format";
import { EVENT_LABELS } from "@/lib/shelves";
import { cn } from "@/lib/utils";

export type TimelineEvent = {
  id: string;
  type: ReadingEventType;
  occurredAt: string;
  page: number | null;
  percent: number | null;
  note: string | null;
  source?: ReadingEventSource;
};

const ICONS: Record<ReadingEventType, typeof PlayCircle> = {
  started: PlayCircle,
  progress: BookmarkCheck,
  note: StickyNote,
  finished: CheckCircle2,
  abandoned: PauseCircle,
};

const TONES: Record<ReadingEventType, string> = {
  started: "bg-amber-soft text-amber-foreground",
  progress: "bg-secondary text-secondary-foreground",
  note: "bg-secondary text-secondary-foreground",
  finished:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100",
  abandoned: "bg-muted text-muted-foreground",
};

export function Timeline({
  events,
  bookId,
  pageCount,
}: {
  events: TimelineEvent[];
  bookId: string;
  pageCount: number | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove(eventId: string) {
    if (!window.confirm("Delete this milestone?")) return;
    startTransition(async () => {
      const result = await deleteMilestoneAction(eventId, bookId);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (!events.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border/80 px-4 py-6 text-center text-sm text-muted-foreground">
        No milestones yet. Add when you started, where you are or when you
        finished.
      </p>
    );
  }

  return (
    <ol className="relative space-y-1 before:absolute before:top-3 before:bottom-3 before:left-[17px] before:w-px before:bg-border">
      {events.map((event, index) => {
        const Icon = ICONS[event.type];
        const detail =
          event.type === "progress"
            ? [
                event.page !== null
                  ? `Page ${event.page}${pageCount ? ` of ${pageCount}` : ""}`
                  : null,
                event.percent !== null ? `${event.percent}%` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : null;
        return (
          <motion.li
            key={event.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: Math.min(index, 6) * 0.05 }}
            className="group relative flex gap-3 rounded-xl py-2 pr-1 pl-0.5"
          >
            <span
              className={cn(
                "relative z-10 grid size-8 shrink-0 place-items-center rounded-full ring-4 ring-background",
                TONES[event.type],
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">
                  {EVENT_LABELS[event.type]}
                  {detail ? (
                    <span className="font-normal text-muted-foreground"> · {detail}</span>
                  ) : null}
                  {event.source === "tolino" ? (
                    <span
                      title="Synced from Tolino Cloud"
                      className="ml-2 rounded-full bg-amber-soft px-1.5 py-0.5 align-middle text-[10px] font-semibold text-amber-foreground"
                    >
                      tolino
                    </span>
                  ) : null}
                </p>
                <time
                  dateTime={event.occurredAt}
                  className="shrink-0 text-xs text-muted-foreground tabular-nums"
                >
                  {formatDate(event.occurredAt)}
                </time>
              </div>
              {event.note ? (
                <p className="mt-1 text-sm whitespace-pre-line text-foreground/80">
                  {event.note}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Delete milestone"
              disabled={pending}
              onClick={() => remove(event.id)}
              className="mt-1 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 hover:text-destructive"
            >
              <Trash2 />
            </Button>
          </motion.li>
        );
      })}
    </ol>
  );
}
