"use client";

import { KeyRound, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { OIDC_PROVIDER_ID } from "@/lib/auth/constants";

const SSO_ERRORS: Record<string, string> = {
  account_not_linked:
    "This single sign-on identity is not connected to an account yet. Sign in with your password, then connect it under Settings.",
  signup_disabled:
    "No account exists for this single sign-on identity. Ask an administrator to create one, then connect it under Settings.",
  email_not_found: "The identity provider did not share an e-mail address.",
  oauth_provider_not_found:
    "Single sign-on is not configured on this server.",
  state_mismatch: "The sign-in attempt expired. Please try again.",
};

export function LoginForm({
  next,
  ssoLabel,
  initialError,
}: {
  next: string | null;
  ssoLabel: string | null;
  initialError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [ssoPending, setSsoPending] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError
      ? (SSO_ERRORS[initialError] ??
        `Single sign-on failed (${initialError.replace(/_/g, " ")}).`)
      : null,
  );
  const destination = next ?? "/library";

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");
    setError(null);
    startTransition(async () => {
      const result = await authClient.signIn.username({ username, password });
      if (result.error) {
        setError(
          result.error.status === 401 || result.error.status === 400
            ? "That username and password do not match."
            : (result.error.message ?? "Could not sign you in."),
        );
        return;
      }
      router.push(destination);
      router.refresh();
    });
  }

  async function onSso() {
    setSsoPending(true);
    setError(null);
    const result = await authClient.signIn.social({
      provider: OIDC_PROVIDER_ID,
      callbackURL: destination,
      errorCallbackURL: "/login",
    });
    if (result.error) {
      setError(result.error.message ?? "Single sign-on is unavailable right now.");
      setSsoPending(false);
    }
  }

  return (
    <div className="rounded-3xl border border-border/70 bg-card/80 p-6 shadow-lift backdrop-blur sm:p-8">
      <h1 className="font-heading text-2xl font-semibold">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Sign in to pick up where you left off.
      </p>

      {error ? (
        <Alert variant="destructive" className="mt-5">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            required
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-11"
          />
        </div>
        <Button type="submit" className="h-11 w-full" disabled={pending}>
          <LogIn data-icon="inline-start" />
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {ssoLabel ? (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground uppercase">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={onSso}
            disabled={ssoPending}
          >
            <KeyRound data-icon="inline-start" />
            {ssoPending ? "Redirecting…" : `Continue with ${ssoLabel}`}
          </Button>
        </>
      ) : null}
    </div>
  );
}
