import type { ReadingEventType, ReadingStatus } from "@/lib/db/schema";

/** Pure constants shared by server and client code (no database imports). */

export const READING_STATUSES = [
  "reading",
  "want_to_read",
  "finished",
  "abandoned",
] as const satisfies readonly ReadingStatus[];

export const STATUS_LABELS: Record<ReadingStatus, string> = {
  reading: "Reading",
  want_to_read: "Want to read",
  finished: "Finished",
  abandoned: "Set aside",
};

export const EVENT_TYPES = [
  "started",
  "progress",
  "note",
  "finished",
  "abandoned",
] as const satisfies readonly ReadingEventType[];

export const EVENT_LABELS: Record<ReadingEventType, string> = {
  started: "Started reading",
  progress: "Progress",
  note: "Note",
  finished: "Finished reading",
  abandoned: "Set aside",
};

export function isReadingStatus(value: string): value is ReadingStatus {
  return (READING_STATUSES as readonly string[]).includes(value);
}

export function isEventType(value: string): value is ReadingEventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}
