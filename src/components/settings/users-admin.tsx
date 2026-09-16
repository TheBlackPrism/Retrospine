"use client";

import { ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { FormStatus } from "@/components/settings/form-status";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createUserAction,
  removeUserAction,
  setUserRoleAction,
} from "@/lib/actions/settings";
import { idleState } from "@/lib/actions/state";
import { formatDate, initials } from "@/lib/format";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: "admin" | "user";
  createdAt: string;
};

export function UsersAdmin({
  users,
  currentUserId,
}: {
  users: AdminUser[];
  currentUserId: string;
}) {
  return (
    <div className="space-y-8">
      <CreateUserForm />
      <UserList users={users} currentUserId={currentUserId} />
    </div>
  );
}

function CreateUserForm() {
  const [state, action, pending] = useActionState(createUserAction, idleState);
  return (
    <form action={action} className="space-y-4">
      <FormStatus state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="new-name">Name</Label>
          <Input id="new-name" name="name" required className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-username">Username</Label>
          <Input
            id="new-username"
            name="username"
            autoCapitalize="none"
            autoCorrect="off"
            required
            className="h-11"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-email">E-mail</Label>
          <Input id="new-email" name="email" type="email" required className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">Initial password</Label>
          <Input
            id="new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="h-11"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="role"
            value="admin"
            className="size-4 accent-[var(--amber)]"
          />
          Administrator
        </label>
        <Button type="submit" disabled={pending}>
          <UserPlus data-icon="inline-start" />
          {pending ? "Creating…" : "Create account"}
        </Button>
      </div>
    </form>
  );
}

function UserList({
  users,
  currentUserId,
}: {
  users: AdminUser[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <ul className="divide-y divide-border/70 rounded-xl border border-border/70 bg-background/60">
      {users.map((user) => {
        const isSelf = user.id === currentUserId;
        return (
          <li key={user.id} className="flex flex-wrap items-center gap-3 p-3 sm:p-4">
            <Avatar className="size-10">
              <AvatarFallback className="bg-amber-soft font-heading text-sm text-amber-foreground">
                {initials(user.name) || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <span className="truncate">{user.name}</span>
                {user.role === "admin" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-soft px-2 py-0.5 text-[11px] font-medium text-amber-foreground">
                    <ShieldCheck className="size-3" /> Admin
                  </span>
                ) : null}
                {isSelf ? (
                  <span className="text-xs text-muted-foreground">(you)</span>
                ) : null}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.username ? `@${user.username} · ` : ""}
                {user.email} · joined {formatDate(user.createdAt)}
              </p>
            </div>
            {!isSelf ? (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      setUserRoleAction(user.id, user.role === "admin" ? "user" : "admin"),
                    )
                  }
                >
                  {user.role === "admin" ? "Make reader" : "Make admin"}
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Delete ${user.name}`}
                  disabled={pending}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    if (window.confirm(`Delete ${user.name}'s account and library?`)) {
                      run(() => removeUserAction(user.id));
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
