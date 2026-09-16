"use client";

import { AlertCircle, CheckCircle2, Cloud, Loader2, RefreshCw, Unlink2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  disconnectTolinoAction,
  syncTolinoNowAction,
  updateTolinoOptionsAction,
} from "@/lib/actions/tolino";
import { formatRelative, pluralize } from "@/lib/format";
import type { TolinoConnectionView } from "@/lib/tolino/connection";

const POLL_MS = 4000;

function summaryText(summary: NonNullable<TolinoConnectionView["lastSummary"]>): string {
  const parts = [
    `${pluralize(summary.books, "book")} in your Tolino library`,
    `${summary.matched} matched`,
  ];
  if (summary.added) parts.push(`${summary.added} added to your shelves`);
  if (summary.events) parts.push(`${pluralize(summary.events, "milestone")} recorded`);
  if (summary.deferred) parts.push(`${summary.deferred} waiting for Google Books`);
  if (summary.skipped) parts.push(`${summary.skipped} skipped`);
  return parts.join(" · ");
}

/** Refreshes the page while a sync is running so the status stays live. */
export function useSyncPolling(running: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [running, router]);
}

export function TolinoStatusCard({
  connection,
  compact = false,
}: {
  connection: TolinoConnectionView;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const running = connection.syncStatus === "running";
  useSyncPolling(running);

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

  function disconnect() {
    if (
      !window.confirm(
        "Disconnect Tolino Cloud? Books and milestones already on your shelves stay where they are.",
      )
    ) {
      return;
    }
    run(disconnectTolinoAction);
  }

  const authProblem = connection.syncStatus === "error" && /sign-in failed/i.test(connection.lastError ?? "");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-soft text-amber-foreground">
            <Cloud className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">{connection.resellerName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {running ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="size-3 animate-spin" />
                  Syncing
                  {connection.syncStartedAt
                    ? `, started ${formatRelative(connection.syncStartedAt)}`
                    : "…"}
                </span>
              ) : connection.lastSuccessAt ? (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="size-3 text-emerald-600" />
                  Last synced {formatRelative(connection.lastSuccessAt)}
                </span>
              ) : (
                "Not synced yet"
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button size="sm" disabled={pending || running} onClick={() => run(syncTolinoNowAction)}>
            {running ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            {running ? "Syncing…" : "Sync now"}
          </Button>
          {compact ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/tolino">Manage</Link>
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={pending} onClick={disconnect}>
              <Unlink2 data-icon="inline-start" />
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {connection.syncStatus === "error" && connection.lastError ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            <span>{connection.lastError}</span>
            {authProblem ? (
              <Link href="/settings/tolino?reconnect=1" className="font-medium underline underline-offset-4">
                Connect again with a fresh token
              </Link>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {!compact && connection.lastSummary ? (
        <p className="text-sm text-muted-foreground">{summaryText(connection.lastSummary)}</p>
      ) : null}
    </div>
  );
}

function OptionRow({
  id,
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 bg-background/60 p-4">
      <div>
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function TolinoOptions({
  connection,
  intervalMinutes,
}: {
  connection: TolinoConnectionView;
  intervalMinutes: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [options, setOptions] = useState({
    autoSync: connection.autoSync,
    importUnread: connection.importUnread,
    includeAudiobooks: connection.includeAudiobooks,
  });

  function update(patch: Partial<typeof options>) {
    const next = { ...options, ...patch };
    setOptions(next);
    startTransition(async () => {
      const result = await updateTolinoOptionsAction(patch);
      if (result.ok) {
        router.refresh();
      } else {
        toast.error(result.error);
        setOptions(options);
      }
    });
  }

  return (
    <div className="space-y-3">
      <OptionRow
        id="tolino-auto-sync"
        label="Sync automatically"
        description={
          intervalMinutes
            ? `Every ${pluralize(intervalMinutes, "minute")} while the server is running; “Sync now” always works.`
            : "Automatic syncing is turned off on this server (TOLINO_SYNC_INTERVAL); use “Sync now”."
        }
        checked={options.autoSync}
        disabled={pending}
        onCheckedChange={(value) => update({ autoSync: value })}
      />
      <OptionRow
        id="tolino-import-unread"
        label="Add unread books to “Want to read”"
        description="Books you own but have not opened yet land on your wishlist. Books you started or finished are always imported."
        checked={options.importUnread}
        disabled={pending}
        onCheckedChange={(value) => update({ importUnread: value })}
      />
      <OptionRow
        id="tolino-audiobooks"
        label="Include audiobooks"
        description="Also sync audiobooks from your Tolino library."
        checked={options.includeAudiobooks}
        disabled={pending}
        onCheckedChange={(value) => update({ includeAudiobooks: value })}
      />
    </div>
  );
}
