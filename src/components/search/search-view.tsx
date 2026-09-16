"use client";

import { BookPlus, BookOpenCheck, Loader2, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { BookCover } from "@/components/book-cover";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { addGoogleBookAction } from "@/lib/actions/library";
import type { ReadingStatus } from "@/lib/db/schema";
import { formatYear } from "@/lib/format";

export type SearchResult = {
  googleId: string | null;
  title: string;
  subtitle: string | null;
  authors: string[];
  publishedDate: string | null;
  pageCount: number | null;
  thumbnailUrl: string | null;
  bookId: string | null;
  status: ReadingStatus | null;
};

type Phase = "idle" | "loading" | "done" | "error";

export function SearchView({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();
  const active = trimmed.length >= 2;

  useEffect(() => {
    const url = new URL(window.location.href);
    if (trimmed) url.searchParams.set("q", trimmed);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  }, [trimmed]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setPhase("loading");
      try {
        const response = await fetch(
          `/api/books/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        const data = (await response.json()) as {
          items?: SearchResult[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "The search failed.");
        setResults(data.items ?? []);
        setError(null);
        setPhase("done");
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "The search failed.");
        setPhase("error");
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, active]);

  const shownPhase: Phase = active ? phase : "idle";
  const shownResults = active ? results : [];

  function markAdded(googleId: string, bookId: string, status: ReadingStatus) {
    setResults((current) =>
      current.map((item) =>
        item.googleId === googleId ? { ...item, bookId, status } : item,
      ),
    );
  }

  return (
    <div className="space-y-5">
      <div className="sticky top-0 z-20 -mx-4 bg-background/80 px-4 pt-2 pb-3 backdrop-blur-xl sm:mx-0 sm:px-0 md:static md:bg-transparent md:backdrop-blur-none">
        <label className="relative block">
          <span className="sr-only">Search books</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoFocus={!initialQuery}
            placeholder="Title, author or ISBN"
            className="h-12 w-full rounded-2xl border border-border/70 bg-card/80 pr-11 pl-11 text-base shadow-sm outline-none transition-[box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 [&::-webkit-search-cancel-button]:hidden"
          />
          {shownPhase === "loading" ? (
            <Loader2 className="absolute top-1/2 right-4 size-4.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="absolute top-1/2 right-3 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </label>
      </div>

      {shownPhase === "idle" ? (
        <div className="px-1 pt-8 text-center">
          <p className="font-heading text-xl">Find your next read</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Search Google Books by title, author or ISBN and add results to a
            shelf.
          </p>
        </div>
      ) : null}

      {shownPhase === "error" && error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {shownPhase === "loading" && shownResults.length === 0 ? (
        <ul className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <li key={index} className="flex gap-4 rounded-2xl border border-border/60 bg-card/60 p-3">
              <Skeleton className="h-24 w-16 shrink-0 rounded-md" />
              <div className="flex-1 space-y-2 py-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {shownPhase === "done" && shownResults.length === 0 ? (
        <p className="pt-8 text-center text-sm text-muted-foreground">
          No books matched “{trimmed}”.
        </p>
      ) : null}

      <ul className="space-y-3">
        <AnimatePresence initial={false}>
          {shownResults.map((result, index) => (
            <motion.li
              key={result.googleId ?? `${result.title}-${index}`}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03 }}
            >
              <ResultRow result={result} onAdded={markAdded} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function ResultRow({
  result,
  onAdded,
}: {
  result: SearchResult;
  onAdded: (googleId: string, bookId: string, status: ReadingStatus) => void;
}) {
  const [pending, startTransition] = useTransition();
  const year = formatYear(result.publishedDate);
  const meta = [
    result.authors.join(", "),
    year,
    result.pageCount ? `${result.pageCount} pages` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function add(status: ReadingStatus) {
    if (!result.googleId) return;
    const googleId = result.googleId;
    startTransition(async () => {
      const response = await addGoogleBookAction(googleId, status);
      if (response.ok) {
        toast.success(response.message);
        if (response.data) onAdded(googleId, response.data.bookId, status);
      } else {
        toast.error(response.error);
      }
    });
  }

  const detailHref = result.bookId
    ? `/books/${result.bookId}`
    : result.googleId
      ? `/books/google/${result.googleId}`
      : null;

  return (
    <div className="flex gap-4 rounded-2xl border border-border/60 bg-card/70 p-3 shadow-sm">
      {detailHref ? (
        <Link href={detailHref} className="w-16 shrink-0">
          <BookCover src={result.thumbnailUrl} title={result.title} author={result.authors[0]} />
        </Link>
      ) : (
        <div className="w-16 shrink-0">
          <BookCover src={result.thumbnailUrl} title={result.title} author={result.authors[0]} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {detailHref ? (
          <Link href={detailHref} className="line-clamp-2 leading-snug font-medium">
            {result.title}
          </Link>
        ) : (
          <p className="line-clamp-2 leading-snug font-medium">{result.title}</p>
        )}
        {result.subtitle ? (
          <p className="line-clamp-1 text-xs text-muted-foreground">{result.subtitle}</p>
        ) : null}
        {meta ? <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{meta}</p> : null}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          {result.status && result.bookId ? (
            <>
              <StatusBadge status={result.status} />
              <Button asChild size="sm" variant="ghost">
                <Link href={`/books/${result.bookId}`}>
                  <BookOpenCheck data-icon="inline-start" />
                  Open
                </Link>
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !result.googleId}
                onClick={() => add("want_to_read")}
              >
                <BookPlus data-icon="inline-start" />
                Want to read
              </Button>
              <Button
                size="sm"
                disabled={pending || !result.googleId}
                onClick={() => add("reading")}
              >
                {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                Start reading
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
