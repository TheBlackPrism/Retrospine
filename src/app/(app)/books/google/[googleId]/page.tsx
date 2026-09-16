import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { findOrCreateBookByGoogleId } from "@/lib/library";

/** Stores a Google Books volume locally on first visit, then shows it. */
export default async function GoogleBookPage(
  props: PageProps<"/books/google/[googleId]">,
) {
  await requireSession();
  const { googleId } = await props.params;
  let bookId: string;
  try {
    const book = await findOrCreateBookByGoogleId(googleId);
    bookId = book.id;
  } catch (error) {
    console.warn("[books] could not import Google volume", googleId, error);
    notFound();
  }
  redirect(`/books/${bookId}`);
}
