import Link from "next/link";
import { BookCover } from "@/components/book-cover";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getSeriesVolumes } from "@/lib/books/series";
import type { Book, Series } from "@/lib/db/schema";
import { formatPosition } from "@/lib/format";

export async function SeriesStrip({
  series,
  book,
  userId,
}: {
  series: Series;
  book: Book;
  userId: string;
}) {
  const volumes = await getSeriesVolumes(series, book, userId);
  if (!volumes.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No other volumes of {series.name} found yet.
      </p>
    );
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 scrollbar-none sm:mx-0 sm:px-0">
      <ul className="flex snap-x snap-mandatory gap-4">
        {volumes.map((volume) => {
          const href = volume.bookId
            ? `/books/${volume.bookId}`
            : volume.googleId
              ? `/books/google/${volume.googleId}`
              : null;
          const position = formatPosition(volume.position);
          const card = (
            <>
              <div className="relative">
                <BookCover
                  src={volume.thumbnailUrl}
                  title={volume.title}
                  author={volume.authors[0]}
                />
                {position ? (
                  <span className="absolute top-1.5 left-1.5 rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold shadow-sm backdrop-blur">
                    #{position}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-snug font-medium">
                {volume.title}
              </p>
              {volume.status ? (
                <StatusBadge status={volume.status} className="mt-1.5 px-2 py-0.5 text-[10px]" />
              ) : null}
            </>
          );
          return (
            <li key={volume.key} className="w-28 shrink-0 snap-start sm:w-32">
              {href ? (
                <Link
                  href={href}
                  className="block rounded-xl outline-none transition-transform hover:-translate-y-1 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {card}
                </Link>
              ) : (
                <div>{card}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function SeriesStripSkeleton() {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="w-28 shrink-0 sm:w-32">
          <Skeleton className="aspect-[2/3] w-full rounded-lg" />
          <Skeleton className="mt-2 h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}
