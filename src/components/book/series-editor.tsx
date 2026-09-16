"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setSeriesAction } from "@/lib/actions/library";

export function SeriesEditor({
  bookId,
  seriesName,
  position,
}: {
  bookId: string;
  seriesName: string | null;
  position: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await setSeriesAction(bookId, formData);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant="ghost" className="text-muted-foreground">
          <Pencil data-icon="inline-start" />
          {seriesName ? "Edit series" : "Add to a series"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Series</DialogTitle>
            <DialogDescription>
              Series data comes from Google Books and Open Library when
              available. Correct it here if it is missing or wrong.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-5 grid grid-cols-[1fr_6rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="series-name">Series name</Label>
              <Input
                id="series-name"
                name="name"
                defaultValue={seriesName ?? ""}
                placeholder="e.g. Discworld"
                maxLength={200}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="series-position">Volume</Label>
              <Input
                id="series-position"
                name="position"
                type="number"
                inputMode="decimal"
                step="0.5"
                min={0}
                defaultValue={position ?? ""}
                placeholder="3"
                className="h-11"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Leave the name empty to remove the book from its series.
          </p>
          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
