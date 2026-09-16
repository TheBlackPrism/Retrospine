import { BookMarked } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      href="/library"
      className={cn("flex items-center gap-2.5 outline-none", className)}
    >
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-lift">
        <BookMarked className="size-4" />
      </span>
      <span className="font-heading text-xl font-semibold tracking-tight">
        Retrospine
      </span>
    </Link>
  );
}
