/** Provider id used for the single, UI-configured OIDC provider. */
export const OIDC_PROVIDER_ID = "oidc";

/**
 * Path (relative to the public base URL) the identity provider must be
 * allowed to redirect back to. Better Auth serves generic OAuth providers
 * through its core callback route.
 */
export const OIDC_CALLBACK_PATH = `/api/auth/callback/${OIDC_PROVIDER_ID}`;
