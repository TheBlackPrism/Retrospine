import { BookOpen, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ShelfGrid, type ShelfGridItem } from "@/components/library/shelf-grid";
import { ShelfTabs } from "@/components/library/shelf-tabs";
import { Button } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/session";
import type { ReadingStatus } from "@/lib/db/schema";
import { formatPosition } from "@/lib/format";
import { getShelfCounts, listShelf } from "@/lib/library";
import { deriveProgress } from "@/lib/reading";
import { isReadingStatus, STATUS_LABELS } from "@/lib/shelves";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export const metadata: Metadata = { title: "Library" };

const EMPTY_COPY: Record<ReadingStatus, { title: string; description: string }> = {
  reading: {
    title: "Nothing on the nightstand",
    description: "Start a book and it will show up here with your progress.",
  },
  want_to_read: {
    title: "Your wishlist is empty",
    description: "Search for a title and save it for later.",
  },
  finished: {
    title: "No finished books yet",
    description: "Mark a book as finished to build your reading history.",
  },
  abandoned: {
    title: "Nothing set aside",
    description: "Books you stop reading land here, no judgement.",
  },
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return "Reading late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function LibraryPage(props: PageProps<"/library">) {
  const session = await requireSession();
  const params = await props.searchParams;
  const requested = typeof params.shelf === "string" ? params.shelf : "reading";
  const shelf: ReadingStatus = isReadingStatus(requested) ? requested : "reading";

  const [entries, counts] = await Promise.all([
    listShelf(session.user.id, shelf),
    getShelfCounts(session.user.id),
  ]);

  // Progress for the reading shelf comes from the latest milestones.
  const progressByEntry = new Map<string, number | null>();
  if (shelf === "reading" && entries.length) {
    const events = await db.query.readingEvents.findMany({
      where: inArray(
        schema.readingEvents.entryId,
        entries.map((entry) => entry.id),
      ),
    });
    for (const entry of entries) {
      const own = events.filter((event) => event.entryId === entry.id);
      progressByEntry.set(
        entry.id,
        own.length ? deriveProgress(own, entry.book.pageCount).percent : null,
      );
    }
  }

  const items: ShelfGridItem[] = entries.map((entry) => {
    const position = formatPosition(entry.book.seriesPosition);
    return {
      id: entry.id,
      href: `/books/${entry.book.id}`,
      title: entry.book.title,
      authors: entry.book.authors,
      coverUrl: entry.book.thumbnailUrl ?? entry.book.coverUrl,
      badge: entry.book.series && position ? `#${position}` : null,
      progress: progressByEntry.get(entry.id) ?? null,
    };
  });

  const firstName = session.user.name.split(" ")[0];

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {greeting()}, {firstName}
          </p>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
            Your shelves
          </h1>
        </div>
        <Button asChild variant="outline" className="hidden md:inline-flex">
          <Link href="/search">
            <Search data-icon="inline-start" />
            Add a book
          </Link>
        </Button>
      </header>

      <ShelfTabs active={shelf} counts={counts} />

      {items.length ? (
        <ShelfGrid items={items} />
      ) : (
        <EmptyState
          icon={BookOpen}
          title={EMPTY_COPY[shelf].title}
          description={EMPTY_COPY[shelf].description}
          action={
            <Button asChild>
              <Link href="/search">
                <Search data-icon="inline-start" />
                Find a book
              </Link>
            </Button>
          }
        />
      )}

      <p className="sr-only">
        Showing {items.length} books on the {STATUS_LABELS[shelf]} shelf.
      </p>

      <Link
        href="/search"
        aria-label="Add a book"
        className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lift transition-transform active:scale-95 md:hidden"
      >
        <Plus className="size-6" />
      </Link>
    </div>
  );
}
