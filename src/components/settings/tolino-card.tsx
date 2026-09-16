import { Cloud } from "lucide-react";
import Link from "next/link";
import { TolinoStatusCard } from "@/components/settings/tolino/status-card";
import { Button } from "@/components/ui/button";
import type { TolinoConnectionView } from "@/lib/tolino/connection";

/** Summary shown on the settings overview. */
export function TolinoCard({ connection }: { connection: TolinoConnectionView | null }) {
  if (!connection) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border/80 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-soft text-amber-foreground">
            <Cloud className="size-5" />
          </span>
          <p className="text-muted-foreground">
            Bring the books and reading progress from your tolino into your shelves.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/settings/tolino">Connect</Link>
        </Button>
      </div>
    );
  }
  return <TolinoStatusCard connection={connection} compact />;
}
