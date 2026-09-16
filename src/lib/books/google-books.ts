import { env } from "@/lib/env";
import type { BookMetadata } from "./types";

/**
 * Thin client for the Google Books Volumes API.
 * https://developers.google.com/books/docs/v1/using
 */

const API_BASE = "https://www.googleapis.com/books/v1";
const VOLUME_FIELDS =
  "id,volumeInfo(title,subtitle,authors,publisher,publishedDate,description,industryIdentifiers,pageCount,categories,imageLinks,language,seriesInfo)";

/** Shape of the parts of a Google Books volume we consume. */
export type GoogleVolume = {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
    pageCount?: number;
    categories?: string[];
    language?: string;
    imageLinks?: {
      smallThumbnail?: string;
      thumbnail?: string;
      small?: string;
      medium?: string;
      large?: string;
      extraLarge?: string;
    };
    /** Undocumented but present for many volumes that belong to a series. */
    seriesInfo?: {
      bookDisplayNumber?: string;
      volumeSeries?: {
        seriesId?: string;
        seriesBookType?: string;
        orderNumber?: number;
      }[];
    };
  };
};

export class GoogleBooksError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GoogleBooksError";
  }

  get isQuotaExceeded(): boolean {
    return this.status === 429 || this.status === 403;
  }
}

function buildUrl(path: string, params: Record<string, string | number>) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  const apiKey = env.googleBooksApiKey;
  if (apiKey) url.searchParams.set("key", apiKey);
  return url;
}

async function request<T>(url: URL, revalidateSeconds: number): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: revalidateSeconds },
  });
  if (!response.ok) {
    let message = `Google Books request failed with status ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // ignore unparsable error bodies
    }
    throw new GoogleBooksError(message, response.status);
  }
  return (await response.json()) as T;
}

/**
 * Normalises a Google Books cover link: forces https, drops the page-curl
 * decoration and requests a larger rendition for the `zoom` given.
 */
export function normalizeCoverUrl(
  raw: string | undefined,
  zoom: 1 | 2 | 3 = 1,
): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  url.protocol = "https:";
  url.searchParams.delete("edge");
  if (url.searchParams.has("zoom")) {
    url.searchParams.set("zoom", String(zoom));
  }
  return url.toString();
}

function parseOrderNumber(info: GoogleVolume["volumeInfo"]): number | null {
  const series = info?.seriesInfo?.volumeSeries?.[0];
  if (typeof series?.orderNumber === "number") return series.orderNumber;
  const display = info?.seriesInfo?.bookDisplayNumber;
  if (display) {
    const parsed = Number.parseFloat(display);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

export function normalizeVolume(volume: GoogleVolume): BookMetadata {
  const info = volume.volumeInfo ?? {};
  const identifiers = info.industryIdentifiers ?? [];
  const isbn13 =
    identifiers.find((i) => i.type === "ISBN_13")?.identifier ?? null;
  const isbn10 =
    identifiers.find((i) => i.type === "ISBN_10")?.identifier ?? null;
  const images = info.imageLinks ?? {};
  const bestLarge =
    images.extraLarge ??
    images.large ??
    images.medium ??
    images.small ??
    images.thumbnail ??
    images.smallThumbnail;
  const seriesId = info.seriesInfo?.volumeSeries?.[0]?.seriesId;

  return {
    googleId: volume.id,
    title: info.title?.trim() || "Untitled",
    subtitle: info.subtitle?.trim() || null,
    authors: (info.authors ?? []).map((a) => a.trim()).filter(Boolean),
    publisher: info.publisher?.trim() || null,
    publishedDate: info.publishedDate || null,
    description: info.description || null,
    pageCount:
      typeof info.pageCount === "number" && info.pageCount > 0
        ? info.pageCount
        : null,
    categories: info.categories ?? [],
    language: info.language || null,
    isbn13,
    isbn10,
    coverUrl: normalizeCoverUrl(bestLarge, 2),
    thumbnailUrl: normalizeCoverUrl(images.thumbnail ?? images.smallThumbnail, 1),
    googleSeries: seriesId
      ? { seriesId, position: parseOrderNumber(info) }
      : null,
  };
}

export type SearchResult = {
  items: BookMetadata[];
  totalItems: number;
};

export async function searchVolumes(
  query: string,
  options: { maxResults?: number; startIndex?: number } = {},
): Promise<SearchResult> {
  const trimmed = query.trim();
  if (!trimmed) return { items: [], totalItems: 0 };
  const url = buildUrl("/volumes", {
    q: trimmed,
    maxResults: Math.min(Math.max(options.maxResults ?? 20, 1), 40),
    startIndex: options.startIndex ?? 0,
    printType: "books",
    fields: `totalItems,items(${VOLUME_FIELDS})`,
  });
  const data = await request<{ totalItems?: number; items?: GoogleVolume[] }>(
    url,
    60 * 60,
  );
  return {
    items: (data.items ?? []).map(normalizeVolume),
    totalItems: data.totalItems ?? 0,
  };
}

export async function getVolume(googleId: string): Promise<BookMetadata | null> {
  const url = buildUrl(`/volumes/${encodeURIComponent(googleId)}`, {
    fields: VOLUME_FIELDS,
  });
  try {
    const volume = await request<GoogleVolume>(url, 60 * 60 * 24);
    return normalizeVolume(volume);
  } catch (error) {
    if (error instanceof GoogleBooksError && error.status === 404) return null;
    throw error;
  }
}

/** Escapes a value for use inside a quoted Google Books query term. */
export function quoteQueryTerm(value: string): string {
  return `"${value.replace(/"/g, "")}"`;
}
