import { count, eq } from "drizzle-orm";
import type { OidcRuntimeConfig } from "@/lib/auth/options";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import type { AppSettings } from "@/lib/db/schema";

export async function countUsers(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(schema.user);
  return row?.value ?? 0;
}

/** Returns the singleton settings row, creating it on first access. */
export async function getAppSettings(): Promise<AppSettings> {
  const [existing] = await db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.id, 1));
  if (existing) return existing;
  await db.insert(schema.appSettings).values({ id: 1 }).onConflictDoNothing();
  const [created] = await db
    .select()
    .from(schema.appSettings)
    .where(eq(schema.appSettings.id, 1));
  return created;
}

export function toDiscoveryUrl(issuer: string): string {
  const trimmed = issuer.trim().replace(/\/+$/, "");
  return trimmed.endsWith("/.well-known/openid-configuration")
    ? trimmed
    : `${trimmed}/.well-known/openid-configuration`;
}

export function parseScopes(raw: string): string[] {
  const scopes = raw.split(/[\s,]+/).filter(Boolean);
  if (!scopes.includes("openid")) scopes.unshift("openid");
  return Array.from(new Set(scopes));
}

/** OIDC configuration ready to be handed to Better Auth, or null when disabled. */
export async function getOidcRuntimeConfig(): Promise<OidcRuntimeConfig | null> {
  const settings = await getAppSettings();
  if (
    !settings.oidcEnabled ||
    !settings.oidcIssuer ||
    !settings.oidcClientId ||
    !settings.oidcClientSecret
  ) {
    return null;
  }
  return {
    issuer: settings.oidcIssuer,
    discoveryUrl: toDiscoveryUrl(settings.oidcIssuer),
    clientId: settings.oidcClientId,
    clientSecret: decryptSecret(settings.oidcClientSecret),
    scopes: parseScopes(settings.oidcScopes),
    pkce: settings.oidcPkce,
    allowSignup: settings.oidcAllowSignup,
    label: settings.oidcLabel,
  };
}

/** What unauthenticated pages may know about SSO. */
export async function getPublicOidcInfo(): Promise<{ label: string } | null> {
  const config = await getOidcRuntimeConfig();
  return config ? { label: config.label } : null;
}

export type OidcSettingsInput = {
  enabled: boolean;
  label: string;
  issuer: string;
  clientId: string;
  /** Leave empty to keep the stored secret. */
  clientSecret: string;
  scopes: string;
  pkce: boolean;
  allowSignup: boolean;
};

export async function saveOidcSettings(
  input: OidcSettingsInput,
  updatedBy: string,
): Promise<AppSettings> {
  const current = await getAppSettings();
  const clientSecret = input.clientSecret.trim()
    ? encryptSecret(input.clientSecret.trim())
    : current.oidcClientSecret;
  const [updated] = await db
    .update(schema.appSettings)
    .set({
      oidcEnabled: input.enabled,
      oidcLabel: input.label.trim() || "Single sign-on",
      oidcIssuer: input.issuer.trim().replace(/\/+$/, "") || null,
      oidcClientId: input.clientId.trim() || null,
      oidcClientSecret: clientSecret,
      oidcScopes: parseScopes(input.scopes).join(" "),
      oidcPkce: input.pkce,
      oidcAllowSignup: input.allowSignup,
      updatedBy,
    })
    .where(eq(schema.appSettings.id, 1))
    .returning();
  return updated;
}
