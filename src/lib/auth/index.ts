import { betterAuth } from "better-auth";
import { countUsers, getOidcRuntimeConfig } from "@/lib/settings";
import { buildAuthOptions } from "./options";

export type Auth = ReturnType<
  typeof betterAuth<ReturnType<typeof buildAuthOptions>>
>;

type CachedAuth = { key: string; auth: Auth };

const globalForAuth = globalThis as unknown as { __retrospineAuth?: CachedAuth };

/**
 * Returns the Better Auth instance for the current OIDC settings. The
 * instance is cached and only rebuilt when the settings change, which keeps
 * the "configure SSO from the UI" feature free of restarts.
 */
export async function getAuth(): Promise<Auth> {
  const oidc = await getOidcRuntimeConfig();
  const key = JSON.stringify(oidc);
  const cached = globalForAuth.__retrospineAuth;
  if (cached && cached.key === key) return cached.auth;
  const auth = betterAuth(buildAuthOptions(oidc, { countUsers }));
  globalForAuth.__retrospineAuth = { key, auth };
  return auth;
}

/** Drops the cached instance, e.g. after the OIDC settings were saved. */
export function invalidateAuth(): void {
  globalForAuth.__retrospineAuth = undefined;
}
