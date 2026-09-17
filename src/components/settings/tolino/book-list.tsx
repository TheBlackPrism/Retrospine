"use client";

import {
  BookOpenCheck,
  CheckCircle2,
  EyeOff,
  Headphones,
  Link2,
  Loader2,
  MoreHorizontal,
  Search,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { BookCover } from "@/components/book-cover";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ignoreTolinoBookAction, relinkTolinoBookAction } from "@/lib/actions/tolino";
import type { ReadingStatus, TolinoBookKind, TolinoMatchSource } from "@/lib/db/schema";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TolinoBookItem = {
  id: string;
  title: string;
  subtitle: string | null;
  authors: string[];
  kind: TolinoBookKind;
  coverUrl: string | null;
  progress: number | null;
  progressAt: string | null;
  finished: boolean;
  finishedAt: string | null;
  ignored: boolean;
  matchSource: TolinoMatchSource | null;
  book: {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    status: ReadingStatus | null;
  } | null;
};

const MATCH_LABELS: Record<TolinoMatchSource, string> = {
  isbn: "matched by ISBN",
  google: "matched on Google Books",
  tolino: "created from Tolino data",
  manual: "linked by you",
};

type Filter = "all" | "reading" | "finished" | "unmatched";

export function TolinoBookList({ items }: { items: TolinoBookItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (filter === "reading" && !(item.progress && !item.finished)) return false;
      if (filter === "finished" && !item.finished) return false;
      if (filter === "unmatched" && item.book) return false;
      if (!needle) return true;
      return (
        item.title.toLowerCase().includes(needle) ||
        item.authors.some((author) => author.toLowerCase().includes(needle))
      );
    });
  }, [items, query, filter]);

  if (!items.length) {
    return (
      <p className="rounded-2xl border border-dashed border-border/80 px-4 py-6 text-center text-sm text-muted-foreground">
        Nothing synced yet. Press “Sync now” to import your Tolino library.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">Filter books</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            placeholder="Filter by title or author"
            className="h-10 w-full rounded-xl border border-border/70 bg-card/80 pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />
        </label>
        <div role="radiogroup" aria-label="Show" className="flex gap-1 rounded-full border border-border/70 bg-background/60 p-1">
          {(
            [
              ["all", "All"],
              ["reading", "Reading"],
              ["finished", "Finished"],
              ["unmatched", "Unmatched"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                filter === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {shown.length ? (
        <ul className="divide-y divide-border/70 rounded-xl border border-border/70 bg-background/60">
          {shown.map((item) => (
            <TolinoBookRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-muted-foreground">No books match.</p>
      )}
    </div>
  );
}

function TolinoBookRow({ item }: { item: TolinoBookItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [relinkOpen, setRelinkOpen] = useState(false);

  function toggleIgnored() {
    startTransition(async () => {
      const result = await ignoreTolinoBookAction(item.id, !item.ignored);
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const KindIcon = item.kind === "audiobook" ? Headphones : item.kind === "upload" ? Upload : null;

  return (
    <li className={cn("flex gap-3 p-3 sm:p-4", item.ignored && "opacity-60")}>
      <div className="w-12 shrink-0">
        <BookCover
          src={item.book?.thumbnailUrl ?? item.coverUrl}
          title={item.title}
          author={item.authors[0]}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{item.title}</span>
          {KindIcon ? (
            <KindIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label={item.kind} />
          ) : null}
        </p>
        {item.authors.length ? (
          <p className="truncate text-xs text-muted-foreground">{item.authors.join(", ")}</p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {item.ignored ? (
            <span className="inline-flex items-center gap-1">
              <EyeOff className="size-3" /> Not synced
            </span>
          ) : item.finished ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-3" />
              Finished{item.finishedAt ? ` ${formatDate(item.finishedAt)}` : ""}
            </span>
          ) : item.progress ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-amber" style={{ width: `${item.progress}%` }} />
              </span>
              {item.progress}%{item.progressAt ? ` · ${formatDate(item.progressAt)}` : ""}
            </span>
          ) : (
            <span>Not started</span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          {item.book ? (
            <>
              <Link
                href={`/books/${item.book.id}`}
                className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
              >
                <BookOpenCheck className="size-3.5" />
                <span className="truncate">{item.book.title}</span>
              </Link>
              {item.book.status ? <StatusBadge status={item.book.status} className="px-2 py-0.5 text-[11px]" /> : null}
              {item.matchSource ? (
                <span className="text-muted-foreground">{MATCH_LABELS[item.matchSource]}</span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">
              {item.ignored ? "Excluded from syncing" : "Not matched yet"}
            </span>
          )}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={`Options for ${item.title}`} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => setRelinkOpen(true)}>
            <Link2 />
            {item.book ? "Link to a different book" : "Choose the book"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleIgnored}>
            <EyeOff />
            {item.ignored ? "Sync this book again" : "Don’t sync this book"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RelinkDialog
        open={relinkOpen}
        onOpenChange={setRelinkOpen}
        tolinoBookId={item.id}
        initialQuery={[item.title, item.authors[0]].filter(Boolean).join(" ")}
      />
    </li>
  );
}

type SearchHit = {
  googleId: string | null;
  title: string;
  subtitle: string | null;
  authors: string[];
  publishedDate: string | null;
  thumbnailUrl: string | null;
};

function RelinkDialog({
  open,
  onOpenChange,
  tolinoBookId,
  initialQuery,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tolinoBookId: string;
  initialQuery: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<{ query: string; items: SearchHit[] }>({
    query: "",
    items: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const trimmed = query.trim();
  const hits = result.query === trimmed ? result.items : [];

  useEffect(() => {
    if (!open || trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/books/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as { items?: SearchHit[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "The search failed.");
        setResult({ query: trimmed, items: data.items ?? [] });
        setError(null);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(caught instanceof Error ? caught.message : "The search failed.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, trimmed]);

  function choose(googleId: string) {
    startTransition(async () => {
      const result = await relinkTolinoBookAction(tolinoBookId, googleId);
      if (result.ok) {
        toast.success(result.message);
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Choose the right book</DialogTitle>
          <DialogDescription>
            Search Google Books and pick the edition this Tolino book should count as. Reading
            progress will be recorded on the book you choose.
          </DialogDescription>
        </DialogHeader>
        <label className="relative mt-2 block">
          <span className="sr-only">Search Google Books</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            autoFocus
            placeholder="Title, author or ISBN"
            className="h-11 w-full rounded-xl border border-border/70 bg-card/80 pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />
        </label>
        <div className="max-h-80 overflow-y-auto">
          {error ? <p className="py-4 text-center text-sm text-destructive">{error}</p> : null}
          {loading && !hits.length ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Searching…</p>
          ) : null}
          {!loading && !error && !hits.length && trimmed.length >= 2 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No books found.</p>
          ) : null}
          <ul className="space-y-2">
            {hits.map((hit, index) => (
              <li
                key={hit.googleId ?? `${hit.title}-${index}`}
                className="flex items-center gap-3 rounded-xl border border-border/60 p-2"
              >
                <div className="w-10 shrink-0">
                  <BookCover src={hit.thumbnailUrl} title={hit.title} author={hit.authors[0]} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{hit.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[hit.authors.join(", "), hit.publishedDate?.slice(0, 4)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={pending || !hit.googleId}
                  onClick={() => hit.googleId && choose(hit.googleId)}
                >
                  Use this
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
