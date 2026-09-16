import type { Metadata } from "next";
import Link from "next/link";
import { OidcForm } from "@/components/settings/oidc-form";
import { SettingsSection } from "@/components/settings/section";
import { OIDC_CALLBACK_PATH } from "@/lib/auth/constants";
import { requireAdmin } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { getAppSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Single sign-on" };

export default async function SsoSettingsPage() {
  await requireAdmin();
  const settings = await getAppSettings();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">
          ← Settings
        </Link>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          Single sign-on
        </h1>
      </div>
      <SettingsSection
        title="OpenID Connect"
        description="Works with Authentik, Keycloak, Zitadel, Auth0, Entra ID and any other OIDC provider. Register this app as a confidential web client first."
      >
        <OidcForm
          values={{
            enabled: settings.oidcEnabled,
            label: settings.oidcLabel,
            issuer: settings.oidcIssuer ?? "",
            clientId: settings.oidcClientId ?? "",
            scopes: settings.oidcScopes,
            pkce: settings.oidcPkce,
            allowSignup: settings.oidcAllowSignup,
            hasSecret: Boolean(settings.oidcClientSecret),
          }}
          redirectUri={`${env.baseUrl}${OIDC_CALLBACK_PATH}`}
        />
      </SettingsSection>
    </div>
  );
}
