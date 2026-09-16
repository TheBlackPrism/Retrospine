"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/settings/form-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePasswordAction } from "@/lib/actions/settings";
import { idleState } from "@/lib/actions/state";

export function PasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, idleState);
  return (
    <form action={action} className="space-y-4">
      <FormStatus state={state} />
      <div className="space-y-1.5">
        <Label htmlFor="current-password">Current password</Label>
        <Input
          id="current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="h-11"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-password">Confirm</Label>
          <Input
            id="confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="h-11"
          />
        </div>
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Changing…" : "Change password"}
      </Button>
    </form>
  );
}
