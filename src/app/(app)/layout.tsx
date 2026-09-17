import { AppShell } from "@/components/app-shell";
import { PageTransition } from "@/components/page-transition";
import { TolinoTokenKeeper } from "@/components/settings/tolino/token-keeper";
import { isAdmin, requireSession } from "@/lib/auth/session";
import { getTolinoConnection } from "@/lib/tolino/connection";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const tolino = await getTolinoConnection(session.user.id);
  return (
    <AppShell
      user={{
        name: session.user.name,
        username: session.user.username ?? null,
        image: session.user.image ?? null,
        isAdmin: isAdmin(session),
      }}
    >
      {tolino ? <TolinoTokenKeeper /> : null}
      <PageTransition>{children}</PageTransition>
    </AppShell>
  );
}
