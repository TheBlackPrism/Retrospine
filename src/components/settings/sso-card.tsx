"use client";

import { KeyRound, Link2, Unlink2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { unlinkSsoAction } from "@/lib/actions/settings";
import { authClient } from "@/lib/auth/client";
import { OIDC_PROVIDER_ID } from "@/lib/auth/constants";

export function SsoCard({
  configured,
  label,
  linked,
  isAdmin,
}: {
  configured: boolean;
  label: string | null;
  linked: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [redirecting, setRedirecting] = useState(false);

  async function connect() {
    setRedirecting(true);
    const result = await authClient.linkSocial({
      provider: OIDC_PROVIDER_ID,
      callbackURL: "/settings?linked=1",
    });
    if (result.error) {
      toast.error(result.error.message ?? "Could not start the connection.");
      setRedirecting(false);
    }
  }

  function disconnect() {
    if (!window.confirm("Disconnect single sign-on from this account?")) return;
    startTransition(async () => {
      const result = await unlinkSsoAction();
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (!configured) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border/80 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">
          Single sign-on is not configured on this server.
        </p>
        {isAdmin ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/sso">Configure OIDC</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-amber-soft text-amber-foreground">
          <KeyRound className="size-5" />
        </span>
        <div>
          <p className="text-sm font-medium">{label ?? "Single sign-on"}</p>
          <p className="text-xs text-muted-foreground">
            {linked
              ? "Connected. You can sign in with either method."
              : "Connect once, then use the SSO button on the sign-in page."}
          </p>
        </div>
      </div>
      {linked ? (
        <Button variant="outline" size="sm" disabled={pending} onClick={disconnect}>
          <Unlink2 data-icon="inline-start" />
          Disconnect
        </Button>
      ) : (
        <Button size="sm" disabled={redirecting} onClick={connect}>
          <Link2 data-icon="inline-start" />
          {redirecting ? "Redirecting…" : "Connect"}
        </Button>
      )}
    </div>
  );
}
