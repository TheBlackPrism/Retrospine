import { AppShell } from "@/components/app-shell";
import { PageTransition } from "@/components/page-transition";
import { isAdmin, requireSession } from "@/lib/auth/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return (
    <AppShell
      user={{
        name: session.user.name,
        username: session.user.username ?? null,
        image: session.user.image ?? null,
        isAdmin: isAdmin(session),
      }}
    >
      <PageTransition>{children}</PageTransition>
    </AppShell>
  );
}
