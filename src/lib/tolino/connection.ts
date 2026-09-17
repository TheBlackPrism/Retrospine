import { and, eq, gt, lt, ne, or, sql } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import type {
  TolinoBook,
  TolinoConnection,
  TolinoRefreshMode,
  TolinoSyncStatus,
  TolinoSyncSummary,
} from "@/lib/db/schema";
import type { BookWithSeries } from "@/lib/library";
import {
  fetchReadingState,
  generateHardwareId,
  getResellerInfo,
  listDevices,
  pickWebReaderDevice,
  probeTokenEndpoint,
  refreshTokens,
  registerDevice,
  TolinoError,
  type TolinoSession,
} from "./client";
import {
  tokenSetFromInput,
  type TokenSet,
  type TokenSetInput,
  type TolinoOAuth,
} from "./tokens";

/** A sync that has not reported back after this long is considered dead. */
const STALE_RUN_MS = 20 * 60 * 1000;
/** Refresh the access token when it expires within this window. */
const TOKEN_MARGIN_MS = 2 * 60 * 1000;

/** What pages and client components may know about a connection: never the tokens. */
export type TolinoConnectionView = {
  id: string;
  resellerId: number;
  resellerName: string;
  hardwareId: string;
  autoSync: boolean;
  importUnread: boolean;
  includeAudiobooks: boolean;
  syncStatus: TolinoSyncStatus;
  syncStartedAt: string | null;
  lastSyncAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastSummary: TolinoSyncSummary | null;
  refreshMode: TolinoRefreshMode;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  tokenRefreshedAt: string | null;
  createdAt: string;
};

export function toConnectionView(row: TolinoConnection): TolinoConnectionView {
  return {
    id: row.id,
    resellerId: row.resellerId,
    resellerName: row.resellerName,
    hardwareId: row.hardwareId,
    autoSync: row.autoSync,
    importUnread: row.importUnread,
    includeAudiobooks: row.includeAudiobooks,
    syncStatus: row.syncStatus,
    syncStartedAt: row.syncStartedAt?.toISOString() ?? null,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    lastError: row.lastError,
    lastSummary: row.lastSummary ?? null,
    refreshMode: row.refreshMode,
    accessTokenExpiresAt: row.accessTokenExpiresAt?.toISOString() ?? null,
    refreshTokenExpiresAt: row.refreshTokenExpiresAt?.toISOString() ?? null,
    tokenRefreshedAt: row.tokenRefreshedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getTolinoConnection(userId: string): Promise<TolinoConnection | null> {
  const row = await db.query.tolinoConnections.findFirst({
    where: eq(schema.tolinoConnections.userId, userId),
  });
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Connecting                                                                 */
/* -------------------------------------------------------------------------- */

export type ConnectTolinoInput = {
  resellerId: number;
  /** Refresh token copied from the web reader; exchanged by the server. */
  refreshToken?: string | null;
  /** Tokens the browser already exchanged, when the bookshop blocks the server. */
  tokens?: TokenSetInput | null;
  /** `hardware_id` header of the web reader; detected from the device list when empty. */
  hardwareId?: string | null;
};

/**
 * Verifies the credentials against the Tolino Cloud and stores them.
 * Replaces an existing connection of the user.
 */
export async function connectTolino(
  userId: string,
  input: ConnectTolinoInput,
): Promise<TolinoConnection> {
  const reseller = await getResellerInfo(input.resellerId);
  let tokens: TokenSet;
  let refreshMode: TolinoRefreshMode = "server";
  if (input.tokens) {
    tokens = tokenSetFromInput(input.tokens);
    // The browser did the exchange; the server only takes renewal over when
    // the bookshop demonstrably answers it.
    refreshMode = (await probeTokenEndpoint(reseller)) === "reachable" ? "server" : "browser";
  } else if (input.refreshToken?.trim()) {
    tokens = await refreshTokens(reseller, input.refreshToken.trim());
  } else {
    throw new TolinoError("Paste the refresh token from the web reader.", "auth");
  }

  let hardwareId = input.hardwareId?.trim() || null;
  const base = {
    resellerId: reseller.resellerId,
    accessToken: tokens.accessToken,
    apiBase: reseller.apiBase,
    boshBase: reseller.boshBase,
  };
  if (!hardwareId) {
    let devices: Awaited<ReturnType<typeof listDevices>> = [];
    try {
      devices = await listDevices(base);
    } catch (error) {
      console.warn("[tolino] device list unavailable", error);
    }
    hardwareId = pickWebReaderDevice(devices)?.id ?? null;
    if (!hardwareId) {
      const generated = generateHardwareId();
      await step(reseller.name, "registering Retrospine as a device", () =>
        registerDevice({ ...base, hardwareId: generated }),
      );
      hardwareId = generated;
    }
  }

  const session: TolinoSession = { ...base, hardwareId };
  // One authenticated request proves that token and device id work together.
  await step(reseller.name, "reading the library", () => fetchReadingState(session));

  const values = {
    userId,
    resellerId: reseller.resellerId,
    resellerName: reseller.name,
    hardwareId,
    tokenUrl: reseller.tokenUrl,
    clientId: reseller.clientId,
    scope: reseller.scope,
    accessToken: encryptSecret(tokens.accessToken),
    accessTokenExpiresAt: tokens.expiresAt,
    refreshToken: encryptSecret(tokens.refreshToken),
    refreshTokenExpiresAt: tokens.refreshExpiresAt,
    refreshMode,
    tokenRefreshedAt: new Date(),
    syncStatus: "idle" as const,
    syncStartedAt: null,
    lastError: null,
  };
  const [row] = await db
    .insert(schema.tolinoConnections)
    .values(values)
    .onConflictDoUpdate({ target: schema.tolinoConnections.userId, set: values })
    .returning();
  return row;
}

/**
 * Runs one step of the connection check and, when it fails, says which one:
 * the sign-in itself worked at that point, which is what the reader needs to
 * know to tell a bad token from a Tolino Cloud problem.
 */
async function step<T>(shop: string, what: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof TolinoError) {
      throw new TolinoError(
        `Signed in to ${shop}, but ${what} failed: ${error.message}`,
        error.kind,
        error.status,
      );
    }
    throw error;
  }
}

/** Removes the connection and the publication mappings; shelves and milestones stay. */
export async function disconnectTolino(userId: string): Promise<void> {
  await db.delete(schema.tolinoBooks).where(eq(schema.tolinoBooks.userId, userId));
  await db.delete(schema.tolinoConnections).where(eq(schema.tolinoConnections.userId, userId));
}

export type TolinoOptions = {
  autoSync: boolean;
  importUnread: boolean;
  includeAudiobooks: boolean;
};

export async function updateTolinoOptions(
  userId: string,
  options: Partial<TolinoOptions>,
): Promise<TolinoConnection | null> {
  const [row] = await db
    .update(schema.tolinoConnections)
    .set(options)
    .where(eq(schema.tolinoConnections.userId, userId))
    .returning();
  return row ?? null;
}

/* -------------------------------------------------------------------------- */
/*  Sessions                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Returns a session with a valid access token, refreshing (and rotating the
 * stored refresh token) when the current one is about to expire.
 */
export async function getTolinoSession(connection: TolinoConnection): Promise<TolinoSession> {
  const base = {
    resellerId: connection.resellerId,
    hardwareId: connection.hardwareId,
  };
  const reseller = await getResellerInfo(connection.resellerId).catch(() => null);
  const hosts = reseller ? { apiBase: reseller.apiBase, boshBase: reseller.boshBase } : {};

  const fresh =
    connection.accessToken &&
    connection.accessTokenExpiresAt &&
    connection.accessTokenExpiresAt.getTime() - TOKEN_MARGIN_MS > Date.now();
  if (fresh && connection.accessToken) {
    return { ...base, ...hosts, accessToken: decryptSecret(connection.accessToken) };
  }

  if (connection.refreshMode === "browser") {
    throw new TolinoError(
      "The access token has expired and this server cannot renew it because the bookshop blocks it. Open Retrospine in your browser to renew the connection.",
      "blocked",
    );
  }

  let tokens: TokenSet;
  try {
    tokens = await refreshTokens(oauthFor(connection, reseller), decryptSecret(connection.refreshToken));
  } catch (error) {
    if (error instanceof TolinoError && error.kind === "blocked") {
      // From now on the reader's browser renews the tokens.
      await setRefreshMode(connection.id, "browser");
    }
    throw error;
  }
  await storeTolinoTokens(connection.id, tokens);
  return { ...base, ...hosts, accessToken: tokens.accessToken };
}

/** OAuth endpoint and client for a connection; the live reseller info wins when available. */
export function oauthFor(
  connection: Pick<TolinoConnection, "tokenUrl" | "clientId" | "scope">,
  reseller: TolinoOAuth | null,
): TolinoOAuth {
  return {
    tokenUrl: reseller?.tokenUrl ?? connection.tokenUrl,
    clientId: reseller?.clientId ?? connection.clientId,
    scope: reseller?.scope ?? connection.scope,
  };
}

export async function storeTolinoTokens(connectionId: string, tokens: TokenSet): Promise<void> {
  await db
    .update(schema.tolinoConnections)
    .set({
      accessToken: encryptSecret(tokens.accessToken),
      accessTokenExpiresAt: tokens.expiresAt,
      refreshToken: encryptSecret(tokens.refreshToken),
      refreshTokenExpiresAt: tokens.refreshExpiresAt,
      tokenRefreshedAt: new Date(),
    })
    .where(eq(schema.tolinoConnections.id, connectionId));
}

export async function setRefreshMode(connectionId: string, mode: TolinoRefreshMode): Promise<void> {
  await db
    .update(schema.tolinoConnections)
    .set({ refreshMode: mode })
    .where(eq(schema.tolinoConnections.id, connectionId));
}

/** Remembers why the tokens could not be renewed, so the settings page can explain it. */
export async function recordTokenFailure(connectionId: string, message: string): Promise<void> {
  await db
    .update(schema.tolinoConnections)
    .set({ syncStatus: "error", syncStartedAt: null, lastError: message })
    .where(eq(schema.tolinoConnections.id, connectionId));
}

/** What the browser needs to renew tokens on the server's behalf. */
export type TolinoTokenState = {
  refreshMode: TolinoRefreshMode;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  tokenRefreshedAt: string | null;
  syncStatus: TolinoSyncStatus;
  /** Whether a scheduled sync is overdue. */
  syncDue: boolean;
  oauth: TolinoOAuth;
  /** Only handed out in browser mode, to the owner of the connection. */
  refreshToken: string | null;
};

export async function getTolinoTokenState(
  userId: string,
  syncIntervalMs: number,
): Promise<TolinoTokenState | null> {
  const connection = await getTolinoConnection(userId);
  if (!connection) return null;
  const reseller = await getResellerInfo(connection.resellerId).catch(() => null);
  const lastSync = connection.lastSyncAt?.getTime() ?? 0;
  const syncDue =
    connection.autoSync &&
    syncIntervalMs > 0 &&
    connection.syncStatus !== "running" &&
    Date.now() - lastSync >= syncIntervalMs;
  return {
    refreshMode: connection.refreshMode,
    accessTokenExpiresAt: connection.accessTokenExpiresAt?.toISOString() ?? null,
    refreshTokenExpiresAt: connection.refreshTokenExpiresAt?.toISOString() ?? null,
    tokenRefreshedAt: connection.tokenRefreshedAt?.toISOString() ?? null,
    syncStatus: connection.syncStatus,
    syncDue,
    oauth: oauthFor(connection, reseller),
    refreshToken:
      connection.refreshMode === "browser" ? decryptSecret(connection.refreshToken) : null,
  };
}

/* -------------------------------------------------------------------------- */
/*  Sync bookkeeping                                                           */
/* -------------------------------------------------------------------------- */

/** Claims the connection for a sync run; false when another run is active. */
export async function claimSyncRun(connectionId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_RUN_MS);
  const rows = await db
    .update(schema.tolinoConnections)
    .set({ syncStatus: "running", syncStartedAt: new Date() })
    .where(
      and(
        eq(schema.tolinoConnections.id, connectionId),
        or(
          ne(schema.tolinoConnections.syncStatus, "running"),
          lt(schema.tolinoConnections.syncStartedAt, staleBefore),
          sql`${schema.tolinoConnections.syncStartedAt} is null`,
        ),
      ),
    )
    .returning({ id: schema.tolinoConnections.id });
  return rows.length > 0;
}

export async function finishSyncRun(
  connectionId: string,
  result: { ok: true; summary: TolinoSyncSummary } | { ok: false; error: string },
): Promise<void> {
  const now = new Date();
  await db
    .update(schema.tolinoConnections)
    .set(
      result.ok
        ? {
            syncStatus: "ok",
            syncStartedAt: null,
            lastSyncAt: now,
            lastSuccessAt: now,
            lastError: null,
            lastSummary: result.summary,
          }
        : {
            syncStatus: "error",
            syncStartedAt: null,
            lastSyncAt: now,
            lastError: result.error,
          },
    )
    .where(eq(schema.tolinoConnections.id, connectionId));
}

/**
 * Connections whose scheduled sync is due. A connection whose tokens are
 * renewed by the browser only qualifies while its access token is valid.
 */
export async function listConnectionsDueForSync(intervalMs: number): Promise<TolinoConnection[]> {
  const before = new Date(Date.now() - intervalMs);
  const staleBefore = new Date(Date.now() - STALE_RUN_MS);
  const tokenValidUntil = new Date(Date.now() + TOKEN_MARGIN_MS);
  return db.query.tolinoConnections.findMany({
    where: and(
      eq(schema.tolinoConnections.autoSync, true),
      or(
        sql`${schema.tolinoConnections.lastSyncAt} is null`,
        lt(schema.tolinoConnections.lastSyncAt, before),
      ),
      or(
        ne(schema.tolinoConnections.syncStatus, "running"),
        lt(schema.tolinoConnections.syncStartedAt, staleBefore),
      ),
      or(
        eq(schema.tolinoConnections.refreshMode, "server"),
        gt(schema.tolinoConnections.accessTokenExpiresAt, tokenValidUntil),
      ),
    ),
  });
}

/* -------------------------------------------------------------------------- */
/*  Publications                                                               */
/* -------------------------------------------------------------------------- */

export type TolinoBookWithBook = TolinoBook & { book: BookWithSeries | null };

export async function listTolinoBooks(userId: string): Promise<TolinoBookWithBook[]> {
  const rows = await db.query.tolinoBooks.findMany({
    where: eq(schema.tolinoBooks.userId, userId),
    with: { book: { with: { series: true } } },
  });
  return rows.sort((a, b) => {
    const left = (a.finishedAt ?? a.progressAt ?? a.purchasedAt ?? a.createdAt).getTime();
    const right = (b.finishedAt ?? b.progressAt ?? b.purchasedAt ?? b.createdAt).getTime();
    return right - left;
  });
}

async function requireTolinoBook(userId: string, tolinoBookId: string): Promise<TolinoBook> {
  const row = await db.query.tolinoBooks.findFirst({
    where: and(eq(schema.tolinoBooks.id, tolinoBookId), eq(schema.tolinoBooks.userId, userId)),
  });
  if (!row) throw new Error("This Tolino book was not found.");
  return row;
}

export async function setTolinoBookIgnored(
  userId: string,
  tolinoBookId: string,
  ignored: boolean,
): Promise<void> {
  await requireTolinoBook(userId, tolinoBookId);
  await db
    .update(schema.tolinoBooks)
    .set({ ignored })
    .where(eq(schema.tolinoBooks.id, tolinoBookId));
}

/**
 * Points a Tolino publication at a different book. The synced reading state
 * is reset so the next sync records it on the new book.
 */
export async function relinkTolinoBook(
  userId: string,
  tolinoBookId: string,
  bookId: string,
): Promise<void> {
  await requireTolinoBook(userId, tolinoBookId);
  await db
    .update(schema.tolinoBooks)
    .set({
      bookId,
      matchSource: "manual",
      ignored: false,
      progress: null,
      progressAt: null,
      finished: false,
      finishedAt: null,
    })
    .where(eq(schema.tolinoBooks.id, tolinoBookId));
}

export { TolinoError };
