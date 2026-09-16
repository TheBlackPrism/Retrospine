"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";

export function SetupForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const username = String(form.get("username") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
        username,
      });
      if (result.error) {
        setError(result.error.message ?? "Could not create the account.");
        return;
      }
      router.push("/library");
      router.refresh();
    });
  }

  return (
    <div className="rounded-3xl border border-border/70 bg-card/80 p-6 shadow-lift backdrop-blur sm:p-8">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-soft px-2.5 py-1 text-xs font-medium text-amber-foreground">
        <Sparkles className="size-3.5" /> First run
      </span>
      <h1 className="mt-4 font-heading text-2xl font-semibold">
        Set up your library
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        This first account becomes the administrator. Further readers can be
        invited from the settings later.
      </p>

      {error ? (
        <Alert variant="destructive" className="mt-5">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" required className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            pattern="[A-Za-z0-9_.\-]{3,32}"
            title="3 to 32 letters, numbers, dots, dashes or underscores"
            required
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              className="h-11"
            />
          </div>
        </div>
        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending ? "Creating your shelf…" : "Create account"}
        </Button>
      </form>
    </div>
  );
}
