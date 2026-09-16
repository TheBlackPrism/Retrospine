"use client";

import { useActionState } from "react";
import { FormStatus } from "@/components/settings/form-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction } from "@/lib/actions/settings";
import { idleState } from "@/lib/actions/state";

export function ProfileForm({
  name,
  username,
  email,
}: {
  name: string;
  username: string | null;
  email: string;
}) {
  const [state, action, pending] = useActionState(updateProfileAction, idleState);
  return (
    <form action={action} className="space-y-4">
      <FormStatus state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="profile-name">Name</Label>
          <Input id="profile-name" name="name" defaultValue={name} required className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="profile-username">Username</Label>
          <Input
            id="profile-username"
            name="username"
            defaultValue={username ?? ""}
            autoCapitalize="none"
            autoCorrect="off"
            required
            className="h-11"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="profile-email">E-mail</Label>
        <Input id="profile-email" value={email} readOnly disabled className="h-11" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
