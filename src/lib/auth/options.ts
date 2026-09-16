import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import type { BetterAuthOptions } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, genericOAuth, username } from "better-auth/plugins";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { OIDC_PROVIDER_ID } from "./constants";

/** OIDC settings as loaded from the database and decrypted. */
export type OidcRuntimeConfig = {
  issuer: string;
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: string[];
  pkce: boolean;
  /** When false, an unknown SSO identity cannot create a new account. */
  allowSignup: boolean;
  label: string;
};

export type AuthDependencies = {
  countUsers: () => Promise<number>;
};

/**
 * Builds the Better Auth options. The instance is rebuilt whenever the OIDC
 * settings change, so everything dynamic is passed in rather than imported.
 */
export function buildAuthOptions(
  oidc: OidcRuntimeConfig | null,
  deps: AuthDependencies,
) {
  return {
    appName: "Retrospine",
    baseURL: env.baseUrl,
    secret: env.authSecret,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    account: {
      accountLinking: {
        enabled: true,
        // A user who explicitly links SSO from their settings may use a
        // different e-mail address at the identity provider.
        allowDifferentEmails: true,
        trustedProviders: [OIDC_PROVIDER_ID],
      },
    },
    telemetry: { enabled: false },
    plugins: [
      username({ minUsernameLength: 3, maxUsernameLength: 32 }),
      admin({ defaultRole: "user", adminRoles: ["admin"] }),
      genericOAuth({
        config: oidc
          ? [
              {
                providerId: OIDC_PROVIDER_ID,
                discoveryUrl: oidc.discoveryUrl,
                clientId: oidc.clientId,
                clientSecret: oidc.clientSecret,
                scopes: oidc.scopes,
                pkce: oidc.pkce,
                disableSignUp: !oidc.allowSignup,
                // Signing out of Retrospine should not log people out of
                // their identity provider as well.
                disableProviderLogout: true,
              },
            ]
          : [],
      }),
      // Must stay last so cookies set inside server actions are applied.
      nextCookies(),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Self-registration is only open for the very first account.
        if (ctx.path === "/sign-up/email" && (await deps.countUsers()) > 0) {
          throw new APIError("FORBIDDEN", {
            message:
              "Registration is closed. Ask an administrator to create an account for you.",
          });
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const isFirstUser = (await deps.countUsers()) === 0;
            const requestedRole = (user as { role?: string | null }).role;
            return {
              data: {
                ...user,
                role: isFirstUser ? "admin" : (requestedRole ?? "user"),
              },
            };
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
}
