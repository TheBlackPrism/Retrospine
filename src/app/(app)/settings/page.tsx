import { ChevronRight, KeyRound, Users } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { PasswordForm } from "@/components/settings/password-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { SettingsSection } from "@/components/settings/section";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { SsoCard } from "@/components/settings/sso-card";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { TolinoCard } from "@/components/settings/tolino-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getAuth } from "@/lib/auth";
import { OIDC_PROVIDER_ID } from "@/lib/auth/constants";
import { isAdmin, requireSession } from "@/lib/auth/session";
import { languageFromAcceptHeader } from "@/lib/languages";
import { getPublicOidcInfo } from "@/lib/settings";
import { getTolinoConnection, toConnectionView } from "@/lib/tolino/connection";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage(props: PageProps<"/settings">) {
  const session = await requireSession();
  const auth = await getAuth();
  const requestHeaders = await headers();
  const [accounts, sso, params, tolino] = await Promise.all([
    auth.api.listUserAccounts({ headers: requestHeaders }),
    getPublicOidcInfo(),
    props.searchParams,
    getTolinoConnection(session.user.id),
  ]);
  const linked = accounts.some((account) => account.providerId === OIDC_PROVIDER_ID);
  const hasPassword = accounts.some((account) => account.providerId === "credential");
  const admin = isAdmin(session);
  const error = typeof params.error === "string" ? params.error : null;
  const justLinked = params.linked === "1";

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
        Settings
      </h1>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            Connecting single sign-on failed ({error.replace(/_/g, " ")}).
          </AlertDescription>
        </Alert>
      ) : null}
      {justLinked && linked ? (
        <Alert>
          <AlertDescription>Single sign-on is now connected to your account.</AlertDescription>
        </Alert>
      ) : null}

      <SettingsSection title="Profile" description="How you appear in Retrospine.">
        <ProfileForm
          name={session.user.name}
          username={session.user.username ?? null}
          email={session.user.email}
          preferredLanguage={session.user.preferredLanguage ?? null}
          browserLanguage={languageFromAcceptHeader(requestHeaders.get("accept-language"))}
        />
      </SettingsSection>

      <SettingsSection title="Appearance" description="Daylight paper or a warm reading lamp.">
        <ThemeToggle />
      </SettingsSection>

      <SettingsSection
        title="Tolino Cloud"
        description="Sync the books and reading progress from your tolino."
      >
        <TolinoCard connection={tolino ? toConnectionView(tolino) : null} />
      </SettingsSection>

      <SettingsSection
        title="Sign-in methods"
        description="Use a password, single sign-on, or both."
      >
        <div className="space-y-6">
          <SsoCard configured={Boolean(sso)} label={sso?.label ?? null} linked={linked} isAdmin={admin} />
          {hasPassword ? (
            <PasswordForm />
          ) : (
            <p className="text-sm text-muted-foreground">
              This account signs in with single sign-on only.
            </p>
          )}
        </div>
      </SettingsSection>

      {admin ? (
        <SettingsSection title="Administration" description="Only administrators see this.">
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70 bg-background/60">
            <li>
              <Link href="/settings/users" className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/60">
                <Users className="size-5 text-muted-foreground" />
                <span className="flex-1">
                  <span className="block text-sm font-medium">Readers</span>
                  <span className="block text-xs text-muted-foreground">Invite people and manage roles</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
            <li>
              <Link href="/settings/sso" className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/60">
                <KeyRound className="size-5 text-muted-foreground" />
                <span className="flex-1">
                  <span className="block text-sm font-medium">Single sign-on</span>
                  <span className="block text-xs text-muted-foreground">Connect an OpenID Connect provider</span>
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </li>
          </ul>
        </SettingsSection>
      ) : null}

      <div className="flex justify-end pb-4">
        <SignOutButton />
      </div>
    </div>
  );
}
