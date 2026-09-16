import { and, eq, isNull } from "drizzle-orm";
import { GoogleBooksError, quoteQueryTerm, searchVolumes } from "@/lib/books/google-books";
import type { BookMetadata } from "@/lib/books/types";
import { db, schema } from "@/lib/db";
import type {
  LibraryEntry,
  ReadingEvent,
  ReadingEventType,
  ReadingStatus,
  TolinoBook,
  TolinoConnection,
  TolinoMatchSource,
  TolinoSyncSummary,
} from "@/lib/db/schema";
import { createBookFromMetadata, findBookByGoogleId } from "@/lib/library";
import { fetchInventory, fetchReadingState, TolinoError } from "./client";
import {
  claimSyncRun,
  finishSyncRun,
  getTolinoConnection,
  getTolinoSession,
} from "./connection";
import {
  normalizeTitle,
  readingStateFor,
  titlesMatch,
  type TolinoPublication,
  type TolinoReadingState,
} from "./parse";

/**
 * Turns the Tolino library into shelves and milestones.
 *
 * Every publication is matched to a book (by ISBN, then Google Books, then
 * created from the Tolino metadata) and its reading position is compared with
 * the state recorded by the previous sync, so that re-running the sync only
 * adds what changed. Milestones written here carry `source = "tolino"`.
 */

export type SyncTrigger = "manual" | "scheduled";
export type SyncOutcome =
  | { ok: true; summary: TolinoSyncSummary }
  | { ok: false; error: string };

/** Pause between Google Books lookups so a large first import stays polite. */
const GOOGLE_PAUSE_MS = 150;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- */
/*  Entry point                                                                */
/* -------------------------------------------------------------------------- */

export function describeSyncError(error: unknown): string {
  if (error instanceof TolinoError) {
    if (error.kind === "auth") return `Tolino Cloud sign-in failed: ${error.message}`;
    return error.message;
  }
  if (error instanceof GoogleBooksError) {
    return error.isQuotaExceeded
      ? "Google Books is rate-limiting this server; the remaining books will be matched on the next sync."
      : `Google Books is unavailable: ${error.message}`;
  }
  if (error instanceof Error && error.message) return error.message;
  return "The sync failed for an unknown reason.";
}

/** Runs a sync for a connection that `claimSyncRun` already marked as running. */
export async function runClaimedSync(
  connection: TolinoConnection,
  trigger: SyncTrigger,
): Promise<SyncOutcome> {
  const started = Date.now();
  try {
    const session = await getTolinoSession(connection);
    const [publications, states] = await Promise.all([
      fetchInventory(session),
      fetchReadingState(session),
    ]);
    const summary = await applyPublications(connection, publications, states);
    await finishSyncRun(connection.id, { ok: true, summary });
    console.log(
      `[tolino] ${trigger} sync for user ${connection.userId}: ${summary.books} books, ${summary.matched} matched, ${summary.added} added, ${summary.events} milestones, ${summary.skipped} skipped, ${summary.deferred} deferred (${Date.now() - started}ms)`,
    );
    return { ok: true, summary };
  } catch (error) {
    const message = describeSyncError(error);
    console.error(`[tolino] ${trigger} sync for user ${connection.userId} failed: ${message}`, error);
    await finishSyncRun(connection.id, { ok: false, error: message }).catch((inner) =>
      console.error("[tolino] could not record the sync failure", inner),
    );
    return { ok: false, error: message };
  }
}

/** Claims and runs a sync for the user; used by the scheduler. */
export async function runTolinoSync(
  userId: string,
  trigger: SyncTrigger = "manual",
): Promise<SyncOutcome> {
  const connection = await getTolinoConnection(userId);
  if (!connection) return { ok: false, error: "Tolino Cloud is not connected." };
  const claimed = await claimSyncRun(connection.id);
  if (!claimed) return { ok: false, error: "A sync is already running." };
  return runClaimedSync(connection, trigger);
}

/* -------------------------------------------------------------------------- */
/*  Publications → books                                                       */
/* -------------------------------------------------------------------------- */

type Match = { bookId: string; source: TolinoMatchSource };

class GoogleUnavailable extends Error {
  constructor(public readonly cause: GoogleBooksError) {
    super(cause.message);
    this.name = "GoogleUnavailable";
  }
}

function lastNames(names: string[]): Set<string> {
  return new Set(
    names
      .map((name) => normalizeTitle(name).split(" ").pop() ?? "")
      .filter((name) => name.length > 1),
  );
}

/** True when the author lists share a surname, or when one of them is empty. */
export function authorsOverlap(a: string[], b: string[]): boolean {
  const left = lastNames(a);
  const right = lastNames(b);
  if (!left.size || !right.size) return true;
  for (const name of right) if (left.has(name)) return true;
  return false;
}

async function findByIsbn(isbn13: string): Promise<string | null> {
  const local = await db.query.books.findFirst({
    where: eq(schema.books.isbn13, isbn13),
    columns: { id: true },
  });
  return local?.id ?? null;
}

async function importFromGoogle(meta: BookMetadata): Promise<string> {
  const existing = meta.googleId ? await findBookByGoogleId(meta.googleId) : null;
  if (existing) return existing.id;
  const book = await createBookFromMetadata(meta);
  return book.id;
}

/** Looks the publication up on Google Books, by ISBN first and then by title and author. */
async function matchViaGoogle(publication: TolinoPublication): Promise<Match | null> {
  const queries: string[] = [];
  if (publication.isbn13) queries.push(`isbn:${publication.isbn13}`);
  const title = publication.title.trim();
  if (title) {
    const author = publication.authors[0];
    queries.push(
      author
        ? `intitle:${quoteQueryTerm(title)} inauthor:${quoteQueryTerm(author)}`
        : `intitle:${quoteQueryTerm(title)}`,
    );
  }
  for (const query of queries) {
    let items: BookMetadata[];
    try {
      ({ items } = await searchVolumes(query, { maxResults: 5 }));
    } catch (error) {
      if (error instanceof GoogleBooksError && (error.isQuotaExceeded || error.isTransient)) {
        throw new GoogleUnavailable(error);
      }
      console.warn(`[tolino] Google Books lookup failed for "${publication.title}"`, error);
      continue;
    } finally {
      await sleep(GOOGLE_PAUSE_MS);
    }
    const byIsbn = publication.isbn13
      ? items.find((item) => item.isbn13 === publication.isbn13)
      : undefined;
    const candidate =
      byIsbn ??
      items.find(
        (item) =>
          titlesMatch(item.title, publication.title) &&
          authorsOverlap(item.authors, publication.authors),
      );
    if (candidate?.googleId) {
      return { bookId: await importFromGoogle(candidate), source: "google" };
    }
  }
  return null;
}

/** Last resort: a book made from the Tolino metadata alone (uploads, unknown editions). */
async function createFromTolino(publication: TolinoPublication): Promise<Match> {
  const existing = await db.query.books.findFirst({
    where: and(isNull(schema.books.googleId), eq(schema.books.title, publication.title)),
    columns: { id: true, authors: true },
  });
  if (existing && authorsOverlap(existing.authors, publication.authors)) {
    return { bookId: existing.id, source: "tolino" };
  }
  const book = await createBookFromMetadata({
    googleId: null,
    title: publication.title,
    subtitle: publication.subtitle,
    authors: publication.authors,
    publisher: publication.publisher,
    publishedDate: null,
    description: null,
    pageCount: null,
    categories: [],
    language: publication.language,
    isbn13: publication.isbn13,
    isbn10: null,
    coverUrl: publication.coverUrl,
    thumbnailUrl: publication.coverUrl,
    googleSeries: null,
  });
  return { bookId: book.id, source: "tolino" };
}

async function matchPublication(
  publication: TolinoPublication,
  googleAvailable: boolean,
): Promise<Match | "deferred"> {
  if (publication.isbn13) {
    const local = await findByIsbn(publication.isbn13);
    if (local) return { bookId: local, source: "isbn" };
  }
  if (!googleAvailable) return "deferred";
  const viaGoogle = await matchViaGoogle(publication);
  if (viaGoogle) return viaGoogle;
  return createFromTolino(publication);
}

/* -------------------------------------------------------------------------- */
/*  Reading state → shelves and milestones                                     */
/* -------------------------------------------------------------------------- */

type Applied = { added: number; events: number };

const secondBefore = (date: Date) => new Date(date.getTime() - 1000);

async function createEntry(
  userId: string,
  bookId: string,
  status: ReadingStatus,
): Promise<LibraryEntry> {
  const [entry] = await db
    .insert(schema.libraryEntries)
    .values({ userId, bookId, status })
    .returning();
  return entry;
}

async function insertEvent(
  entryId: string,
  type: ReadingEventType,
  occurredAt: Date,
  percent: number | null = null,
): Promise<void> {
  await db.insert(schema.readingEvents).values({
    entryId,
    type,
    occurredAt,
    percent,
    source: "tolino",
  });
}

async function setStatus(entryId: string, status: ReadingStatus): Promise<void> {
  await db
    .update(schema.libraryEntries)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.libraryEntries.id, entryId));
}

function latestEventTime(events: ReadingEvent[]): Date | null {
  let latest: Date | null = null;
  for (const event of events) {
    if (!latest || event.occurredAt > latest) latest = event.occurredAt;
  }
  return latest;
}

/** Whether the timeline currently has a "started" without a later finished/set aside. */
function hasOpenSession(events: ReadingEvent[]): boolean {
  const ordered = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  let open = false;
  for (const event of ordered) {
    if (event.type === "started") open = true;
    else if (event.type === "finished" || event.type === "abandoned") open = false;
  }
  return open;
}

/**
 * Records what changed since the previous sync on the user's shelf entry.
 * `previous` is the state stored by the last sync (null progress when new).
 */
export async function applyReadingState(
  userId: string,
  bookId: string,
  previous: Pick<TolinoBook, "progress" | "finished">,
  state: TolinoReadingState | null,
  importUnread: boolean,
  now: Date,
): Promise<Applied> {
  const result: Applied = { added: 0, events: 0 };
  const progress = state?.progress ?? null;
  const finished = state?.finished ?? false;
  const progressAt = state?.progressAt ?? now;
  const finishedAt = state?.finishedAt ?? state?.progressAt ?? now;
  const opened = progress !== null && progress > 0;

  const entry = await db.query.libraryEntries.findFirst({
    where: and(eq(schema.libraryEntries.userId, userId), eq(schema.libraryEntries.bookId, bookId)),
    with: { events: true },
  });

  // Never opened: at most put it on the wishlist.
  if (!finished && !opened) {
    if (!entry && importUnread) {
      await createEntry(userId, bookId, "want_to_read");
      result.added++;
    }
    return result;
  }

  if (!entry) {
    if (finished) {
      const created = await createEntry(userId, bookId, "finished");
      await insertEvent(created.id, "finished", finishedAt);
      result.events++;
    } else {
      const created = await createEntry(userId, bookId, "reading");
      await insertEvent(created.id, "started", secondBefore(progressAt));
      await insertEvent(created.id, "progress", progressAt, progress);
      result.events += 2;
    }
    result.added++;
    return result;
  }

  const latestAt = latestEventTime(entry.events);
  const terminal = entry.status === "finished" || entry.status === "abandoned";

  if (finished) {
    if (previous.finished || entry.status === "finished") return result;
    // The reader set the book aside after the Tolino position was written: keep that decision.
    if (entry.status === "abandoned" && latestAt && finishedAt <= latestAt) return result;
    await insertEvent(entry.id, "finished", finishedAt);
    await setStatus(entry.id, "finished");
    result.events++;
    return result;
  }

  if (!opened) return result;
  if (previous.progress === progress && !previous.finished) return result;

  const rewind = previous.progress !== null && progress < previous.progress;
  if (terminal || previous.finished || rewind) {
    // A re-read (position moved backwards) or reading resumed after the book
    // was finished or set aside. Only when the position is newer than the
    // latest milestone, otherwise the Tolino state is stale.
    if (latestAt && progressAt <= latestAt) return result;
    await insertEvent(entry.id, "started", secondBefore(progressAt));
    await insertEvent(entry.id, "progress", progressAt, progress);
    await setStatus(entry.id, "reading");
    result.events += 2;
    return result;
  }

  if (!hasOpenSession(entry.events)) {
    await insertEvent(entry.id, "started", secondBefore(progressAt));
    result.events++;
  }
  await insertEvent(entry.id, "progress", progressAt, progress);
  result.events++;
  await setStatus(entry.id, "reading");
  return result;
}

/* -------------------------------------------------------------------------- */
/*  The run                                                                    */
/* -------------------------------------------------------------------------- */

async function upsertTolinoBook(
  userId: string,
  publication: TolinoPublication,
  existing: TolinoBook | undefined,
  now: Date,
): Promise<TolinoBook> {
  const values = {
    kind: publication.kind,
    title: publication.title,
    subtitle: publication.subtitle,
    authors: publication.authors,
    isbn13: publication.isbn13 ?? existing?.isbn13 ?? null,
    publisher: publication.publisher,
    language: publication.language,
    coverUrl: publication.coverUrl ?? existing?.coverUrl ?? null,
    purchasedAt: publication.purchasedAt,
    lastSeenAt: now,
  };
  if (existing) {
    const [row] = await db
      .update(schema.tolinoBooks)
      .set(values)
      .where(eq(schema.tolinoBooks.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(schema.tolinoBooks)
    .values({ userId, publicationId: publication.publicationId, ...values })
    .onConflictDoUpdate({
      target: [schema.tolinoBooks.userId, schema.tolinoBooks.publicationId],
      set: values,
    })
    .returning();
  return row;
}

async function applyPublications(
  connection: TolinoConnection,
  publications: TolinoPublication[],
  states: Map<string, TolinoReadingState>,
): Promise<TolinoSyncSummary> {
  const now = new Date();
  const summary: TolinoSyncSummary = {
    books: 0,
    matched: 0,
    added: 0,
    events: 0,
    skipped: 0,
    deferred: 0,
  };
  const existingRows = await db.query.tolinoBooks.findMany({
    where: eq(schema.tolinoBooks.userId, connection.userId),
  });
  const existing = new Map(existingRows.map((row) => [row.publicationId, row]));
  let googleAvailable = true;

  for (const publication of publications) {
    if (publication.isSample) continue;
    if (publication.kind === "audiobook" && !connection.includeAudiobooks) continue;
    summary.books++;

    const row = await upsertTolinoBook(connection.userId, publication, existing.get(publication.publicationId), now);
    if (row.ignored) {
      summary.skipped++;
      continue;
    }

    let bookId = row.bookId;
    let matchSource = row.matchSource;
    if (bookId) {
      const stillThere = await db.query.books.findFirst({
        where: eq(schema.books.id, bookId),
        columns: { id: true },
      });
      if (!stillThere) bookId = null;
    }
    if (!bookId) {
      let match: Match | "deferred";
      try {
        match = await matchPublication(publication, googleAvailable);
      } catch (error) {
        if (error instanceof GoogleUnavailable) {
          console.warn("[tolino] Google Books unavailable, deferring unmatched books", error.cause.message);
          googleAvailable = false;
          match = "deferred";
        } else {
          console.error(`[tolino] could not match "${publication.title}"`, error);
          summary.skipped++;
          continue;
        }
      }
      if (match === "deferred") {
        summary.deferred++;
        continue;
      }
      bookId = match.bookId;
      matchSource = match.source;
    }
    summary.matched++;

    const state = readingStateFor(states, publication);
    try {
      const applied = await applyReadingState(
        connection.userId,
        bookId,
        row,
        state,
        connection.importUnread,
        now,
      );
      summary.added += applied.added;
      summary.events += applied.events;
    } catch (error) {
      console.error(`[tolino] could not record "${publication.title}"`, error);
      summary.skipped++;
      continue;
    }

    await db
      .update(schema.tolinoBooks)
      .set({
        bookId,
        matchSource,
        progress: state?.progress ?? row.progress,
        progressAt: state?.progressAt ?? row.progressAt,
        finished: state?.finished ?? row.finished,
        finishedAt: state?.finished ? (state.finishedAt ?? row.finishedAt) : row.finishedAt,
      })
      .where(eq(schema.tolinoBooks.id, row.id));
  }

  return summary;
}
