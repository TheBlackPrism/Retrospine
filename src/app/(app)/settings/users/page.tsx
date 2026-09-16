import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { SettingsSection } from "@/components/settings/section";
import { UsersAdmin, type AdminUser } from "@/components/settings/users-admin";
import { getAuth } from "@/lib/auth";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Readers" };

export default async function UsersPage() {
  const session = await requireAdmin();
  const auth = await getAuth();
  const { users } = await auth.api.listUsers({
    query: { limit: 200, sortBy: "createdAt", sortDirection: "asc" },
    headers: await headers(),
  });

  const rows: AdminUser[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    username: (user as { username?: string | null }).username ?? null,
    role: user.role === "admin" ? "admin" : "user",
    createdAt: new Date(user.createdAt).toISOString(),
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">
          ← Settings
        </Link>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Readers
        </h1>
      </div>
      <SettingsSection
        title="Invite a reader"
        description="Registration is closed; accounts are created here. Share the initial password and ask them to change it."
      >
        <UsersAdmin users={rows} currentUserId={session.user.id} />
      </SettingsSection>
    </div>
  );
}
