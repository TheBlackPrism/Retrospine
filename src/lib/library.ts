import { and, count, desc, eq } from "drizzle-orm";
import type { GoogleSeriesRef } from "@/lib/books/editions";
import { getVolume } from "@/lib/books/google-books";
import { adoptGoogleSeries, applyDiscoveredSeries, discoverSeries } from "@/lib/books/series";
import type { BookMetadata } from "@/lib/books/types";
import { db, schema } from "@/lib/db";
import type {
  Book,
  LibraryEntry,
  ReadingEvent,
  ReadingEventType,
  ReadingStatus,
  Series,
} from "@/lib/db/schema";

export {
  EVENT_LABELS,
  EVENT_TYPES,
  READING_STATUSES,
  STATUS_LABELS,
  isEventType,
  isReadingStatus,
} from "@/lib/shelves";

/** Status a shelf entry moves to when an event of this type is recorded. */
const EVENT_TO_STATUS: Partial<Record<ReadingEventType, ReadingStatus>> = {
  started: "reading",
  progress: "reading",
  finished: "finished",
  abandoned: "abandoned",
};

/** Event recorded when a status is changed by hand. */
const STATUS_TO_EVENT: Partial<Record<ReadingStatus, ReadingEventType>> = {
  reading: "started",
  finished: "finished",
  abandoned: "abandoned",
};

export type BookWithSeries = Book & { series: Series | null };
export type ShelfItem = LibraryEntry & { book: BookWithSeries };
export type EntryDetail = LibraryEntry & {
  book: BookWithSeries;
  events: ReadingEvent[];
};

/* -------------------------------------------------------------------------- */
/*  Books                                                                      */
/* -------------------------------------------------------------------------- */

export async function getBook(bookId: string): Promise<BookWithSeries | null> {
  const book = await db.query.books.findFirst({
    where: eq(schema.books.id, bookId),
    with: { series: true },
  });
  return book ?? null;
}

export async function findBookByGoogleId(
  googleId: string,
): Promise<BookWithSeries | null> {
  const book = await db.query.books.findFirst({
    where: eq(schema.books.googleId, googleId),
    with: { series: true },
  });
  return book ?? null;
}

/**
 * Stores a Google Books volume locally (idempotent) and resolves its series.
 * `series` is the Google series reference pooled from other editions of the
 * work by the search; it fills in for volumes that do not carry their own.
 */
export async function findOrCreateBookByGoogleId(
  googleId: string,
  options: { series?: GoogleSeriesRef | null } = {},
): Promise<BookWithSeries> {
  const hint = options.series ?? null;
  const existing = await findBookByGoogleId(googleId);
  if (existing) {
    if (!hint || existing.googleSeriesId) return existing;
    await adoptGoogleSeries(existing, hint);
    return (await getBook(existing.id)) ?? existing;
  }
  const meta = await getVolume(googleId);
  if (!meta) throw new Error("This book could not be found on Google Books.");
  return createBookFromMetadata(
    hint && !meta.googleSeries ? { ...meta, googleSeries: hint } : meta,
  );
}

export async function createBookFromMetadata(
  meta: BookMetadata,
): Promise<BookWithSeries> {
  const values = {
    googleId: meta.googleId,
    isbn13: meta.isbn13,
    isbn10: meta.isbn10,
    title: meta.title,
    subtitle: meta.subtitle,
    authors: meta.authors,
    publisher: meta.publisher,
    publishedDate: meta.publishedDate,
    description: meta.description,
    pageCount: meta.pageCount,
    categories: meta.categories,
    language: meta.language,
    coverUrl: meta.coverUrl,
    thumbnailUrl: meta.thumbnailUrl,
    googleSeriesId: meta.googleSeries?.seriesId ?? null,
    seriesPosition: meta.googleSeries?.position ?? null,
    seriesSource: meta.googleSeries ? ("google" as const) : null,
  };

  const [inserted] = meta.googleId
    ? await db
        .insert(schema.books)
        .values(values)
        .onConflictDoNothing({ target: schema.books.googleId })
        .returning()
    : await db.insert(schema.books).values(values).returning();

  const book =
    inserted ??
    (meta.googleId ? await findBookByGoogleId(meta.googleId) : null);
  if (!book) throw new Error("Failed to store the book.");

  if (inserted) {
    // Best effort: series discovery must never block adding a book.
    try {
      const hint = await discoverSeries(meta);
      if (hint) await applyDiscoveredSeries(book, hint);
    } catch (error) {
      console.warn("[series] discovery failed", error);
    }
  }

  const fresh = await getBook(book.id);
  if (!fresh) throw new Error("Failed to load the stored book.");
  return fresh;
}

/* -------------------------------------------------------------------------- */
/*  Shelves                                                                    */
/* -------------------------------------------------------------------------- */

export async function listShelf(
  userId: string,
  status: ReadingStatus,
): Promise<ShelfItem[]> {
  return db.query.libraryEntries.findMany({
    where: and(
      eq(schema.libraryEntries.userId, userId),
      eq(schema.libraryEntries.status, status),
    ),
    with: { book: { with: { series: true } } },
    orderBy: [desc(schema.libraryEntries.updatedAt)],
  });
}

export async function getShelfCounts(
  userId: string,
): Promise<Record<ReadingStatus, number>> {
  const rows = await db
    .select({ status: schema.libraryEntries.status, value: count() })
    .from(schema.libraryEntries)
    .where(eq(schema.libraryEntries.userId, userId))
    .groupBy(schema.libraryEntries.status);
  const counts: Record<ReadingStatus, number> = {
    reading: 0,
    want_to_read: 0,
    finished: 0,
    abandoned: 0,
  };
  for (const row of rows) counts[row.status] = row.value;
  return counts;
}

export async function getEntryForBook(
  userId: string,
  bookId: string,
): Promise<EntryDetail | null> {
  const entry = await db.query.libraryEntries.findFirst({
    where: and(
      eq(schema.libraryEntries.userId, userId),
      eq(schema.libraryEntries.bookId, bookId),
    ),
    with: {
      book: { with: { series: true } },
      events: {
        orderBy: [
          desc(schema.readingEvents.occurredAt),
          desc(schema.readingEvents.createdAt),
        ],
      },
    },
  });
  return entry ?? null;
}

async function requireEntry(
  userId: string,
  entryId: string,
): Promise<LibraryEntry> {
  const entry = await db.query.libraryEntries.findFirst({
    where: and(
      eq(schema.libraryEntries.id, entryId),
      eq(schema.libraryEntries.userId, userId),
    ),
  });
  if (!entry) throw new Error("This book is not on your shelves.");
  return entry;
}

export async function addBookToLibrary(
  userId: string,
  bookId: string,
  status: ReadingStatus,
): Promise<LibraryEntry> {
  const existing = await db.query.libraryEntries.findFirst({
    where: and(
      eq(schema.libraryEntries.userId, userId),
      eq(schema.libraryEntries.bookId, bookId),
    ),
  });
  if (existing) {
    if (existing.status === status) return existing;
    return setEntryStatus(userId, existing.id, status);
  }
  const [entry] = await db
    .insert(schema.libraryEntries)
    .values({ userId, bookId, status })
    .returning();
  const eventType = STATUS_TO_EVENT[status];
  if (eventType) {
    await db
      .insert(schema.readingEvents)
      .values({ entryId: entry.id, type: eventType });
  }
  return entry;
}

export async function setEntryStatus(
  userId: string,
  entryId: string,
  status: ReadingStatus,
): Promise<LibraryEntry> {
  const entry = await requireEntry(userId, entryId);
  if (entry.status === status) return entry;
  const [updated] = await db
    .update(schema.libraryEntries)
    .set({ status })
    .where(eq(schema.libraryEntries.id, entryId))
    .returning();
  const eventType = STATUS_TO_EVENT[status];
  if (eventType) {
    await db
      .insert(schema.readingEvents)
      .values({ entryId, type: eventType });
  }
  return updated;
}

export async function removeFromLibrary(
  userId: string,
  entryId: string,
): Promise<void> {
  await requireEntry(userId, entryId);
  await db
    .delete(schema.libraryEntries)
    .where(eq(schema.libraryEntries.id, entryId));
}

/* -------------------------------------------------------------------------- */
/*  Milestones                                                                 */
/* -------------------------------------------------------------------------- */

export type ReadingEventInput = {
  type: ReadingEventType;
  occurredAt: Date;
  page?: number | null;
  percent?: number | null;
  note?: string | null;
};

export async function addReadingEvent(
  userId: string,
  entryId: string,
  input: ReadingEventInput,
): Promise<ReadingEvent> {
  const entry = await requireEntry(userId, entryId);
  const [event] = await db
    .insert(schema.readingEvents)
    .values({
      entryId,
      type: input.type,
      occurredAt: input.occurredAt,
      page: input.page ?? null,
      percent: input.percent ?? null,
      note: input.note?.trim() || null,
    })
    .returning();
  const nextStatus = EVENT_TO_STATUS[input.type];
  if (nextStatus && nextStatus !== entry.status) {
    await db
      .update(schema.libraryEntries)
      .set({ status: nextStatus })
      .where(eq(schema.libraryEntries.id, entryId));
  } else {
    await db
      .update(schema.libraryEntries)
      .set({ updatedAt: new Date() })
      .where(eq(schema.libraryEntries.id, entryId));
  }
  return event;
}

export async function deleteReadingEvent(
  userId: string,
  eventId: string,
): Promise<void> {
  const event = await db.query.readingEvents.findFirst({
    where: eq(schema.readingEvents.id, eventId),
    with: { entry: true },
  });
  if (!event || event.entry.userId !== userId) {
    throw new Error("Milestone not found.");
  }
  await db.delete(schema.readingEvents).where(eq(schema.readingEvents.id, eventId));
}
