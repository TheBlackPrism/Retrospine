/**
 * Minimal Open Library client, used as a fallback source for series data
 * and covers. https://openlibrary.org/developers/api
 */

const API_BASE = "https://openlibrary.org";

export type OpenLibraryEdition = {
  key: string;
  title?: string;
  series?: string[];
  works?: { key: string }[];
  covers?: number[];
  number_of_pages?: number;
  publish_date?: string;
  isbn_13?: string[];
  isbn_10?: string[];
};

export type ParsedSeries = {
  name: string;
  position: number | null;
};

const POSITION_WORDS =
  "(?:#|no\\.?|nr\\.?|vol\\.?|volume|book|bk\\.?|part|tome|band|episode|issue)";
const NUMBER = "(\\d+(?:[.,]\\d+)?)";

const PATTERNS: RegExp[] = [
  // "Harry Potter, #1"  "Discworld ; 3"  "The Expanse: Book 2"  "Dune -- 4"
  new RegExp(
    `^(.+?)\\s*(?:[,;:]|--|—|–)\\s*${POSITION_WORDS}?\\s*${NUMBER}\\s*$`,
    "i",
  ),
  // "Discworld (3)"  "Foundation (Book 1)"  "Wheel of Time (#5)"
  new RegExp(
    `^(.+?)\\s*\\(\\s*${POSITION_WORDS}?\\s*${NUMBER}\\s*\\)\\s*$`,
    "i",
  ),
  // "Discworld #3"  "Foundation Book 1"  "Dune Vol. 2"
  new RegExp(`^(.+?)\\s+${POSITION_WORDS}\\s*${NUMBER}\\s*$`, "i"),
  // "Book 1 of Foundation"
  new RegExp(`^${POSITION_WORDS}\\s*${NUMBER}\\s+of\\s+(.+?)\\s*$`, "i"),
];

function cleanName(name: string): string {
  return name
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/[\s,;:\-–—]+$/g, "")
    .replace(/\s+(series|saga|trilogy|cycle)$/i, (match) => match)
    .trim();
}

/**
 * Parses Open Library's free-text series strings such as
 * "Harry Potter, #1", "Discworld (3)" or "The Expanse ; 2".
 */
export function parseSeriesString(raw: string): ParsedSeries | null {
  const value = raw.trim();
  if (!value) return null;
  for (const [index, pattern] of PATTERNS.entries()) {
    const match = value.match(pattern);
    if (!match) continue;
    const isReversed = index === PATTERNS.length - 1;
    const name = cleanName(isReversed ? match[2] : match[1]);
    const positionRaw = (isReversed ? match[1] : match[2]).replace(",", ".");
    const position = Number.parseFloat(positionRaw);
    if (!name) continue;
    return { name, position: Number.isFinite(position) ? position : null };
  }
  const name = cleanName(value);
  return name ? { name, position: null } : null;
}

/** Picks the most informative series entry out of an edition's list. */
export function pickSeries(entries: string[] | undefined): ParsedSeries | null {
  if (!entries?.length) return null;
  const parsed = entries
    .map(parseSeriesString)
    .filter((entry): entry is ParsedSeries => entry !== null);
  return parsed.find((entry) => entry.position !== null) ?? parsed[0] ?? null;
}

export function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[^0-9Xx]/g, "").toUpperCase();
}

export async function fetchEditionByIsbn(
  isbn: string,
): Promise<OpenLibraryEdition | null> {
  const cleaned = normalizeIsbn(isbn);
  if (cleaned.length !== 10 && cleaned.length !== 13) return null;
  const response = await fetch(`${API_BASE}/isbn/${cleaned}.json`, {
    headers: { Accept: "application/json" },
    redirect: "follow",
    next: { revalidate: 60 * 60 * 24 * 7 },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Open Library request failed with status ${response.status}`);
  }
  return (await response.json()) as OpenLibraryEdition;
}

export function coverUrlForIsbn(
  isbn: string,
  size: "S" | "M" | "L" = "L",
): string {
  return `https://covers.openlibrary.org/b/isbn/${normalizeIsbn(isbn)}-${size}.jpg?default=false`;
}

export function coverUrlForId(id: number, size: "S" | "M" | "L" = "L"): string {
  return `https://covers.openlibrary.org/b/id/${id}-${size}.jpg?default=false`;
}
