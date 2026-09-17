import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import type { GoogleSeriesRef } from "@/lib/books/editions";
import { findOrCreateBookByGoogleId } from "@/lib/library";

/**
 * The search links here with `?series=<google series id>&position=<n>` when
 * another edition of the work reported the series, so the import can keep it.
 */
function seriesFromParams(params: Record<string, string | string[] | undefined>): GoogleSeriesRef | null {
  const seriesId = typeof params.series === "string" ? params.series.trim() : "";
  if (!seriesId || seriesId.length > 100) return null;
  const raw = typeof params.position === "string" && params.position.trim() ? Number(params.position) : NaN;
  const position = Number.isFinite(raw) && raw >= 0 && raw <= 9999 ? raw : null;
  return { seriesId, position };
}

/** Stores a Google Books volume locally on first visit, then shows it. */
export default async function GoogleBookPage(
  props: PageProps<"/books/google/[googleId]">,
) {
  await requireSession();
  const [{ googleId }, params] = await Promise.all([props.params, props.searchParams]);
  let bookId: string;
  try {
    const book = await findOrCreateBookByGoogleId(googleId, {
      series: seriesFromParams(params),
    });
    bookId = book.id;
  } catch (error) {
    console.warn("[books] could not import Google volume", googleId, error);
    notFound();
  }
  redirect(`/books/${bookId}`);
}
