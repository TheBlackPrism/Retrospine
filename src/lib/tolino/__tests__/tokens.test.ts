import { describe, expect, it } from "vitest";
import {
  buildRefreshBody,
  describeTokenFailure,
  isBlockedPage,
  needsRefresh,
  parseTokenResponse,
  tokenSetFromInput,
} from "../tokens";

const oauth = { tokenUrl: "https://shop.example/auth/oauth2/token", clientId: "webreader", scope: "SCOPE_BOSH" };

describe("buildRefreshBody", () => {
  it("sends the refresh grant the web reader sends", () => {
    const body = buildRefreshBody(oauth, "r-1");
    expect(body.get("client_id")).toBe("webreader");
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("r-1");
    expect(body.get("scope")).toBe("SCOPE_BOSH");
    expect(buildRefreshBody({ ...oauth, scope: "" }, "r-1").has("scope")).toBe(false);
  });
});

describe("parseTokenResponse", () => {
  it("reads a Keycloak style response", () => {
    expect(
      parseTokenResponse({
        access_token: "a",
        refresh_token: "r",
        expires_in: 3600,
        refresh_expires_in: "3600",
        "not-before-policy": 0,
      }),
    ).toEqual({ accessToken: "a", refreshToken: "r", expiresIn: 3600, refreshExpiresIn: 3600 });
  });

  it("falls back to an hour and tolerates missing refresh expiry", () => {
    expect(parseTokenResponse({ access_token: "a", refresh_token: "r" })).toEqual({
      accessToken: "a",
      refreshToken: "r",
      expiresIn: 3600,
      refreshExpiresIn: null,
    });
    expect(parseTokenResponse({ error: "invalid_grant" })).toBeNull();
    expect(parseTokenResponse("nope")).toBeNull();
  });

  it("turns lifetimes into dates", () => {
    const now = new Date(1_700_000_000_000);
    const set = tokenSetFromInput(
      { accessToken: "a", refreshToken: "r", expiresIn: 60, refreshExpiresIn: null },
      now,
    );
    expect(set.expiresAt.getTime()).toBe(now.getTime() + 60_000);
    expect(set.refreshExpiresAt).toBeNull();
  });
});

describe("describeTokenFailure", () => {
  it("recognises the bookshop's block page", () => {
    expect(isBlockedPage(403, "<html><title>Zugriff geblockt</title></html>")).toBe(true);
    expect(isBlockedPage(400, "Zugriff geblockt")).toBe(false);
    const failure = describeTokenFailure(403, null, "<title>Zugriff geblockt</title>", "shop.example");
    expect(failure.kind).toBe("blocked");
    expect(failure.message).toContain("this server");
    expect(describeTokenFailure(403, null, "Zugriff geblockt", "shop.example", "your browser").message).toContain(
      "your browser",
    );
  });

  it("recognises the Cloudflare block page the Thalia group shops serve", () => {
    // Captured from www.orellfuessli.ch/auth/oauth2/token (HTTP 403, server: cloudflare).
    const page =
      '<!DOCTYPE html>\n<html lang="de">\n<head>\n    <title>Zugriff geblockt</title>\n' +
      '    <meta name="robots" content="noindex, nofollow">\n' +
      '    <style>layout-fehlerseite *{border:none;box-sizing:border-box;margin:0;padding:0}</style>';
    expect(isBlockedPage(403, page)).toBe(true);
    expect(describeTokenFailure(403, null, page, "www.orellfuessli.ch").kind).toBe("blocked");
    // The same shop's real answer to a bad token is JSON, never a block.
    const json = { error: "invalid_grant", error_description: "Invalid refresh token: x" };
    expect(isBlockedPage(400, JSON.stringify(json))).toBe(false);
    expect(describeTokenFailure(400, json, JSON.stringify(json), "www.orellfuessli.ch").kind).toBe("auth");
  });

  it("treats invalid_grant as an expired token", () => {
    const failure = describeTokenFailure(400, { error: "invalid_grant" }, "{}", "shop.example");
    expect(failure.kind).toBe("auth");
    expect(describeTokenFailure(502, null, "bad gateway", "shop.example").kind).toBe("response");
  });

  it("surfaces the shop's reason and the requester on a rejected token", () => {
    const failure = describeTokenFailure(
      400,
      { error: "invalid_grant", error_description: "Token is not active" },
      "{}",
      "www.orellfuessli.ch",
      "your browser",
    );
    expect(failure.kind).toBe("auth");
    expect(failure.message).toContain("your browser");
    expect(failure.message).toContain("Token is not active");
  });

  it("does not disguise other OAuth errors as an expired token", () => {
    const invalidClient = describeTokenFailure(
      401,
      { error: "invalid_client", error_description: "Client not allowed" },
      "{}",
      "shop.example",
    );
    expect(invalidClient.kind).toBe("response");
    expect(invalidClient.message).toContain("invalid_client");
    expect(invalidClient.message).toContain("Client not allowed");

    const invalidScope = describeTokenFailure(400, { error: "invalid_scope" }, "{}", "shop.example");
    expect(invalidScope.kind).toBe("response");
    expect(invalidScope.message).toContain("invalid_scope");
  });
});

describe("needsRefresh", () => {
  const now = new Date(1_700_000_000_000);
  it("is due within the margin or when unknown", () => {
    expect(needsRefresh(null, 60_000, now)).toBe(true);
    expect(needsRefresh(new Date(now.getTime() + 30_000), 60_000, now)).toBe(true);
    expect(needsRefresh(new Date(now.getTime() + 120_000).toISOString(), 60_000, now)).toBe(false);
  });
});
