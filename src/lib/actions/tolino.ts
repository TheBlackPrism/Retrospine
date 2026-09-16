"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { errorMessage } from "@/lib/errors";
import { findOrCreateBookByGoogleId } from "@/lib/library";
import {
  claimSyncRun,
  connectTolino,
  disconnectTolino,
  getTolinoConnection,
  relinkTolinoBook,
  setTolinoBookIgnored,
  TolinoError,
  updateTolinoOptions,
} from "@/lib/tolino/connection";
import { extractRefreshToken } from "@/lib/tolino/parse";
import { findReseller } from "@/lib/tolino/resellers";
import { describeSyncError, runClaimedSync } from "@/lib/tolino/sync";
import type { ActionResult, FormState } from "./state";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function revalidateTolino() {
  revalidatePath("/settings");
  revalidatePath("/settings/tolino");
  revalidatePath("/library");
}

const connectSchema = z.object({
  resellerId: z.coerce.number().int().positive("Choose your bookshop"),
  refreshToken: z.string().min(8, "Paste the refresh token from the web reader").max(4000),
  hardwareId: z.string().max(200),
});

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

export async function connectTolinoAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireSession();
  const parsed = connectSchema.safeParse({
    resellerId: field(formData, "resellerId"),
    refreshToken: extractRefreshToken(field(formData, "refreshToken")),
    hardwareId: field(formData, "hardwareId"),
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  const reseller = findReseller(parsed.data.resellerId);
  if (!reseller) return { status: "error", message: "Choose your bookshop." };

  try {
    const connection = await connectTolino(session.user.id, {
      resellerId: parsed.data.resellerId,
      refreshToken: parsed.data.refreshToken,
      hardwareId: parsed.data.hardwareId || null,
    });
    revalidateTolino();
    const sync = await startBackgroundSync(session.user.id);
    return {
      status: "success",
      message: sync.ok
        ? `Connected to ${connection.resellerName}. Your library is being imported.`
        : `Connected to ${connection.resellerName}.`,
    };
  } catch (error) {
    if (error instanceof TolinoError) return { status: "error", message: error.message };
    return { status: "error", message: errorMessage(error) };
  }
}

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
