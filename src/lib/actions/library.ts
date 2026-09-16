"use server";

import { revalidatePath } from "next/cache";
import { setBookSeries } from "@/lib/books/series";
import { requireSession } from "@/lib/auth/session";
import type { ReadingStatus } from "@/lib/db/schema";
import { errorMessage } from "@/lib/errors";
import { parseDateInput } from "@/lib/format";
import {
  addBookToLibrary,
  addReadingEvent,
  deleteReadingEvent,
  findOrCreateBookByGoogleId,
  removeFromLibrary,
  setEntryStatus,
} from "@/lib/library";
import { isEventType, isReadingStatus, STATUS_LABELS } from "@/lib/shelves";
import type { ActionResult } from "./state";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: string): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Milestones are entered as dates. A milestone for today is stamped with the
 * current time so it sorts after events recorded earlier the same day.
 */
function resolveOccurredAt(dateValue: string): Date {
  const parsed = parseDateInput(dateValue);
  if (!parsed) return new Date();
  const now = new Date();
  const isToday =
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate();
  return isToday ? now : parsed;
}

function revalidateBook(bookId: string) {
  revalidatePath("/library");
  revalidatePath(`/books/${bookId}`);
}

/** Adds a Google Books result to a shelf, storing the book on first use. */
export async function addGoogleBookAction(
  googleId: string,
  status: ReadingStatus,
): Promise<ActionResult<{ bookId: string }>> {
  const session = await requireSession();
  if (!isReadingStatus(status)) return { ok: false, error: "Unknown shelf." };
  try {
    const book = await findOrCreateBookByGoogleId(googleId);
    await addBookToLibrary(session.user.id, book.id, status);
    revalidateBook(book.id);
    return {
      ok: true,
      message: `Added to ${STATUS_LABELS[status]}`,
      data: { bookId: book.id },
    };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function addToShelfAction(
  bookId: string,
  status: ReadingStatus,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!isReadingStatus(status)) return { ok: false, error: "Unknown shelf." };
  try {
    await addBookToLibrary(session.user.id, bookId, status);
    revalidateBook(bookId);
    return { ok: true, message: `Added to ${STATUS_LABELS[status]}` };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function setStatusAction(
  entryId: string,
  bookId: string,
  status: ReadingStatus,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!isReadingStatus(status)) return { ok: false, error: "Unknown shelf." };
  try {
    await setEntryStatus(session.user.id, entryId, status);
    revalidateBook(bookId);
    return { ok: true, message: `Moved to ${STATUS_LABELS[status]}` };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function removeEntryAction(
  entryId: string,
  bookId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await removeFromLibrary(session.user.id, entryId);
    revalidateBook(bookId);
    return { ok: true, message: "Removed from your shelves" };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function addMilestoneAction(
  entryId: string,
  bookId: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireSession();
  const type = field(formData, "type");
  if (!isEventType(type)) return { ok: false, error: "Choose a milestone type." };

  const occurredAt = resolveOccurredAt(field(formData, "date"));
  const page = type === "progress" ? numberOrNull(field(formData, "page")) : null;
  const percent =
    type === "progress" ? numberOrNull(field(formData, "percent")) : null;
  const note = field(formData, "note");

  if (type === "progress" && page === null && percent === null) {
    return { ok: false, error: "Enter a page number or a percentage." };
  }
  if (page !== null && (page < 0 || !Number.isInteger(page))) {
    return { ok: false, error: "The page must be a whole number." };
  }
  if (percent !== null && (percent < 0 || percent > 100)) {
    return { ok: false, error: "The percentage must be between 0 and 100." };
  }
  if (type === "note" && !note) {
    return { ok: false, error: "Write a short note." };
  }
  if (note.length > 2000) {
    return { ok: false, error: "Notes are limited to 2000 characters." };
  }

  try {
    await addReadingEvent(session.user.id, entryId, {
      type,
      occurredAt,
      page,
      percent: percent === null ? null : Math.round(percent),
      note: note || null,
    });
    revalidateBook(bookId);
    return { ok: true, message: "Milestone added" };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function deleteMilestoneAction(
  eventId: string,
  bookId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await deleteReadingEvent(session.user.id, eventId);
    revalidateBook(bookId);
    return { ok: true, message: "Milestone removed" };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function setSeriesAction(
  bookId: string,
  formData: FormData,
): Promise<ActionResult> {
  await requireSession();
  const name = field(formData, "name");
  const position = numberOrNull(field(formData, "position"));
  if (name.length > 200) {
    return { ok: false, error: "The series name is too long." };
  }
  if (position !== null && (position < 0 || position > 9999)) {
    return { ok: false, error: "The volume number looks wrong." };
  }
  try {
    await setBookSeries(bookId, { name, position });
    revalidateBook(bookId);
    return { ok: true, message: name ? "Series updated" : "Series removed" };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
