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

  it("treats invalid_grant as an expired token", () => {
    const failure = describeTokenFailure(400, { error: "invalid_grant" }, "{}", "shop.example");
    expect(failure.kind).toBe("auth");
    expect(describeTokenFailure(502, null, "bad gateway", "shop.example").kind).toBe("response");
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
