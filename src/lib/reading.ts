import type { ReadingEvent } from "@/lib/db/schema";

/** Pure helpers that derive display data from a book's timeline. */

export type Progress = {
  percent: number | null;
  page: number | null;
  asOf: Date | null;
};

type EventLike = Pick<ReadingEvent, "type" | "occurredAt" | "page" | "percent"> & {
  createdAt?: Date;
};

/** Newest first; events on the same instant are ordered by creation time. */
function byNewest(a: EventLike, b: EventLike): number {
  const byTime = b.occurredAt.getTime() - a.occurredAt.getTime();
  if (byTime !== 0) return byTime;
  return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
}

/** Latest known reading progress, taking page counts into account. */
export function deriveProgress(
  events: EventLike[],
  pageCount: number | null,
): Progress {
  const ordered = [...events].sort(byNewest);
  const latest = ordered[0];
  if (!latest) return { percent: null, page: null, asOf: null };
  if (latest.type === "finished") {
    return { percent: 100, page: pageCount, asOf: latest.occurredAt };
  }
  // Walk back to the most recent progress marker after the last start.
  for (const event of ordered) {
    if (event.type === "started") {
      return { percent: 0, page: 0, asOf: event.occurredAt };
    }
    if (event.type !== "progress") continue;
    if (event.percent !== null) {
      const page =
        event.page ??
        (pageCount ? Math.round((event.percent / 100) * pageCount) : null);
      return { percent: clamp(event.percent), page, asOf: event.occurredAt };
    }
    if (event.page !== null) {
      const percent = pageCount
        ? clamp(Math.round((event.page / pageCount) * 100))
        : null;
      return { percent, page: event.page, asOf: event.occurredAt };
    }
  }
  return { percent: null, page: null, asOf: null };
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export type ReadingSession = {
  startedAt: Date;
  endedAt: Date | null;
  outcome: "finished" | "abandoned" | null;
  days: number | null;
};

/** Pairs each "started" event with the next finished/abandoned event. */
export function deriveSessions(events: EventLike[]): ReadingSession[] {
  const ordered = [...events].sort((a, b) => byNewest(b, a));
  const sessions: ReadingSession[] = [];
  let open: ReadingSession | null = null;
  for (const event of ordered) {
    if (event.type === "started") {
      if (open) sessions.push(open);
      open = { startedAt: event.occurredAt, endedAt: null, outcome: null, days: null };
    } else if (event.type === "finished" || event.type === "abandoned") {
      if (!open) continue;
      open.endedAt = event.occurredAt;
      open.outcome = event.type;
      open.days = Math.max(
        1,
        Math.round(
          (event.occurredAt.getTime() - open.startedAt.getTime()) / 86_400_000,
        ),
      );
      sessions.push(open);
      open = null;
    }
  }
  if (open) sessions.push(open);
  return sessions;
}
