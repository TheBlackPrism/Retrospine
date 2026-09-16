import { Layers } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookCover } from "@/components/book-cover";
import { BackButton } from "@/components/book/back-button";
import { Description } from "@/components/book/description";
import { MilestoneDrawer } from "@/components/book/milestone-drawer";
import { ProgressBar } from "@/components/book/progress-bar";
import { SeriesEditor } from "@/components/book/series-editor";
import { SeriesStrip, SeriesStripSkeleton } from "@/components/book/series-strip";
import { ShelfControls } from "@/components/book/shelf-controls";
import { Timeline, type TimelineEvent } from "@/components/book/timeline";
import { requireSession } from "@/lib/auth/session";
import type { ReadingEventType } from "@/lib/db/schema";
import { formatPosition, formatYear, pluralize, stripHtml } from "@/lib/format";
import { getBook, getEntryForBook } from "@/lib/library";
import { deriveProgress, deriveSessions } from "@/lib/reading";

export async function generateMetadata(
  props: PageProps<"/books/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const book = await getBook(id);
  return { title: book?.title ?? "Book" };
}

function suggestNextMilestone(
  status: string,
  events: { type: ReadingEventType }[],
): ReadingEventType {
  if (status === "reading") return events.length ? "progress" : "started";
  if (status === "finished" || status === "abandoned") return "note";
  return "started";
}

export default async function BookPage(props: PageProps<"/books/[id]">) {
  const { id } = await props.params;
  const session = await requireSession();
  const book = await getBook(id);
  if (!book) notFound();

  const entry = await getEntryForBook(session.user.id, book.id);
  const progress = entry ? deriveProgress(entry.events, book.pageCount) : null;
  const sessions = entry ? deriveSessions(entry.events) : [];
  const lastFinished = [...sessions].reverse().find((s) => s.outcome === "finished");
  const year = formatYear(book.publishedDate);
  const position = formatPosition(book.seriesPosition);
  const description = book.description ? stripHtml(book.description) : null;
  const meta = [
    year,
    book.pageCount ? pluralize(book.pageCount, "page") : null,
    book.publisher,
  ].filter(Boolean);

  const timelineEvents: TimelineEvent[] = (entry?.events ?? []).map((event) => ({
    id: event.id,
    type: event.type,
    occurredAt: event.occurredAt.toISOString(),
    page: event.page,
    percent: event.percent,
    note: event.note,
  }));

  return (
    <article className="space-y-8">
      <BackButton />

      <header className="relative">
        {book.coverUrl ? (
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-6 -top-24 -bottom-8 -z-10 overflow-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={book.coverUrl}
              alt=""
              className="h-full w-full scale-125 object-cover opacity-25 blur-3xl saturate-150 dark:opacity-30"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/20 via-background/70 to-background" />
          </div>
        ) : null}

        <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
          <div className="mx-auto w-40 shrink-0 sm:mx-0 sm:w-44">
            <BookCover
              src={book.coverUrl ?? book.thumbnailUrl}
              title={book.title}
              author={book.authors[0]}
              priority
            />
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            {book.series ? (
              <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-amber-soft px-2.5 py-1 text-xs font-medium text-amber-foreground">
                <Layers className="size-3.5" />
                {position ? `Book ${position} of ${book.series.name}` : `Part of ${book.series.name}`}
              </p>
            ) : null}
            <h1 className="font-heading text-3xl leading-tight font-semibold text-balance sm:text-4xl">
              {book.title}
            </h1>
            {book.subtitle ? (
              <p className="mt-1 font-heading text-lg text-muted-foreground">{book.subtitle}</p>
            ) : null}
            {book.authors.length ? (
              <p className="mt-2 text-base">{book.authors.join(", ")}</p>
            ) : null}
            {meta.length ? (
              <p className="mt-1 text-sm text-muted-foreground">{meta.join(" · ")}</p>
            ) : null}
            {lastFinished?.days ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Read in {pluralize(lastFinished.days, "day")}
              </p>
            ) : null}
            <div className="mt-5 flex justify-center sm:justify-start">
              <ShelfControls
                bookId={book.id}
                entry={entry ? { id: entry.id, status: entry.status } : null}
              />
            </div>
          </div>
        </div>
      </header>

      {entry && entry.status === "reading" && progress?.percent !== null && progress ? (
        <ProgressBar
          percent={progress.percent}
          label={
            progress.page !== null && book.pageCount
              ? `Page ${progress.page} of ${book.pageCount}`
              : "Progress"
          }
        />
      ) : null}

      {entry ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold">Milestones</h2>
            <MilestoneDrawer
              entryId={entry.id}
              bookId={book.id}
              pageCount={book.pageCount}
              suggestedType={suggestNextMilestone(entry.status, entry.events)}
            />
          </div>
          <Timeline events={timelineEvents} bookId={book.id} pageCount={book.pageCount} />
        </section>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-xl font-semibold">
            {book.series ? `More from ${book.series.name}` : "Series"}
          </h2>
          <SeriesEditor
            bookId={book.id}
            seriesName={book.series?.name ?? null}
            position={book.seriesPosition}
          />
        </div>
        {book.series ? (
          <Suspense fallback={<SeriesStripSkeleton />}>
            <SeriesStrip series={book.series} book={book} userId={session.user.id} />
          </Suspense>
        ) : (
          <p className="text-sm text-muted-foreground">
            This book is not part of a series that we know of.
          </p>
        )}
      </section>

      {description ? (
        <section className="space-y-3">
          <h2 className="font-heading text-xl font-semibold">About</h2>
          <Description text={description} />
        </section>
      ) : null}

      {book.categories.length ? (
        <ul className="flex flex-wrap gap-2 pb-4">
          {book.categories.slice(0, 8).map((category) => (
            <li
              key={category}
              className="rounded-full border border-border/70 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground"
            >
              {category}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
