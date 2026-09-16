import { eq, inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { GoogleBooksError, searchVolumes } from "@/lib/books/google-books";
import { db, schema } from "@/lib/db";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return Response.json({ items: [], totalItems: 0 });

  try {
    const { items, totalItems } = await searchVolumes(query, { maxResults: 20 });
    const googleIds = items
      .map((item) => item.googleId)
      .filter((id): id is string => Boolean(id));

    const known = googleIds.length
      ? await db.query.books.findMany({
          where: inArray(schema.books.googleId, googleIds),
          columns: { id: true, googleId: true },
          with: {
            entries: {
              where: eq(schema.libraryEntries.userId, session.user.id),
              columns: { status: true },
            },
          },
        })
      : [];
    const byGoogleId = new Map(known.map((book) => [book.googleId, book]));

    return Response.json({
      totalItems,
      items: items.map((item) => {
        const local = item.googleId ? byGoogleId.get(item.googleId) : undefined;
        return {
          googleId: item.googleId,
          title: item.title,
          subtitle: item.subtitle,
          authors: item.authors,
          publishedDate: item.publishedDate,
          pageCount: item.pageCount,
          thumbnailUrl: item.thumbnailUrl,
          bookId: local?.id ?? null,
          status: local?.entries[0]?.status ?? null,
        };
      }),
    });
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
