"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addMilestoneAction } from "@/lib/actions/library";
import type { ReadingEventType } from "@/lib/db/schema";
import { toDateInputValue } from "@/lib/format";
import { EVENT_LABELS, EVENT_TYPES } from "@/lib/shelves";
import { cn } from "@/lib/utils";

export function MilestoneDrawer({
  entryId,
  bookId,
  pageCount,
  suggestedType,
}: {
  entryId: string;
  bookId: string;
  pageCount: number | null;
  suggestedType: ReadingEventType;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ReadingEventType>(suggestedType);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("type", type);
    startTransition(async () => {
      const result = await addMilestoneAction(entryId, bookId, formData);
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
    <Drawer
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setType(suggestedType);
      }}
    >
      <DrawerTrigger asChild>
        <Button size="sm">
          <Plus data-icon="inline-start" />
          Add milestone
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <form onSubmit={onSubmit} className="mx-auto w-full max-w-md">
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-heading text-xl">Add a milestone</DrawerTitle>
            <DrawerDescription>
              Keep track of when you started, how far you are and how it ended.
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-5 px-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {EVENT_TYPES.map((eventType) => (
                <button
                  key={eventType}
                  type="button"
                  onClick={() => setType(eventType)}
                  aria-pressed={type === eventType}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                    type === eventType
                      ? "border-primary bg-primary text-primary-foreground shadow-lift"
                      : "border-border bg-card hover:bg-muted",
                  )}
                >
                  {EVENT_LABELS[eventType]}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="milestone-date">Date</Label>
              <Input
                id="milestone-date"
                name="date"
                type="date"
                defaultValue={toDateInputValue(new Date())}
                max={toDateInputValue(new Date())}
                required
                className="h-11"
              />
            </div>
            {type === "progress" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="milestone-page">
                    Page{pageCount ? ` of ${pageCount}` : ""}
                  </Label>
                  <Input
                    id="milestone-page"
                    name="page"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={pageCount ?? undefined}
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="milestone-percent">Percent</Label>
                  <Input
                    id="milestone-percent"
                    name="percent"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    className="h-11"
                  />
                </div>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="milestone-note">
                {type === "note" ? "Note" : "Note (optional)"}
              </Label>
              <Textarea
                id="milestone-note"
                name="note"
                rows={3}
                maxLength={2000}
                placeholder={
                  type === "note"
                    ? "A thought, a quote, a page you want to remember…"
                    : "Anything worth remembering?"
                }
              />
            </div>
          </div>
          <DrawerFooter className="pb-safe">
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Saving…" : "Save milestone"}
            </Button>
            <DrawerClose asChild>
              <Button type="button" variant="ghost" size="lg">
                Cancel
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
