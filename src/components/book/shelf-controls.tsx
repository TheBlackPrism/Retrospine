"use client";

import { BookPlus, ChevronDown, Loader2, PlayCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  addToShelfAction,
  removeEntryAction,
  setStatusAction,
} from "@/lib/actions/library";
import type { ReadingStatus } from "@/lib/db/schema";
import { READING_STATUSES, STATUS_LABELS } from "@/lib/shelves";

export function ShelfControls({
  bookId,
  entry,
}: {
  bookId: string;
  entry: { id: string; status: ReadingStatus } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        if (result.message) toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  if (!entry) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          size="lg"
          disabled={pending}
          onClick={() => run(() => addToShelfAction(bookId, "reading"))}
        >
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <PlayCircle data-icon="inline-start" />}
          Start reading
        </Button>
        <Button
          size="lg"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => addToShelfAction(bookId, "want_to_read"))}
        >
          <BookPlus data-icon="inline-start" />
          Want to read
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="lg" disabled={pending} className="gap-2">
            {pending ? <Loader2 className="animate-spin" /> : null}
            <StatusBadge status={entry.status} />
            <ChevronDown data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Move to shelf</DropdownMenuLabel>
          {READING_STATUSES.map((status) => (
            <DropdownMenuItem
              key={status}
              disabled={status === entry.status}
              onSelect={() => run(() => setStatusAction(entry.id, bookId, status))}
            >
              {STATUS_LABELS[status]}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              if (window.confirm("Remove this book and its milestones from your shelves?")) {
                run(() => removeEntryAction(entry.id, bookId));
              }
            }}
          >
            <Trash2 />
            Remove from shelves
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
