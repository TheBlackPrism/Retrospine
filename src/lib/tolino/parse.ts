/**
 * Pure helpers that turn Tolino Cloud responses into plain values.
 * No database or network access, so everything here is unit-testable.
 */

export type TolinoKind = "ebook" | "upload" | "audiobook";

export type TolinoPublication = {
  /** Identifier used in reading-state paths, e.g. `DT0400.9783641243609_A40398678`. */
  publicationId: string;
  /** Deliverable id when it differs from the publication id (uploads). */
  deliverableId: string | null;
  kind: TolinoKind;
  title: string;
  subtitle: string | null;
  authors: string[];
  isbn13: string | null;
  publisher: string | null;
  language: string | null;
  coverUrl: string | null;
  purchasedAt: Date | null;
  /** Free reading samples ("Leseprobe") are not real books. */
  isSample: boolean;
};

export type TolinoReadingState = {
  /** Reading progress in percent (0–100), null when the book was never opened. */
  progress: number | null;
  progressAt: Date | null;
  /** Marked as finished in Tolino, or read to (almost) the last page. */
  finished: boolean;
  finishedAt: Date | null;
};

/**
 * Reading positions are pages of the reader's own pagination, and the last
 * pages of an e-book are usually imprint and advertising. A book whose
 * position is at or beyond this share counts as finished.
 */
export const FINISHED_AT_PROGRESS = 0.98;

/** Names of the system tags the tolino apps use for "finished" books. */
const FINISHED_TAGS = new Set([
  "collection_finished_readings_name",
  "collection_finished_hearing_name",
]);

/* -------------------------------------------------------------------------- */
/*  ISBN                                                                       */
/* -------------------------------------------------------------------------- */

export function isbn10To13(isbn10: string): string | null {
  const digits = isbn10.replace(/[^0-9X]/gi, "").toUpperCase();
  if (digits.length !== 10) return null;
  const core = `978${digits.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < core.length; i++) {
    sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return `${core}${check}`;
}

/** Accepts ISBN-13, EAN or ISBN-10 in any formatting and returns an ISBN-13. */
export function normalizeIsbn13(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (cleaned.length === 13 && /^97[89]\d{10}$/.test(cleaned)) return cleaned;
  if (cleaned.length === 10) return isbn10To13(cleaned);
  return null;
}

/** Purchased publications embed the ISBN: `DT0400.9783641243609_A40398678`. */
export function isbnFromPublicationId(publicationId: string): string | null {
  const match = publicationId.match(/(?:^|[^0-9])(97[89]\d{10})(?:[^0-9]|$)/);
  return match ? match[1] : null;
}

/* -------------------------------------------------------------------------- */
/*  Titles                                                                     */
/* -------------------------------------------------------------------------- */

/** Lower-case, accent-free, punctuation-free form used to compare titles. */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when two titles are the same book, ignoring subtitles and punctuation. */
export function titlesMatch(a: string, b: string): boolean {
  const left = normalizeTitle(a.split(/[:–—(]/)[0] ?? a);
  const right = normalizeTitle(b.split(/[:–—(]/)[0] ?? b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  return short.length >= 6 && long.startsWith(`${short} `);
}

/* -------------------------------------------------------------------------- */
/*  Inventory                                                                  */
/* -------------------------------------------------------------------------- */

type RawAuthor =
  | string
  | { name?: string | null; firstName?: string | null; lastName?: string | null }
  | null;

type RawFileResource = { type?: string | null; resource?: string | null } | null;

type RawDeliverable = {
  identifier?: string | null;
  title?: string | null;
  subtitle?: string | null;
  purchased?: number | string | null;
  issued?: number | string | null;
  contentFormat?: string | null;
  preview?: boolean | null;
  fileResource?: RawFileResource[] | null;
};

type RawEpubMetaData = {
  identifier?: string | null;
  title?: string | null;
  subtitle?: string | null;
  author?: RawAuthor[] | string | null;
  isbn?: string | null;
  publisher?: string | null;
  language?: string | null;
  type?: string | null;
  issued?: number | string | null;
  deliverable?: RawDeliverable[] | null;
  fileResource?: RawFileResource[] | null;
  ext_data?: { cover?: string | null } | null;
};

type RawInventoryItem = {
  resellerId?: string | number | null;
  epubMetaData?: RawEpubMetaData | null;
};

/** Item shape of the newer inventory service (`/v8/inventory`). */
type RawInventoryV2Item = {
  uuid?: string | null;
  publicationId?: string | null;
  contentType?: string | null;
  authors?: RawAuthor[] | null;
  title?: string | null;
  subtitle?: string | null;
  isbnEan?: string | null;
  language?: string | null;
  publisher?: string | null;
  purchasedDate?: number | string | null;
  fileResources?: RawFileResource[] | null;
  contentSources?: string[] | null;
  defaultCover?: boolean | string | null;
};

const INVENTORY_BUCKETS: Record<string, TolinoKind> = {
  ebook: "ebook",
  edata: "upload",
  audiobook: "audiobook",
};

function kindFromType(type: string | null | undefined, fallback: TolinoKind): TolinoKind {
  switch ((type ?? "").toUpperCase()) {
    case "EBOOK":
      return "ebook";
    case "EDATA":
      return "upload";
    case "AUDIOBOOK":
      return "audiobook";
    default:
      return fallback;
  }
}

function authorNames(raw: RawAuthor[] | string | null | undefined): string[] {
  if (!raw) return [];
  const list = typeof raw === "string" ? [raw] : raw;
  const names: string[] = [];
  for (const entry of list) {
    if (!entry) continue;
    const name =
      typeof entry === "string"
        ? entry
        : entry.name?.trim() ||
          [entry.firstName, entry.lastName].filter(Boolean).join(" ");
    const trimmed = name.trim();
    if (trimmed && !names.includes(trimmed)) names.push(trimmed);
  }
  return names;
}

function toDate(value: number | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const millis = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(millis) || millis <= 0) return null;
  const date = new Date(millis);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Cover URLs that need the Tolino auth headers cannot be shown by a browser. */
function publicCoverUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (parsed.hostname === "bosh.pageplace.de") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** Mirrors the web reader: scaled cover first, then the plain cover image. */
function pickCover(
  primary: RawFileResource[] | null | undefined,
  secondary: RawFileResource[] | null | undefined,
  kind: TolinoKind,
): string | null {
  const suffix = kind === "ebook" ? "?size=BS-B03" : kind === "audiobook" ? "?size=WS-B04" : "";
  const lists = [primary ?? [], secondary ?? []];
  for (const type of ["SCALEDCOVER", "COVER_IMAGE"]) {
    for (const list of lists) {
      const hit = list.find((resource) => resource?.type === type && resource.resource);
      if (hit?.resource) return publicCoverUrl(`${hit.resource}${suffix}`);
    }
  }
  const front = lists[0].find((resource) => resource?.type === "FRONTCOVERIMAGE");
  return publicCoverUrl(front?.resource);
}

function fromLegacyItem(item: RawInventoryItem, bucketKind: TolinoKind): TolinoPublication[] {
  const meta = item.epubMetaData;
  if (!meta) return [];
  const kind = kindFromType(meta.type, bucketKind);
  const deliverables = meta.deliverable?.length ? meta.deliverable : [{} as RawDeliverable];
  const publications: TolinoPublication[] = [];
  for (const deliverable of deliverables) {
    const publicationId = (meta.identifier ?? deliverable.identifier ?? "").trim();
    if (!publicationId) continue;
    const deliverableId = deliverable.identifier?.trim() || null;
    const title = (deliverable.title ?? meta.title ?? "").trim() || "Untitled";
    publications.push({
      publicationId,
      deliverableId: deliverableId && deliverableId !== publicationId ? deliverableId : null,
      kind,
      title,
      subtitle: (deliverable.subtitle ?? meta.subtitle ?? "").trim() || null,
      authors: authorNames(meta.author),
      isbn13: normalizeIsbn13(meta.isbn) ?? isbnFromPublicationId(publicationId),
      publisher: meta.publisher?.trim() || null,
      language: meta.language?.trim() || null,
      coverUrl:
        meta.ext_data?.cover === "default"
          ? null
          : pickCover(meta.fileResource, deliverable.fileResource, kind),
      purchasedAt: toDate(deliverable.purchased) ?? toDate(meta.issued),
      isSample: deliverable.preview === true,
    });
  }
  return publications;
}

function fromV2Item(item: RawInventoryV2Item): TolinoPublication | null {
  const publicationId = (item.publicationId ?? item.uuid ?? "").trim();
  if (!publicationId) return null;
  const sources = (item.contentSources ?? []).map((source) => String(source).toUpperCase());
  const kind = sources.includes("USER_UPLOAD")
    ? "upload"
    : kindFromType(item.contentType, "ebook");
  const uuid = item.uuid?.trim() || null;
  return {
    publicationId,
    deliverableId: uuid && uuid !== publicationId ? uuid : null,
    kind,
    title: item.title?.trim() || "Untitled",
    subtitle: item.subtitle?.trim() || null,
    authors: authorNames(item.authors),
    isbn13: normalizeIsbn13(item.isbnEan) ?? isbnFromPublicationId(publicationId),
    publisher: item.publisher?.trim() || null,
    language: item.language?.trim() || null,
    coverUrl: item.defaultCover ? null : pickCover(item.fileResources, null, kind),
    purchasedAt: toDate(item.purchasedDate),
    isSample: sources.includes("PREVIEW"),
  };
}

/**
 * Normalises an inventory response. Understands the `PublicationInventory`
 * document of `bosh/rest/inventory/delta` as well as the paged
 * `{ page: { content: [] } }` document of the newer inventory service.
 */
export function parseInventory(json: unknown): TolinoPublication[] {
  if (!json || typeof json !== "object") return [];
  const root = json as {
    PublicationInventory?: Record<string, RawInventoryItem[] | null>;
    page?: { content?: RawInventoryV2Item[] | null };
    content?: RawInventoryV2Item[] | null;
  };
  const seen = new Set<string>();
  const result: TolinoPublication[] = [];
  const push = (publication: TolinoPublication | null) => {
    if (!publication || seen.has(publication.publicationId)) return;
    seen.add(publication.publicationId);
    result.push(publication);
  };

  if (root.PublicationInventory && typeof root.PublicationInventory === "object") {
    for (const [bucket, kind] of Object.entries(INVENTORY_BUCKETS)) {
      const items = root.PublicationInventory[bucket];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (item) fromLegacyItem(item, kind).forEach(push);
      }
    }
    return result;
  }

  const content = root.page?.content ?? root.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item) push(fromV2Item(item));
    }
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/*  Reading state (sync-data patches)                                          */
/* -------------------------------------------------------------------------- */

type RawPatchValue = {
  modified?: number | string | null;
  progress?: number | string | null;
  name?: string | null;
  category?: string | null;
  currentPosition?: string | number | null;
  lastPosition?: string | number | null;
};

export type RawPatch = {
  op?: string | null;
  path?: string | null;
  value?: RawPatchValue | null;
};

type Bookmark = { progress: number; modified: number };
type FinishedTag = { finished: boolean; modified: number };

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Splits `/publications/<id>/bookmark/<unit>` into its parts. */
export function parsePatchPath(
  path: string | null | undefined,
): { collection: string; publicationId: string; kind: string } | null {
  if (!path) return null;
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 3) return null;
  return { collection: parts[0], publicationId: parts[1], kind: parts[2] };
}

/**
 * The web reader keeps the newer of two bookmarks; when they were written
 * within two minutes of each other, the one further into the book wins.
 */
function newerBookmark(current: Bookmark | undefined, next: Bookmark): Bookmark {
  if (!current) return next;
  if (Math.abs(next.modified - current.modified) <= 120_000) {
    return next.progress > current.progress ? next : current;
  }
  return next.modified > current.modified ? next : current;
}

/** Collects the patches a sync-data response may spread over several keys. */
export function collectPatches(json: unknown): RawPatch[] {
  if (!json || typeof json !== "object") return [];
  const root = json as {
    patches?: RawPatch[] | null;
    conflicts?: { serverState?: RawPatch | null }[] | null;
  };
  const patches = Array.isArray(root.patches) ? [...root.patches] : [];
  for (const conflict of root.conflicts ?? []) {
    if (conflict?.serverState) patches.push(conflict.serverState);
  }
  return patches.filter((patch): patch is RawPatch => Boolean(patch && typeof patch === "object"));
}

/** Reduces sync-data patches to one reading state per publication id. */
export function parseReadingState(patches: RawPatch[]): Map<string, TolinoReadingState> {
  const bookmarks = new Map<string, Bookmark>();
  const finishedTags = new Map<string, FinishedTag>();

  for (const patch of patches) {
    const parsed = parsePatchPath(patch.path);
    if (!parsed || !patch.value) continue;
    const modified = toNumber(patch.value.modified) ?? 0;
    if (parsed.kind === "bookmark") {
      if (patch.op === "remove") continue;
      let progress = toNumber(patch.value.progress);
      if (progress === null) {
        const current = toNumber(patch.value.currentPosition);
        const last = toNumber(patch.value.lastPosition);
        if (current !== null && last) progress = current / last;
      }
      if (progress === null) continue;
      bookmarks.set(
        parsed.publicationId,
        newerBookmark(bookmarks.get(parsed.publicationId), {
          progress: Math.min(1, Math.max(0, progress)),
          modified,
        }),
      );
    } else if (parsed.kind === "tags") {
      const name = patch.value.name?.trim().toLowerCase();
      if (!name || !FINISHED_TAGS.has(name)) continue;
      const current = finishedTags.get(parsed.publicationId);
      if (current && current.modified > modified) continue;
      finishedTags.set(parsed.publicationId, {
        finished: patch.op !== "remove",
        modified,
      });
    }
  }

  const ids = new Set([...bookmarks.keys(), ...finishedTags.keys()]);
  const states = new Map<string, TolinoReadingState>();
  for (const id of ids) {
    const bookmark = bookmarks.get(id);
    const tag = finishedTags.get(id);
    const progress = bookmark ? Math.round(bookmark.progress * 100) : null;
    const progressAt = bookmark?.modified ? new Date(bookmark.modified) : null;
    const taggedFinished = tag?.finished === true;
    const readToEnd = bookmark !== undefined && bookmark.progress >= FINISHED_AT_PROGRESS;
    const finished = taggedFinished || (readToEnd && tag?.finished !== false);
    let finishedAt: Date | null = null;
    if (finished) {
      const candidate = taggedFinished && tag?.modified ? tag.modified : bookmark?.modified;
      finishedAt = candidate ? new Date(candidate) : null;
    }
    states.set(id, { progress, progressAt, finished, finishedAt });
  }
  return states;
}

/** Looks a publication up by either of its ids. */
export function readingStateFor(
  states: Map<string, TolinoReadingState>,
  publication: Pick<TolinoPublication, "publicationId" | "deliverableId">,
): TolinoReadingState | null {
  return (
    states.get(publication.publicationId) ??
    (publication.deliverableId ? states.get(publication.deliverableId) : undefined) ??
    null
  );
}

/* -------------------------------------------------------------------------- */
/*  Pasted tokens                                                              */
/* -------------------------------------------------------------------------- */

/**
 * People paste either the bare refresh token or the whole JSON body of the
 * web reader's token response; both are accepted.
 */
export function extractRefreshToken(raw: string): string {
  const value = raw.trim();
  if (!value.startsWith("{")) return value.replace(/^["']+|["',]+$/g, "").trim();
  try {
    const parsed = JSON.parse(value) as { refresh_token?: unknown };
    return typeof parsed.refresh_token === "string" ? parsed.refresh_token.trim() : "";
  } catch {
    const match = value.match(/"refresh_token"\s*:\s*"([^"]+)"/);
    return match ? match[1].trim() : "";
  }
}

type PastedTokenSet = {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires; the shop default is an hour. */
  expiresIn: number;
  /** Seconds until the refresh token expires, or null when the paste omits it. */
  refreshExpiresIn: number | null;
};

function positiveInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/**
 * Reads the whole JSON body of the web reader's `token` response, i.e. the
 * access token the web reader already obtained together with its refresh
 * token. Returns null unless both tokens are present.
 *
 * Some bookshops only mint tokens for requests coming from their own web
 * reader (they route by `Origin`), so Retrospine cannot exchange a refresh
 * token itself. Reusing the tokens the web reader already holds is the only
 * thing that works there, which is why the whole response is accepted.
 */
export function extractTokenResponse(raw: string): PastedTokenSet | null {
  const value = raw.trim();
  if (!value.startsWith("{")) return null;
  let parsed: {
    access_token?: unknown;
    refresh_token?: unknown;
    expires_in?: unknown;
    refresh_expires_in?: unknown;
  };
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed.access_token !== "string" || typeof parsed.refresh_token !== "string") {
    return null;
  }
  if (!parsed.access_token.trim() || !parsed.refresh_token.trim()) return null;
  return {
    accessToken: parsed.access_token.trim(),
    refreshToken: parsed.refresh_token.trim(),
    expiresIn: positiveInt(parsed.expires_in) ?? 3600,
    refreshExpiresIn: positiveInt(parsed.refresh_expires_in),
  };
}
