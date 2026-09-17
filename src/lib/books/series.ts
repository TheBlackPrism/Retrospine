import { and, eq, isNull, ne } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { Book, ReadingStatus, Series } from "@/lib/db/schema";
import type { GoogleSeriesRef } from "./editions";
import { quoteQueryTerm, searchVolumes } from "./google-books";
import { fetchEditionByIsbn, pickSeries, type ParsedSeries } from "./open-library";
import type { BookMetadata, SeriesHint } from "./types";

export function normalizeSeriesName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type DiscoveredSeries = SeriesHint & {
  openLibraryEditionKey: string | null;
  openLibraryWorkKey: string | null;
};

/**
 * Finds out which series a book belongs to.
 *
 * 1. Open Library editions carry a free-text `series` field ("Discworld, #3").
 * 2. Google Books sometimes knows the series id and volume number but never
 *    the series name. If we already know a series with that id, reuse it.
 */
export async function discoverSeries(
  meta: BookMetadata,
): Promise<DiscoveredSeries | null> {
  let parsed: ParsedSeries | null = null;
  let openLibraryEditionKey: string | null = null;
  let openLibraryWorkKey: string | null = null;

  for (const isbn of [meta.isbn13, meta.isbn10]) {
    if (!isbn) continue;
    try {
      const edition = await fetchEditionByIsbn(isbn);
      if (!edition) continue;
      openLibraryEditionKey ??= edition.key ?? null;
      openLibraryWorkKey ??= edition.works?.[0]?.key ?? null;
      parsed = pickSeries(edition.series);
      if (parsed) break;
    } catch (error) {
      console.warn(`[series] Open Library lookup failed for ${isbn}`, error);
    }
  }

  if (parsed) {
    return {
      name: parsed.name,
      position: parsed.position ?? meta.googleSeries?.position ?? null,
      source: "openlibrary",
      googleSeriesId: meta.googleSeries?.seriesId ?? null,
      openLibraryEditionKey,
      openLibraryWorkKey,
    };
  }

  if (meta.googleSeries) {
    const known = await db.query.series.findFirst({
      where: eq(schema.series.googleSeriesId, meta.googleSeries.seriesId),
    });
    if (known) {
      return {
        name: known.name,
        position: meta.googleSeries.position,
        source: "google",
        googleSeriesId: meta.googleSeries.seriesId,
        openLibraryEditionKey,
        openLibraryWorkKey,
      };
    }
  }

  return null;
}

/** Finds a series by name (case-insensitive) or Google id, creating it if needed. */
export async function upsertSeries(
  name: string,
  options: { googleSeriesId?: string | null; primaryAuthor?: string | null } = {},
): Promise<Series> {
  const trimmed = name.trim();
  const normalizedName = normalizeSeriesName(trimmed);
  const googleSeriesId = options.googleSeriesId ?? null;

  const byName = await db.query.series.findFirst({
    where: eq(schema.series.normalizedName, normalizedName),
  });
  if (byName) {
    if (googleSeriesId && !byName.googleSeriesId) {
      const clash = await db.query.series.findFirst({
        where: eq(schema.series.googleSeriesId, googleSeriesId),
      });
      if (!clash) {
        await db
          .update(schema.series)
          .set({ googleSeriesId })
          .where(eq(schema.series.id, byName.id));
      }
    }
    return byName;
  }

  if (googleSeriesId) {
    const byGoogle = await db.query.series.findFirst({
      where: eq(schema.series.googleSeriesId, googleSeriesId),
    });
    if (byGoogle) return byGoogle;
  }

  const [created] = await db
    .insert(schema.series)
    .values({
      name: trimmed,
      normalizedName,
      googleSeriesId,
      primaryAuthor: options.primaryAuthor ?? null,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const existing = await db.query.series.findFirst({
    where: eq(schema.series.normalizedName, normalizedName),
  });
  if (!existing) throw new Error("Failed to create series");
  return existing;
}

/** Links every book that shares a Google series id but has no series yet. */
async function linkSiblingsByGoogleId(seriesId: string, googleSeriesId: string) {
  await db
    .update(schema.books)
    .set({ seriesId })
    .where(
      and(
        eq(schema.books.googleSeriesId, googleSeriesId),
        isNull(schema.books.seriesId),
      ),
    );
}

export async function applyDiscoveredSeries(
  book: Pick<Book, "id" | "authors">,
  hint: DiscoveredSeries,
): Promise<void> {
  const seriesRow = await upsertSeries(hint.name, {
    googleSeriesId: hint.googleSeriesId,
    primaryAuthor: book.authors[0] ?? null,
  });
  await db
    .update(schema.books)
    .set({
      seriesId: seriesRow.id,
      seriesPosition: hint.position,
      seriesSource: hint.source,
      openLibraryEditionKey: hint.openLibraryEditionKey,
      openLibraryWorkKey: hint.openLibraryWorkKey,
    })
    .where(eq(schema.books.id, book.id));
  if (hint.googleSeriesId) {
    await linkSiblingsByGoogleId(seriesRow.id, hint.googleSeriesId);
  }
}

/**
 * Stores a Google series id learned from another edition of the same work on
 * a book that has none. The book joins a series that already carries the id;
 * a series the book already belongs to learns the id instead, so that other
 * volumes can be linked by it. Nothing changes for books that know their id.
 */
export async function adoptGoogleSeries(
  book: Pick<Book, "id" | "seriesId" | "seriesPosition" | "seriesSource" | "googleSeriesId">,
  ref: GoogleSeriesRef,
): Promise<void> {
  if (book.googleSeriesId) return;
  let seriesId = book.seriesId;
  if (seriesId) {
    const own = await db.query.series.findFirst({
      where: eq(schema.series.id, seriesId),
    });
    if (own && !own.googleSeriesId) {
      const clash = await db.query.series.findFirst({
        where: eq(schema.series.googleSeriesId, ref.seriesId),
      });
      if (!clash) {
        await db
          .update(schema.series)
          .set({ googleSeriesId: ref.seriesId })
          .where(eq(schema.series.id, seriesId));
      }
    }
  } else {
    const known = await db.query.series.findFirst({
      where: eq(schema.series.googleSeriesId, ref.seriesId),
    });
    seriesId = known?.id ?? null;
  }
  await db
    .update(schema.books)
    .set({
      googleSeriesId: ref.seriesId,
      seriesPosition: book.seriesPosition ?? ref.position,
      seriesId,
      seriesSource: book.seriesSource ?? "google",
    })
    .where(eq(schema.books.id, book.id));
  if (seriesId) await linkSiblingsByGoogleId(seriesId, ref.seriesId);
}

/** Manual override from the book page. Passing an empty name clears the series. */
export async function setBookSeries(
  bookId: string,
  input: { name: string; position: number | null },
): Promise<void> {
  const book = await db.query.books.findFirst({
    where: eq(schema.books.id, bookId),
  });
  if (!book) throw new Error("Book not found");
  const name = input.name.trim();
  if (!name) {
    await db
      .update(schema.books)
      .set({ seriesId: null, seriesPosition: null, seriesSource: null })
      .where(eq(schema.books.id, bookId));
    return;
  }
  const seriesRow = await upsertSeries(name, {
    googleSeriesId: book.googleSeriesId,
    primaryAuthor: book.authors[0] ?? null,
  });
  await db
    .update(schema.books)
    .set({
      seriesId: seriesRow.id,
      seriesPosition: input.position,
      seriesSource: "manual",
    })
    .where(eq(schema.books.id, bookId));
  if (book.googleSeriesId) {
    await linkSiblingsByGoogleId(seriesRow.id, book.googleSeriesId);
  }
}

/* -------------------------------------------------------------------------- */
/*  Other volumes in the same series                                           */
/* -------------------------------------------------------------------------- */

export type SeriesVolume = {
  key: string;
  title: string;
  authors: string[];
  position: number | null;
  publishedDate: string | null;
  thumbnailUrl: string | null;
  googleId: string | null;
  /** Set when the book already exists in our database. */
  bookId: string | null;
  /** Set when the current user has the book on a shelf. */
  status: ReadingStatus | null;
};

const BOX_SET_PATTERN =
  /\b(box\s*set|boxed|collection|omnibus|bundle|books?\s+\d+\s*[-–]\s*\d+|complete series|trilogy set|sampler|companion|coloring)\b/i;

/** Reduces a title to a comparable key: lower-case, no subtitle, no series suffix. */
export function volumeTitleKey(title: string, seriesName: string): string {
  let key = title.toLowerCase();
  const series = seriesName.toLowerCase();
  key = key.replace(/\([^)]*\)/g, " ");
  key = key.split(/[:–—]/)[0] ?? key;
  if (series) key = key.split(series).join(" ");
  key = key.replace(/\b(book|vol\.?|volume|no\.?|#)\s*\d+(\.\d+)?/g, " ");
  key = key.replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  return key;
}

export function sortVolumes(volumes: SeriesVolume[]): SeriesVolume[] {
  return [...volumes].sort((a, b) => {
    if (a.position !== null && b.position !== null && a.position !== b.position) {
      return a.position - b.position;
    }
    if (a.position !== null && b.position === null) return -1;
    if (a.position === null && b.position !== null) return 1;
    return (a.publishedDate ?? "9999").localeCompare(b.publishedDate ?? "9999");
  });
}

/**
 * Combines the books we already know in this series with suggestions from
 * Google Books. Results are de-duplicated by title and exclude the current book.
 */
export async function getSeriesVolumes(
  seriesRow: Series,
  current: Book,
  userId: string,
  limit = 24,
): Promise<SeriesVolume[]> {
  const local = await db.query.books.findMany({
    where: and(eq(schema.books.seriesId, seriesRow.id), ne(schema.books.id, current.id)),
    with: {
      entries: { where: eq(schema.libraryEntries.userId, userId) },
    },
  });

  const seen = new Set<string>([volumeTitleKey(current.title, seriesRow.name)]);
  const seenGoogleIds = new Set<string>(current.googleId ? [current.googleId] : []);
  const volumes: SeriesVolume[] = [];

  for (const book of local) {
    const key = volumeTitleKey(book.title, seriesRow.name);
    if (seen.has(key)) continue;
    seen.add(key);
    if (book.googleId) seenGoogleIds.add(book.googleId);
    volumes.push({
      key: `book:${book.id}`,
      title: book.title,
      authors: book.authors,
      position: book.seriesPosition,
      publishedDate: book.publishedDate,
      thumbnailUrl: book.thumbnailUrl,
      googleId: book.googleId,
      bookId: book.id,
      status: book.entries[0]?.status ?? null,
    });
  }

  try {
    const author = seriesRow.primaryAuthor ?? current.authors[0] ?? null;
    const query = author
      ? `${quoteQueryTerm(seriesRow.name)} inauthor:${quoteQueryTerm(author)}`
      : quoteQueryTerm(seriesRow.name);
    const { items } = await searchVolumes(query, { maxResults: 40 });
    const sameSeries = seriesRow.googleSeriesId
      ? items.filter((item) => item.googleSeries?.seriesId === seriesRow.googleSeriesId)
      : [];
    const candidates = sameSeries.length >= 2 ? sameSeries : items;

    for (const item of candidates) {
      if (!item.googleId || seenGoogleIds.has(item.googleId)) continue;
      if (BOX_SET_PATTERN.test(item.title)) continue;
      const key = volumeTitleKey(item.title, seriesRow.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      seenGoogleIds.add(item.googleId);
      volumes.push({
        key: `google:${item.googleId}`,
        title: item.title,
        authors: item.authors,
        position: item.googleSeries?.position ?? null,
        publishedDate: item.publishedDate,
        thumbnailUrl: item.thumbnailUrl,
        googleId: item.googleId,
        bookId: null,
        status: null,
      });
    }
  } catch (error) {
    console.warn("[series] Google Books lookup for other volumes failed", error);
  }

  return sortVolumes(volumes).slice(0, limit);
}
