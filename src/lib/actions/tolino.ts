"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/errors";
import { findOrCreateBookByGoogleId } from "@/lib/library";
import { getResellerInfo, probeTokenEndpoint } from "@/lib/tolino/client";
import {
  claimSyncRun,
  connectTolino,
  disconnectTolino,
  getTolinoConnection,
  getTolinoTokenState,
  recordTokenFailure,
  relinkTolinoBook,
  setTolinoBookIgnored,
  storeTolinoTokens,
  TolinoError,
  updateTolinoOptions,
  type TolinoTokenState,
} from "@/lib/tolino/connection";
import { findReseller } from "@/lib/tolino/resellers";
import { describeSyncError, runClaimedSync } from "@/lib/tolino/sync";
import {
  TOKEN_EXCHANGE_BLOCKED,
  tokenSetFromInput,
  type TolinoOAuth,
} from "@/lib/tolino/tokens";
import type { ActionResult } from "./state";

function revalidateTolino() {
  revalidatePath("/settings");
  revalidatePath("/settings/tolino");
  revalidatePath("/library");
}

function syncIntervalMs(): number {
  return env.tolinoSyncIntervalMinutes * 60 * 1000;
}

/** Starts a sync in the background; the settings page polls for the result. */
async function startBackgroundSync(userId: string): Promise<ActionResult> {
  const connection = await getTolinoConnection(userId);
  if (!connection) return { ok: false, error: "Tolino Cloud is not connected." };
  const claimed = await claimSyncRun(connection.id);
  if (!claimed) return { ok: false, error: "A sync is already running." };
  after(async () => {
    await runClaimedSync(connection, "manual");
  });
  return { ok: true, message: "Syncing your Tolino library…" };
}

/* -------------------------------------------------------------------------- */
/*  Connecting                                                                 */
/* -------------------------------------------------------------------------- */

export type TolinoConnectPreparation = {
  resellerName: string;
  oauth: TolinoOAuth;
  /**
   * True only when the bookshop demonstrably answers this server. Otherwise
   * (blocked by its bot protection, or no clear answer) the browser has to
   * exchange the token itself.
   */
  serverCanRefresh: boolean;
};

/** Looks up the bookshop's OAuth details and whether this server may use them. */
export async function prepareTolinoConnectAction(
  resellerId: number,
): Promise<ActionResult<TolinoConnectPreparation>> {
  await requireSession();
  if (!Number.isInteger(resellerId) || !findReseller(resellerId)) {
    return { ok: false, error: "Choose your bookshop." };
  }
  try {
    const reseller = await getResellerInfo(resellerId);
    const reachability = await probeTokenEndpoint(reseller);
    return {
      ok: true,
      data: {
        resellerName: reseller.name,
        oauth: { tokenUrl: reseller.tokenUrl, clientId: reseller.clientId, scope: reseller.scope },
        serverCanRefresh: reachability === "reachable",
      },
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

const tokenSetSchema = z.object({
  accessToken: z.string().min(1).max(8000),
  refreshToken: z.string().min(1).max(8000),
  expiresIn: z.number().int().positive().max(366 * 24 * 3600),
  refreshExpiresIn: z.number().int().positive().max(366 * 24 * 3600).nullable(),
});

const connectSchema = z
  .object({
    resellerId: z.number().int().positive(),
    refreshToken: z.string().max(8000).optional(),
    tokens: tokenSetSchema.optional(),
    hardwareId: z.string().max(200).optional(),
  })
  .refine((input) => Boolean(input.tokens) || Boolean(input.refreshToken?.trim()), {
    message: "Paste the refresh token from the web reader",
  });

export type ConnectTolinoResult = { resellerName: string; refreshMode: "server" | "browser" };

/**
 * Stores a connection. Either the server exchanges the pasted refresh token,
 * or the browser already did (when the bookshop blocks the server) and hands
 * over the resulting tokens. A server exchange the bookshop blocks fails
 * with `code: TOKEN_EXCHANGE_BLOCKED` so the form can retry from the browser.
 */
export async function connectTolinoAction(
  input: unknown,
): Promise<ActionResult<ConnectTolinoResult>> {
  const session = await requireSession();
  const parsed = connectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  if (!findReseller(parsed.data.resellerId)) return { ok: false, error: "Choose your bookshop." };

  try {
    const connection = await connectTolino(session.user.id, {
      resellerId: parsed.data.resellerId,
      refreshToken: parsed.data.refreshToken ?? null,
      tokens: parsed.data.tokens ?? null,
      hardwareId: parsed.data.hardwareId?.trim() || null,
    });
    revalidateTolino();
    const sync = await startBackgroundSync(session.user.id);
    return {
      ok: true,
      message: sync.ok
        ? `Connected to ${connection.resellerName}. Your library is being imported.`
        : `Connected to ${connection.resellerName}.`,
      data: { resellerName: connection.resellerName, refreshMode: connection.refreshMode },
    };
  } catch (error) {
    if (error instanceof TolinoError) {
      return {
        ok: false,
        error: error.message,
        code: error.kind === "blocked" && !parsed.data.tokens ? TOKEN_EXCHANGE_BLOCKED : undefined,
      };
    }
    return { ok: false, error: errorMessage(error) };
  }
}

/* -------------------------------------------------------------------------- */
/*  Token renewal from the browser                                             */
/* -------------------------------------------------------------------------- */

/** Token state for the keeper component; the refresh token only in browser mode. */
export async function getTolinoTokenStateAction(): Promise<TolinoTokenState | null> {
  const session = await requireSession();
  try {
    return await getTolinoTokenState(session.user.id, syncIntervalMs());
  } catch (error) {
    console.warn("[tolino] token state unavailable", error);
    return null;
  }
}

/** Stores tokens the browser renewed and starts a sync when one is due. */
export async function storeTolinoTokensAction(
  input: unknown,
): Promise<ActionResult<{ syncStarted: boolean }>> {
  const session = await requireSession();
  const parsed = tokenSetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid tokens." };
  const connection = await getTolinoConnection(session.user.id);
  if (!connection) return { ok: false, error: "Tolino Cloud is not connected." };
  try {
    await storeTolinoTokens(connection.id, tokenSetFromInput(parsed.data));
    const state = await getTolinoTokenState(session.user.id, syncIntervalMs());
    let syncStarted = false;
    if (state?.syncDue) {
      syncStarted = (await startBackgroundSync(session.user.id)).ok;
      if (syncStarted) revalidateTolino();
    }
    return { ok: true, data: { syncStarted } };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/** Records that the browser could not renew the tokens (usually: they expired). */
export async function reportTolinoTokenFailureAction(message: string): Promise<ActionResult> {
  const session = await requireSession();
  const connection = await getTolinoConnection(session.user.id);
  if (!connection) return { ok: false, error: "Tolino Cloud is not connected." };
  const text = message.trim().slice(0, 500) || "The bookshop rejected the refresh token.";
  await recordTokenFailure(connection.id, `Tolino Cloud sign-in failed: ${text}`);
  revalidateTolino();
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Connection management                                                      */
/* -------------------------------------------------------------------------- */

export async function disconnectTolinoAction(): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await disconnectTolino(session.user.id);
    revalidateTolino();
    return { ok: true, message: "Tolino Cloud disconnected. Your shelves are unchanged." };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function syncTolinoNowAction(): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const result = await startBackgroundSync(session.user.id);
    revalidateTolino();
    return result;
  } catch (error) {
    return { ok: false, error: describeSyncError(error) };
  }
}

const optionsSchema = z
  .object({
    autoSync: z.boolean().optional(),
    importUnread: z.boolean().optional(),
    includeAudiobooks: z.boolean().optional(),
  })
  .strict();

export async function updateTolinoOptionsAction(options: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = optionsSchema.safeParse(options);
  if (!parsed.success) return { ok: false, error: "Invalid options." };
  try {
    const updated = await updateTolinoOptions(session.user.id, parsed.data);
    if (!updated) return { ok: false, error: "Tolino Cloud is not connected." };
    revalidateTolino();
    return { ok: true, message: "Sync options saved" };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function ignoreTolinoBookAction(
  tolinoBookId: string,
  ignored: boolean,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await setTolinoBookIgnored(session.user.id, tolinoBookId, ignored);
    revalidateTolino();
    return {
      ok: true,
      message: ignored ? "This book is no longer synced" : "This book will be synced again",
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

/** Links a Tolino publication to a Google Books volume chosen by the user. */
export async function relinkTolinoBookAction(
  tolinoBookId: string,
  googleId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!googleId.trim()) return { ok: false, error: "Choose a book." };
  try {
    const book = await findOrCreateBookByGoogleId(googleId.trim());
    await relinkTolinoBook(session.user.id, tolinoBookId, book.id);
    revalidateTolino();
    const sync = await startBackgroundSync(session.user.id);
    return {
      ok: true,
      message: sync.ok
        ? `Linked to “${book.title}”. Its reading progress is being recorded.`
        : `Linked to “${book.title}”.`,
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
