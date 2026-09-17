"use client";

import { ChevronDown, Cloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { connectTolinoAction, prepareTolinoConnectAction } from "@/lib/actions/tolino";
import type { FormState } from "@/lib/actions/state";
import { refreshTokensInBrowser } from "@/lib/tolino/browser";
import { extractRefreshToken } from "@/lib/tolino/parse";
import { TOLINO_RESELLERS, TOLINO_WEB_READER_URL } from "@/lib/tolino/resellers";
import { TOKEN_EXCHANGE_BLOCKED } from "@/lib/tolino/tokens";

export function TolinoConnectForm({
  defaultResellerId,
  replacing,
}: {
  defaultResellerId?: number | null;
  replacing?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({ status: "idle" });
  const [resellerId, setResellerId] = useState(
    defaultResellerId ? String(defaultResellerId) : "",
  );
  const [advanced, setAdvanced] = useState(false);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const refreshToken = extractRefreshToken(String(form.get("refreshToken") ?? ""));
    const hardwareId = String(form.get("hardwareId") ?? "").trim();
    const reseller = Number(resellerId);
    if (!reseller) {
      setState({ status: "error", message: "Choose your bookshop." });
      return;
    }
    if (refreshToken.length < 8) {
      setState({ status: "error", message: "Paste the refresh token from the web reader." });
      return;
    }

    startTransition(async () => {
      setState({ status: "idle" });
      const prepared = await prepareTolinoConnectAction(reseller);
      if (!prepared.ok) {
        setState({ status: "error", message: prepared.error });
        return;
      }
      const { serverCanRefresh, oauth } = prepared.data!;

      let result = serverCanRefresh
        ? await connectTolinoAction({ resellerId: reseller, refreshToken, hardwareId })
        : null;
      if (!result || (!result.ok && result.code === TOKEN_EXCHANGE_BLOCKED)) {
        // The bookshop blocks this server (or gave no clear answer), so the
        // browser exchanges the token and hands the result to the server.
        const exchanged = await refreshTokensInBrowser(oauth, refreshToken);
        if (!exchanged.ok) {
          setState({ status: "error", message: exchanged.failure.message });
          return;
        }
        result = await connectTolinoAction({
          resellerId: reseller,
          tokens: exchanged.tokens,
          hardwareId,
        });
      }

      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        setState({ status: "error", message: result.error });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
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
            Sign in with your bookshop account. One or more requests called{" "}
            <strong>token</strong> appear; open the <strong>last</strong> one, open its{" "}
            <strong>Response</strong> and copy the value of{" "}
            <code className="rounded bg-muted px-1">refresh_token</code> (or the whole response).
          </span>
        </li>
        <li className="flex gap-3">
          <StepNumber>4</StepNumber>
          <span>
            Do not reload the web reader or sign out afterwards. Reloading makes it use the token
            again, which invalidates the copy you just took, and signing out ends the session
            Retrospine is about to take over.
          </span>
        </li>
        <li className="flex gap-3">
          <StepNumber>5</StepNumber>
          <span>
            Paste the token below <strong>right away</strong> (it stays valid for about an hour,
            and only until the web reader uses it again), choose your bookshop and connect.
          </span>
        </li>
      </ol>

      <div className="space-y-1.5">
        <Label htmlFor="tolino-reseller">Bookshop</Label>
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
          Retrospine takes over this sign-in and keeps it alive. The next time you open the web
          reader it may ask you to sign in again; if Retrospine then reports a failed sign-in,
          connect again with the new token.
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
              <code className="rounded bg-muted px-1">hardware_id</code> (or{" "}
              <code className="rounded bg-muted px-1">hardware-id</code>) request header of the{" "}
              <strong>devices</strong> or <strong>inventory</strong> request to{" "}
              <code className="rounded bg-muted px-1">api.pageplace.de</code> from the Network
              tab.
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
