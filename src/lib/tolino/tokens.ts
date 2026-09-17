/**
 * OAuth token helpers shared by the server client and the browser.
 * Pure: no database, no network, safe to import from client components.
 */

export type TolinoOAuth = {
  tokenUrl: string;
  clientId: string;
  scope: string;
};

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date | null;
};

/** Serialisable form of a token set, as sent from the browser to the server. */
export type TokenSetInput = {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  /** Seconds until the refresh token expires, or null when unknown. */
  refreshExpiresIn: number | null;
};

export type TokenFailure = {
  kind: "auth" | "blocked" | "network" | "response";
  message: string;
};

/** `code` of a failed connect action whose server-side token exchange the bookshop blocked. */
export const TOKEN_EXCHANGE_BLOCKED = "blocked";

/** Form body of a refresh-token grant, exactly as the tolino web reader sends it. */
export function buildRefreshBody(oauth: TolinoOAuth, refreshToken: string): URLSearchParams {
  const body = new URLSearchParams({
    client_id: oauth.clientId,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (oauth.scope) body.set("scope", oauth.scope);
  return body;
}

type RawTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  refresh_expires_in?: unknown;
  error?: unknown;
  error_description?: unknown;
};

function seconds(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Reads a token response body; null when it carries no tokens. */
export function parseTokenResponse(json: unknown): TokenSetInput | null {
  if (!json || typeof json !== "object") return null;
  const raw = json as RawTokenResponse;
  if (typeof raw.access_token !== "string" || typeof raw.refresh_token !== "string") return null;
  return {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresIn: seconds(raw.expires_in) ?? 3600,
    refreshExpiresIn: seconds(raw.refresh_expires_in),
  };
}

export function tokenSetFromInput(input: TokenSetInput, now: Date = new Date()): TokenSet {
  return {
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
    expiresAt: new Date(now.getTime() + input.expiresIn * 1000),
    refreshExpiresAt:
      input.refreshExpiresIn !== null
        ? new Date(now.getTime() + input.refreshExpiresIn * 1000)
        : null,
  };
}

/** The bookshops answer bot-filtered requests with an HTML "Zugriff geblockt" page. */
export function isBlockedPage(status: number, text: string): boolean {
  return status === 403 && /geblockt|blocked|access denied|attention required/i.test(text);
}

/** Turns a failed token response into a message for the reader. */
export function describeTokenFailure(
  status: number,
  json: unknown,
  text: string,
  host: string,
  requester = "this server",
): TokenFailure {
  const raw = (json && typeof json === "object" ? json : {}) as RawTokenResponse;
  if (isBlockedPage(status, text)) {
    return { kind: "blocked", message: `${host} blocked the token request from ${requester}.` };
  }
  if (raw.error === "invalid_grant" || status === 400 || status === 401) {
    return {
      kind: "auth",
      message:
        "The bookshop rejected the refresh token. It has probably expired or was already used: sign in to the web reader again and connect with a fresh token.",
    };
  }
  const detail = typeof raw.error_description === "string" ? `: ${raw.error_description}` : "";
  return { kind: "response", message: `The token endpoint answered ${status}${detail}` };
}

/** Whether a token that expires at `expiresAt` should be renewed now. */
export function needsRefresh(
  expiresAt: Date | string | null,
  marginMs: number,
  now: Date = new Date(),
): boolean {
  if (!expiresAt) return true;
  const at = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  return at.getTime() - marginMs <= now.getTime();
}
