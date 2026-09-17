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
const WORD_NUMBER = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve";
/** Volume markers: "Book 1", "Vol. 2", "Volume Three", "Band 4", "No. 5", "#6". */
const VOLUME_MARKER = new RegExp(
  String.raw`(?:\b(?:book|vol|volume|band|tome|no|nr)\.?|#)\s*\d+(?:\.\d+)?\b|\b(?:book|vol|volume|band|tome)\.?\s+(?:${WORD_NUMBER})\b`,
  "g",
);
/** Issue numbers that belong to the name of a comic or manga: "Sons of Ares Vol. 2", "House Atreides #3". */
const ISSUE_MARKER = /(?:\bvol\.?|#)\s*\d+(?:\.\d+)?\b/g;
/** Words that describe the printing rather than the book: "Deluxe Edition", "10th Anniversary Edition", "HC". */
const EDITION_ADJECTIVE = String.raw`\d+(?:st|nd|rd|th)|first|second|new|limited|deluxe|special|signed|collector['’]?s|anniversary|illustrated|expanded|revised|updated|annotated|definitive|hardcover|hardback|paperback|library|gift|premium|slipcased?|boxed|trade|export|international|unabridged|abridged|large\s+print|(?:movie|tv|film)\s+tie-in`;
const EDITION_MARKER = new RegExp(
  String.raw`(?:\b(?:${EDITION_ADJECTIVE})\s+)*(?:\b[\p{L}\p{N}'’-]+\s+)?\bedition\b|\b(?:hc|tpb?|hardcover|hardback|paperback)\b`,
  "gu",
);
/** A colon or a spaced dash separates a subtitle from the title. */
const SUBTITLE_SEPARATOR = /\s*:\s*|\s+[–—-]\s+/;
/** Products that bundle several volumes are their own work, never an edition. */
const BUNDLE = /\b(?:box\s*set|boxed|collection|omnibus|bundle|complete|books?\s+\d+\s*[-–]\s*\d+)\b/;
/** Subtitles that describe the form, the series or the marketing rather than naming a different book. */
const GENERIC_SUBTITLE: RegExp[] = [
  // "A Novel", "An Explosive Dystopian Sci-Fi Novel", "Roman", "An Expanse Short Story"
  /(?:^|\s)(?:novel|roman|thriller|memoir|novella|novelette|short story)$/,
  // "Red Rising Series 3", "The Third Book in the Globally Bestselling Red Rising Series"
  /\b(?:series|saga|trilogy|tetralogy|quartet|quintet|cycle|chronicles|sequence)\b/,
  // "Red Rising Book 2", "Book 9 of the Expanse", "Mistborn Book One", "The Book of Dust Volume Two"
  new RegExp(String.raw`\b(?:book|volume|band|tome)\.?\s*(?:\d+(?:\.\d+)?|${WORD_NUMBER})\b`),
  // "Vol. 2 of the Expanse"
  /^(?:vol\.?|#)\s*\d+(?:\.\d+)?\s+(?:of|in|from)\b/,
  // "The Final Instalment of …", "The Third Book in …"
  /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|final|latest|new|\d+(?:st|nd|rd|th))\s+(?:book|novel|volume|instal?lment)\b/,
  // Marketing: "The Sunday Times Bestseller", "Now a Major Netflix Series"
  /\b(?:bestsell(?:er|ing)|winner of|award-winning|prize-winning|now a (?:major|netflix|prime|hbo|bbc|disney|hulu|apple))\b/,
  /^\d+$/,
];

/**
 * The part of a (lower-cased) subtitle that names a different book, or ""
 * when the subtitle only describes the form ("A Novel"), the series ("Book 2
 * of the Red Rising Saga", "Red Rising 2") or the printing ("Deluxe
 * Edition"). Issue numbers inside a name are dropped ("Sons of Ares #3" and
 * "Sons of Ares Vol. 2 - Wrath" keep "sons of ares" and "sons of ares wrath").
 * Bundles and graphic novels keep the whole subtitle: they are their own work.
 */
function distinguishingSubtitle(subtitle: string): string {
  const text = subtitle.replace(/[^\p{L}\p{N}]+$/u, "").trim();
  if (!text) return "";
  if (BUNDLE.test(text) || text.includes("graphic novel")) return text;
  if (GENERIC_SUBTITLE.some((pattern) => pattern.test(text))) return "";
  const name = text
    .replace(ISSUE_MARKER, " ")
    .replace(EDITION_MARKER, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(?:the|a|an)?$/.test(name)) return "";
  // "Red Rising 2": a bare trailing number places the book in a series.
  if (/\s\d+(?:\.\d+)?$/.test(name)) return "";
  return name;
}

/**
 * Reduces a title to the key shared by all editions of the work: no
 * bracketed asides, no volume markers, and no subtitle unless it names a
 * different book ("Dune: House Atreides" stays apart from "Dune"). Google
 * sometimes reports the part after the colon as a separate `subtitle`; it
 * is treated exactly like a colon subtitle.
 */
export function workTitleKey(title: string, subtitle: string | null = null): string {
  const full = subtitle ? `${title}: ${subtitle}` : title;
  const lower = full.toLowerCase().replace(BRACKETED, " ");
  const [head = "", ...rest] = lower.split(SUBTITLE_SEPARATOR);
  const parts = [...new Set(rest.map((part) => part.trim()).filter(Boolean))];
  const name = distinguishingSubtitle(parts.join(" "));
  return fold(`${head.replace(VOLUME_MARKER, " ")} ${name}`);
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
  meta: Pick<BookMetadata, "title" | "authors" | "googleId"> & { subtitle?: string | null },
): string {
  const title = workTitleKey(meta.title, meta.subtitle ?? null);
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

/**
 * The series of the best edition that knows one, with the lowest volume
 * number any edition reports for it: the issues of a comic fold into their
 * volume, and the volume's own number is the lowest of them.
 */
function pooledSeries(editions: BookMetadata[]): GoogleSeriesRef | null {
  const first = editions.find((edition) => edition.googleSeries)?.googleSeries;
  if (!first) return null;
  const positions: number[] = [];
  for (const edition of editions) {
    const series = edition.googleSeries;
    if (series?.seriesId === first.seriesId && series.position !== null) {
      positions.push(series.position);
    }
  }
  return { seriesId: first.seriesId, position: positions.length ? Math.min(...positions) : null };
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
