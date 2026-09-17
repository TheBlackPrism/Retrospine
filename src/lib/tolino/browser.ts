/**
 * Token renewal performed by the reader's browser. Used when the bookshop's
 * bot protection blocks the server: browsers are let through, and the token
 * endpoint allows cross-origin requests.
 *
 * Client-safe: no database or Node-only imports.
 */
import {
  buildRefreshBody,
  describeTokenFailure,
  parseTokenResponse,
  type TokenFailure,
  type TokenSetInput,
  type TolinoOAuth,
} from "./tokens";

export type BrowserRefreshResult =
  | { ok: true; tokens: TokenSetInput }
  | { ok: false; failure: TokenFailure };

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Exchanges a refresh token from the browser; the response replaces the token that was sent. */
export async function refreshTokensInBrowser(
  oauth: TolinoOAuth,
  refreshToken: string,
): Promise<BrowserRefreshResult> {
  const host = hostOf(oauth.tokenUrl);
  let response: Response;
  try {
    // A URLSearchParams body is a "simple" cross-origin request: no preflight.
    response = await fetch(oauth.tokenUrl, {
      method: "POST",
      body: buildRefreshBody(oauth, refreshToken),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      failure: {
        kind: "network",
        message: `Your browser could not reach ${host} (${reason}). A content blocker or privacy extension may be stopping the request.`,
      },
    };
  }
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    return { ok: false, failure: describeTokenFailure(response.status, json, text, host, "your browser") };
  }
  const tokens = parseTokenResponse(json);
  if (!tokens) {
    return { ok: false, failure: { kind: "response", message: `${host} returned no tokens.` } };
  }
  return { ok: true, tokens };
}
