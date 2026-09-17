import { normalizeLanguage } from "@/lib/languages";
import type { BookMetadata } from "./types";

/**
 * Collapses the many editions Google Books returns for one work (hardcover,
 * paperback, e-book, translations, reissues) into a single search result.
 *
 * Google has no notion of a "work", so editions are recognised by a
 * normalised title plus the first author's surname. Within a group the
 * edition in the reader's language wins, then the one with the richest
 * metadata, then the one Google ranked higher. Series information is pooled:
 * the group carries it as soon as any edition does, so the main result
 * reflects it even when the winning edition lacks it.
 */

export type GoogleSeriesRef = { seriesId: string; position: number | null };

export type EditionGroup = {
  /** Comparable key: normalised title plus the first author's surname. */
  key: string;
  /** Every edition of the work, best first. */
  editions: BookMetadata[];
  /** Series reference from the best-ranked edition that has one. */
  googleSeries: GoogleSeriesRef | null;
};

/** Lower-case, accent-free, letters and digits only. */
function fold(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bracketed asides: "(Red Rising Series Book 1)", "[Illustrated Edition]". */
const BRACKETED = /[([{][^)\]}]*(?:[)\]}]|$)/g;
/** Volume markers: "Book 1", "Vol. 2", "Volume 3", "Band 4", "No. 5", "#6". */
const VOLUME_MARKER = /(?:\b(?:book|vol|volume|band|tome|no|nr)\.?|#)\s*\d+(?:\.\d+)?\b/g;
/** A colon or a spaced dash separates a subtitle from the title. */
const SUBTITLE_SEPARATOR = /\s*:\s*|\s+[–—-]\s+/;
/** Products that bundle several volumes are their own work, never an edition. */
const BUNDLE = /\b(?:box\s*set|boxed|collection|omnibus|bundle|complete|books?\s+\d+\s*[-–]\s*\d+)\b/;
/** Subtitles that describe the edition or the series rather than naming a different book. */
const GENERIC_SUBTITLE = [
  /^(?:a |an |the |ein |eine |un |une )?(?:[\p{L}'’ ]+ )?(?:novel|roman|thriller|memoir|novella)$/u,
  /(?:\b(?:book|vol|volume|band|tome|no|nr)\.?|#)\s*\d+/,
  /\b(?:series|saga|trilogy|cycle|chronicles)\b/,
  /^\d+$/,
];

function isGenericSubtitle(subtitle: string): boolean {
  if (BUNDLE.test(subtitle) || subtitle.includes("graphic novel")) return false;
  return GENERIC_SUBTITLE.some((pattern) => pattern.test(subtitle));
}

/**
 * Reduces a title to the key shared by all editions of the work: no
 * bracketed asides, no volume markers, and no subtitle unless it names a
 * different book ("Dune: House Atreides" stays apart from "Dune").
 */
export function workTitleKey(title: string): string {
  const lower = title.toLowerCase().replace(BRACKETED, " ");
  const [head = "", ...rest] = lower.split(SUBTITLE_SEPARATOR);
  const subtitle = rest.join(" ").trim();
  const base = subtitle && !isGenericSubtitle(subtitle) ? `${head} ${subtitle}` : head;
  return fold(base.replace(VOLUME_MARKER, " "));
}

/** The first author's surname ("J. K. Rowling" and "Rowling, J. K." both give "rowling"). */
function surnameKey(authors: string[]): string {
  const first = authors[0];
  if (!first) return "";
  const family = first.includes(",") ? (first.split(",")[0] ?? "") : first;
  const parts = fold(family)
    .split(" ")
    .filter((part) => part.length > 1);
  return parts[parts.length - 1] ?? "";
}

/** Key under which editions of the same work are grouped. */
export function editionKey(
  meta: Pick<BookMetadata, "title" | "authors" | "googleId">,
): string {
  const title = workTitleKey(meta.title);
  if (!title) return `id:${meta.googleId ?? meta.title}`;
  return `${title}|${surnameKey(meta.authors)}`;
}

function editionScore(meta: BookMetadata, preferred: string | null): number {
  let score = 0;
  if (preferred) {
    const language = normalizeLanguage(meta.language);
    if (language === preferred) score += 100;
    else if (language === null) score += 50;
  }
  if (meta.thumbnailUrl) score += 8;
  if (meta.isbn13 || meta.isbn10) score += 4;
  if (meta.googleSeries) score += 2;
  if (meta.description) score += 1;
  if (meta.pageCount) score += 1;
  return score;
}

/** The series of the best edition that knows one; the volume number may come from a sibling. */
function pooledSeries(editions: BookMetadata[]): GoogleSeriesRef | null {
  const first = editions.find((edition) => edition.googleSeries)?.googleSeries;
  if (!first) return null;
  if (first.position !== null) return { seriesId: first.seriesId, position: first.position };
  const numbered = editions.find(
    (edition) =>
      edition.googleSeries?.seriesId === first.seriesId &&
      edition.googleSeries.position !== null,
  );
  return { seriesId: first.seriesId, position: numbered?.googleSeries?.position ?? null };
}

/**
 * Groups search results into works, keeping Google's order of first
 * appearance. `preferredLanguage` is an ISO 639-1 code or null for no preference.
 */
export function collapseEditions(
  items: BookMetadata[],
  preferredLanguage: string | null,
): EditionGroup[] {
  const preferred = normalizeLanguage(preferredLanguage);
  const groups = new Map<string, { meta: BookMetadata; index: number }[]>();
  items.forEach((meta, index) => {
    const key = editionKey(meta);
    const members = groups.get(key);
    if (members) members.push({ meta, index });
    else groups.set(key, [{ meta, index }]);
  });

  return [...groups.entries()].map(([key, members]) => {
    const editions = members
      .map((member) => ({ ...member, score: editionScore(member.meta, preferred) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((member) => member.meta);
    return { key, editions, googleSeries: pooledSeries(editions) };
  });
}
