"use client";

import { ChevronDown, Cloud } from "lucide-react";
import { useActionState, useState } from "react";
import { FormStatus } from "@/components/settings/form-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { connectTolinoAction } from "@/lib/actions/tolino";
import { idleState } from "@/lib/actions/state";
import { TOLINO_RESELLERS, TOLINO_WEB_READER_URL } from "@/lib/tolino/resellers";

export function TolinoConnectForm({
  defaultResellerId,
  replacing,
}: {
  defaultResellerId?: number | null;
  replacing?: boolean;
}) {
  const [state, action, pending] = useActionState(connectTolinoAction, idleState);
  const [resellerId, setResellerId] = useState(
    defaultResellerId ? String(defaultResellerId) : "",
  );
  const [advanced, setAdvanced] = useState(false);

  return (
    <form action={action} className="space-y-6">
      <FormStatus state={state} />

      <ol className="space-y-3 rounded-xl border border-border/70 bg-background/60 p-4 text-sm">
        <li className="flex gap-3">
          <StepNumber>1</StepNumber>
          <span>
            Open the{" "}
            <a
              href={TOLINO_WEB_READER_URL}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline underline-offset-4"
            >
              tolino web reader
            </a>{" "}
            in a desktop browser, but do not sign in yet.
          </span>
        </li>
        <li className="flex gap-3">
          <StepNumber>2</StepNumber>
          <span>
            Open the developer tools (<kbd className="rounded bg-muted px-1">F12</kbd>), switch to
            the <strong>Network</strong> tab and type <code className="rounded bg-muted px-1">token</code>{" "}
            into its filter box.
          </span>
        </li>
        <li className="flex gap-3">
          <StepNumber>3</StepNumber>
          <span>
            Sign in with your bookshop account. A request called <strong>token</strong> appears;
            open its <strong>Response</strong> and copy the value of{" "}
            <code className="rounded bg-muted px-1">refresh_token</code> (or the whole response).
          </span>
        </li>
        <li className="flex gap-3">
          <StepNumber>4</StepNumber>
          <span>Paste it below, choose your bookshop and connect.</span>
        </li>
      </ol>

      <div className="space-y-1.5">
        <Label htmlFor="tolino-reseller">Bookshop</Label>
        <input type="hidden" name="resellerId" value={resellerId} />
        <Select value={resellerId} onValueChange={setResellerId}>
          <SelectTrigger id="tolino-reseller" className="h-11 w-full">
            <SelectValue placeholder="Where did you buy your tolino?" />
          </SelectTrigger>
          <SelectContent>
            {TOLINO_RESELLERS.map((reseller) => (
              <SelectItem key={reseller.id} value={String(reseller.id)}>
                {reseller.name}
                <span className="text-muted-foreground"> · {reseller.country}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          The bookshop whose account you use in the web reader.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tolino-refresh-token">Refresh token</Label>
        <Textarea
          id="tolino-refresh-token"
          name="refreshToken"
          rows={3}
          required
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste the refresh_token here"
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Retrospine takes over this sign-in and keeps it alive. The web reader tab will ask you
          to sign in again the next time you open it; that does not affect Retrospine.
        </p>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setAdvanced((value) => !value)}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className={`size-4 transition-transform ${advanced ? "rotate-180" : ""}`} />
          Advanced
        </button>
        {advanced ? (
          <div className="mt-3 space-y-1.5">
            <Label htmlFor="tolino-hardware-id">Device id (optional)</Label>
            <Input
              id="tolino-hardware-id"
              name="hardwareId"
              autoComplete="off"
              spellCheck={false}
              placeholder="Detected automatically"
              className="h-11 font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Normally Retrospine reuses the web reader&apos;s device. If that fails, copy the{" "}
              <code className="rounded bg-muted px-1">hardware-id</code> request header of any
              request to <code className="rounded bg-muted px-1">api.pageplace.de</code> from the
              Network tab.
            </p>
          </div>
        ) : null}
      </div>

      <Button type="submit" size="lg" disabled={pending || !resellerId}>
        <Cloud data-icon="inline-start" />
        {pending ? "Connecting…" : replacing ? "Replace connection" : "Connect Tolino Cloud"}
      </Button>
    </form>
  );
}

function StepNumber({ children }: { children: React.ReactNode }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-amber-soft text-xs font-semibold text-amber-foreground">
      {children}
    </span>
  );
}
