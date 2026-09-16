/** Provider-agnostic book metadata used across the app. */
export type BookMetadata = {
  googleId: string | null;
  title: string;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  publishedDate: string | null;
  description: string | null;
  pageCount: number | null;
  categories: string[];
  language: string | null;
  isbn13: string | null;
  isbn10: string | null;
  /** Larger cover image, suitable for detail pages. */
  coverUrl: string | null;
  /** Small cover image, suitable for grids and lists. */
  thumbnailUrl: string | null;
  /** Series information as reported by Google Books (name is not exposed by the API). */
  googleSeries: { seriesId: string; position: number | null } | null;
};

export type SeriesHint = {
  name: string;
  position: number | null;
  source: "google" | "openlibrary" | "manual";
  googleSeriesId?: string | null;
};
