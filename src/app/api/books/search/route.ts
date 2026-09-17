import { eq, inArray } from "drizzle-orm";
import type { SearchResult } from "@/components/search/search-view";
import { getSession } from "@/lib/auth/session";
import { collapseEditions, type EditionGroup } from "@/lib/books/editions";
import { GoogleBooksError, searchVolumes } from "@/lib/books/google-books";
import { adoptGoogleSeries } from "@/lib/books/series";
import { db, schema } from "@/lib/db";
import { languageFromAcceptHeader, normalizeLanguage } from "@/lib/languages";

/**
 * Google lists every edition it knows (hardcover, paperback, translations),
 * so the maximum is requested; Google currently answers with at most 20
 * volumes per request whatever `maxResults` says.
 */
const GOOGLE_RESULTS = 40;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const preferredLanguage =
    normalizeLanguage(session.user.preferredLanguage) ??
    languageFromAcceptHeader(request.headers.get("accept-language"));
  if (query.length < 2) {
    return Response.json({ items: [], totalItems: 0, preferredLanguage });
  }

  try {
    const { items, totalItems } = await searchVolumes(query, { maxResults: GOOGLE_RESULTS });
    const groups = collapseEditions(items, preferredLanguage);
    const results = await describeGroups(groups, session.user.id);
    return Response.json({ totalItems, preferredLanguage, items: results });
  } catch (error) {
    if (error instanceof GoogleBooksError && error.isQuotaExceeded) {
      return Response.json(
        {
          error:
            "Google Books is rate-limiting this server right now. Add a GOOGLE_BOOKS_API_KEY or try again later.",
        },
        { status: 503 },
      );
    }
    if (error instanceof GoogleBooksError && error.isTransient) {
      console.warn("[search] Google Books unavailable", error.message);
      return Response.json(
        {
          error:
            "Google Books is temporarily unavailable. Please try again in a moment.",
          transient: true,
        },
        { status: 503 },
      );
    }
    console.error("[search] failed", error);
    return Response.json(
      { error: "The search failed. Please try again." },
      { status: 502 },
    );
  }
}

/**
 * Turns each group of editions into one result: the edition the reader
 * already shelved, otherwise the best-ranked one, joined with what the
 * database knows (shelf status, series name) and with the series reference
 * pooled from the other editions.
 */
async function describeGroups(
  groups: EditionGroup[],
  userId: string,
): Promise<SearchResult[]> {
  const googleIds = groups
    .flatMap((group) => group.editions.map((edition) => edition.googleId))
    .filter((id): id is string => Boolean(id));
  const known = googleIds.length
    ? await db.query.books.findMany({
        where: inArray(schema.books.googleId, googleIds),
        columns: {
          id: true,
          googleId: true,
          seriesId: true,
          seriesPosition: true,
          seriesSource: true,
          googleSeriesId: true,
        },
        with: {
          entries: {
            where: eq(schema.libraryEntries.userId, userId),
            columns: { status: true },
          },
          series: { columns: { name: true } },
        },
      })
    : [];
  const byGoogleId = new Map(known.map((book) => [book.googleId, book]));

  const googleSeriesIds = [
    ...new Set(
      groups
        .map((group) => group.googleSeries?.seriesId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const namedSeries = googleSeriesIds.length
    ? await db.query.series.findMany({
        where: inArray(schema.series.googleSeriesId, googleSeriesIds),
        columns: { googleSeriesId: true, name: true },
      })
    : [];
  const nameByGoogleSeriesId = new Map(
    namedSeries.map((row) => [row.googleSeriesId, row.name]),
  );

  const results: SearchResult[] = [];
  for (const group of groups) {
    // Books stored before another edition revealed the series learn its id now.
    if (group.googleSeries) {
      for (const edition of group.editions) {
        const row = edition.googleId ? byGoogleId.get(edition.googleId) : undefined;
        if (!row || row.googleSeriesId) continue;
        try {
          await adoptGoogleSeries(row, group.googleSeries);
          row.googleSeriesId = group.googleSeries.seriesId;
          row.seriesPosition ??= group.googleSeries.position;
        } catch (error) {
          console.warn(`[search] could not store the series of book ${row.id}`, error);
        }
      }
    }

    // A book already on one of the reader's shelves stands for the work, whatever its language.
    const shelved = group.editions.find(
      (edition) => edition.googleId && byGoogleId.get(edition.googleId)?.entries.length,
    );
    const best = shelved ?? group.editions[0];
    const local = best.googleId ? byGoogleId.get(best.googleId) : undefined;

    const googleSeriesId = local?.googleSeriesId ?? group.googleSeries?.seriesId ?? null;
    const name =
      local?.series?.name ??
      (googleSeriesId ? (nameByGoogleSeriesId.get(googleSeriesId) ?? null) : null);
    const position = local?.seriesPosition ?? group.googleSeries?.position ?? null;

    results.push({
      googleId: best.googleId,
      title: best.title,
      subtitle: best.subtitle,
      authors: best.authors,
      publishedDate: best.publishedDate,
      pageCount: best.pageCount,
      thumbnailUrl: best.thumbnailUrl,
      language: normalizeLanguage(best.language),
      editions: group.editions.length,
      series: googleSeriesId || name ? { googleSeriesId, name, position } : null,
      bookId: local?.id ?? null,
      status: local?.entries[0]?.status ?? null,
    });
  }
  return results;
}
