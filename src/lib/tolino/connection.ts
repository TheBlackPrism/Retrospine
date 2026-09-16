import { and, eq, lt, ne, or, sql } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import type {
  TolinoBook,
  TolinoConnection,
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
  refreshTokens,
  registerDevice,
  TolinoError,
  type TolinoSession,
} from "./client";

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
  refreshTokenExpiresAt: string | null;
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
    refreshTokenExpiresAt: row.refreshTokenExpiresAt?.toISOString() ?? null,
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
  /** Refresh token copied from the web reader's token response. */
  refreshToken: string;
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
  const tokens = await refreshTokens(reseller, input.refreshToken.trim());

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
      hardwareId = generateHardwareId();
      await registerDevice({ ...base, hardwareId });
    }
  }

  const session: TolinoSession = { ...base, hardwareId };
  // One authenticated request proves that token and device id work together.
  await fetchReadingState(session);

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

  const tokens = await refreshTokens(
    {
      tokenUrl: reseller?.tokenUrl ?? connection.tokenUrl,
      clientId: reseller?.clientId ?? connection.clientId,
      scope: reseller?.scope ?? connection.scope,
    },
    decryptSecret(connection.refreshToken),
  );
  await db
    .update(schema.tolinoConnections)
    .set({
      accessToken: encryptSecret(tokens.accessToken),
      accessTokenExpiresAt: tokens.expiresAt,
      refreshToken: encryptSecret(tokens.refreshToken),
      refreshTokenExpiresAt: tokens.refreshExpiresAt,
    })
    .where(eq(schema.tolinoConnections.id, connection.id));
  return { ...base, ...hosts, accessToken: tokens.accessToken };
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

/** Connections whose scheduled sync is due. */
export async function listConnectionsDueForSync(intervalMs: number): Promise<TolinoConnection[]> {
  const before = new Date(Date.now() - intervalMs);
  const staleBefore = new Date(Date.now() - STALE_RUN_MS);
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
