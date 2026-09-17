import {
  collectPatches,
  parseInventory,
  parseReadingState,
  type TolinoPublication,
  type TolinoReadingState,
} from "./parse";
import { findReseller } from "./resellers";
import {
  buildRefreshBody,
  describeTokenFailure,
  isBlockedPage,
  parseTokenResponse,
  tokenSetFromInput,
  type TokenSet,
  type TolinoOAuth,
} from "./tokens";

export type { TokenSet, TolinoOAuth } from "./tokens";

/**
 * HTTP client for the Tolino Cloud, the shared e-book service behind the
 * tolino readers. There is no public API; the requests mirror what the
 * official web reader (https://webreader.mytolino.com) sends.
 *
 * Two generations of endpoints exist. The current web reader talks to
 * `api.pageplace.de` (paged inventory, reading metadata); the older
 * `bosh.pageplace.de` endpoints still answer and are used as a fallback.
 */

/** The hosts can be overridden for tests (`TOLINO_BOSH_BASE`, `TOLINO_API_BASE`). */
export const BOSH_BASE =
  process.env.TOLINO_BOSH_BASE?.replace(/\/+$/, "") || "https://bosh.pageplace.de/bosh/rest";
export const API_BASE =
  process.env.TOLINO_API_BASE?.replace(/\/+$/, "") || "https://api.pageplace.de";
export const CLIENT_TYPE = "TOLINO_WEBREADER";
export const CLIENT_VERSION = "5.15.2";

/**
 * The bookshops' OAuth endpoints sit behind a bot filter that answers
 * "Zugriff geblockt" to generic HTTP clients. Requests identifying as a
 * tolino reading device are let through, which is how the readers refresh
 * their tokens; the Tolino API itself does not filter.
 */
const TOKEN_USER_AGENT = "Dalvik/1.6.0 (Linux; U; Android 4.4.2; tolino Build/KOT49H)";
const TIMEOUT_MS = 25_000;
const INVENTORY_PAGE_SIZE = 100;
const MAX_INVENTORY_PAGES = 60;
const RESELLER_CACHE_MS = 6 * 60 * 60 * 1000;
const PROBE_CACHE_MS = 10 * 60 * 1000;

/**
 * `blocked` means the bookshop's bot protection refused the request before it
 * reached the OAuth endpoint; the token itself was never checked.
 */
export type TolinoErrorKind = "auth" | "blocked" | "device_limit" | "network" | "response";

export class TolinoError extends Error {
  constructor(
    message: string,
    public readonly kind: TolinoErrorKind,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "TolinoError";
  }
}

export type ResellerInfo = TolinoOAuth & {
  resellerId: number;
  name: string;
  apiBase: string;
  boshBase: string;
};

export type TolinoSession = {
  resellerId: number;
  hardwareId: string;
  accessToken: string;
  apiBase?: string;
  boshBase?: string;
};

export type TolinoDevice = {
  id: string;
  name: string;
  type: string;
  resellerId: number | null;
  lastUsedAt: Date | null;
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function tryParseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ? `${error.message} (${cause.code})` : error.message;
  }
  return String(error);
}

function stripSlash(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed || null;
}

/** Error message the Tolino services put into their JSON bodies, if any. */
function serviceMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const body = json as {
    ResponseInfo?: { message?: string };
    errors?: { message?: string }[];
    message?: string;
    error_description?: string;
    error?: string;
  };
  return (
    body.ResponseInfo?.message ??
    body.errors?.[0]?.message ??
    body.error_description ??
    body.message ??
    body.error ??
    null
  );
}

type ServiceResponse = { status: number; json: unknown; text: string };

async function call(url: string | URL, init: RequestInit): Promise<ServiceResponse> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new TolinoError(
      `Could not reach ${new URL(url).host}: ${describe(error)}`,
      "network",
    );
  }
  const text = await response.text();
  const json = tryParseJson(text);
  if (response.ok) return { status: response.status, json, text };

  const detail = serviceMessage(json);
  if (response.status === 401 || response.status === 403) {
    throw new TolinoError(
      detail
        ? `The Tolino Cloud rejected the request: ${detail}`
        : "The Tolino Cloud rejected the access token.",
      "auth",
      response.status,
    );
  }
  if (response.status === 406) {
    throw new TolinoError(
      "The Tolino account has reached its device limit. Remove a device in the web reader and try again.",
      "device_limit",
      406,
    );
  }
  throw new TolinoError(
    `${new URL(url).pathname} answered ${response.status}${detail ? `: ${detail}` : ""}`,
    "response",
    response.status,
  );
}

function boshHeaders(session: TolinoSession): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    t_auth_token: session.accessToken,
    hardware_id: session.hardwareId,
    reseller_id: String(session.resellerId),
    client_type: CLIENT_TYPE,
    client_version: CLIENT_VERSION,
  };
}

function apiHeaders(session: TolinoSession): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.accessToken}`,
    "hardware-id": session.hardwareId,
    "device-id": session.hardwareId,
    "reseller-id": String(session.resellerId),
    "client-type": CLIENT_TYPE,
    client_type: CLIENT_TYPE,
    "client-version": CLIENT_VERSION,
  };
}

function apiBase(session: TolinoSession): string {
  return session.apiBase ?? API_BASE;
}

function boshBase(session: TolinoSession): string {
  return session.boshBase ?? BOSH_BASE;
}

/* -------------------------------------------------------------------------- */
/*  Reseller configuration                                                     */
/* -------------------------------------------------------------------------- */

const resellerCache = new Map<number, { at: number; info: ResellerInfo }>();

async function fetchResellerConfig(resellerId: number): Promise<ResellerInfo | null> {
  const { json } = await call(`${BOSH_BASE}/v2/resellerconfig`, {
    headers: {
      Accept: "application/json",
      reseller_id: String(resellerId),
      client_type: CLIENT_TYPE,
      client_version: CLIENT_VERSION,
      hardware_type: "HTML5",
      hardware_id: "retrospine",
    },
  });
  const config = (json as { config?: Record<string, string | undefined> } | null)?.config;
  if (!config?.URL_OAUTH_ACCESSTOKEN || !config.OAUTH_CLIENT_ID) return null;
  const known = findReseller(resellerId);
  return {
    resellerId,
    name:
      config.STRING_BRAND_DISPLAY_NAME?.trim() ||
      config.STRING_BRAND_NAME?.trim() ||
      known?.name ||
      `Bookshop ${resellerId}`,
    tokenUrl: config.URL_OAUTH_ACCESSTOKEN,
    clientId: config.OAUTH_CLIENT_ID,
    scope: config.OAUTH_SCOPE && config.OAUTH_SCOPE !== "null" ? config.OAUTH_SCOPE : "",
    apiBase: process.env.TOLINO_API_BASE ? API_BASE : (stripSlash(config.URL_API) ?? API_BASE),
    boshBase: process.env.TOLINO_BOSH_BASE
      ? BOSH_BASE
      : (stripSlash(config.URL_BOOKSHELF) ?? BOSH_BASE),
  };
}

/**
 * OAuth endpoints and hosts of a bookshop, as published by the Tolino
 * reseller configuration service, with the built-in table as fallback.
 */
export async function getResellerInfo(resellerId: number): Promise<ResellerInfo> {
  const cached = resellerCache.get(resellerId);
  if (cached && Date.now() - cached.at < RESELLER_CACHE_MS) return cached.info;

  let info: ResellerInfo | null = null;
  try {
    info = await fetchResellerConfig(resellerId);
  } catch (error) {
    console.warn(`[tolino] reseller configuration for ${resellerId} unavailable`, error);
  }
  if (!info) {
    const known = findReseller(resellerId);
    if (!known) {
      throw new TolinoError(`Unknown bookshop id ${resellerId}.`, "response");
    }
    info = {
      resellerId,
      name: known.name,
      tokenUrl: known.tokenUrl,
      clientId: known.clientId,
      scope: known.scope,
      apiBase: API_BASE,
      boshBase: BOSH_BASE,
    };
  }
  resellerCache.set(resellerId, { at: Date.now(), info });
  return info;
}

/* -------------------------------------------------------------------------- */
/*  OAuth tokens                                                               */
/* -------------------------------------------------------------------------- */

async function postTokenEndpoint(
  oauth: TolinoOAuth,
  body: URLSearchParams,
): Promise<ServiceResponse> {
  let response: Response;
  try {
    response = await fetch(oauth.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": TOKEN_USER_AGENT,
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new TolinoError(
      `Could not reach ${new URL(oauth.tokenUrl).host}: ${describe(error)}`,
      "network",
    );
  }
  const text = await response.text();
  return { status: response.status, json: tryParseJson(text), text };
}

/**
 * Exchanges a refresh token for a new access token. Refresh tokens rotate:
 * the returned refresh token replaces the one that was sent.
 */
export async function refreshTokens(oauth: TolinoOAuth, refreshToken: string): Promise<TokenSet> {
  const { status, json, text } = await postTokenEndpoint(oauth, buildRefreshBody(oauth, refreshToken));
  if (status < 200 || status >= 300) {
    const failure = describeTokenFailure(status, json, text, new URL(oauth.tokenUrl).host);
    throw new TolinoError(failure.message, failure.kind, status);
  }
  const parsed = parseTokenResponse(json);
  if (!parsed) {
    throw new TolinoError("The token endpoint returned no tokens.", "response", status);
  }
  return tokenSetFromInput(parsed);
}

export type TokenEndpointReachability = "reachable" | "blocked" | "unknown";

const probeCache = new Map<string, { at: number; result: TokenEndpointReachability }>();

/**
 * Finds out whether this server may talk to the bookshop's token endpoint at
 * all. A deliberately invalid refresh token is sent: a JSON `invalid_grant`
 * answer proves the endpoint is reachable, the HTML block page proves it is
 * not. Nothing about a real account is touched.
 */
export async function probeTokenEndpoint(oauth: TolinoOAuth): Promise<TokenEndpointReachability> {
  const cached = probeCache.get(oauth.tokenUrl);
  if (cached && Date.now() - cached.at < PROBE_CACHE_MS) return cached.result;
  let result: TokenEndpointReachability = "unknown";
  try {
    const { status, json, text } = await postTokenEndpoint(
      oauth,
      buildRefreshBody(oauth, "retrospine-reachability-probe"),
    );
    if (isBlockedPage(status, text)) result = "blocked";
    else if (json && typeof json === "object" && (status === 400 || status === 401)) {
      result = "reachable";
    }
  } catch (error) {
    console.warn("[tolino] token endpoint probe failed", error);
  }
  probeCache.set(oauth.tokenUrl, { at: Date.now(), result });
  return result;
}

/* -------------------------------------------------------------------------- */
/*  Devices                                                                    */
/* -------------------------------------------------------------------------- */

type RawDevice = {
  deviceId?: string;
  deviceName?: string;
  deviceType?: string;
  resellerId?: string | number;
  deviceLastUsage?: string | number;
};

/** Devices registered with the account, newest use first. */
export async function listDevices(
  session: Omit<TolinoSession, "hardwareId">,
): Promise<TolinoDevice[]> {
  const { json } = await call(`${boshBase({ ...session, hardwareId: "" })}/handshake/devices/list`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      t_auth_token: session.accessToken,
      reseller_id: String(session.resellerId),
    },
    body: JSON.stringify({
      deviceListRequest: {
        accounts: [{ auth_token: session.accessToken, reseller_id: session.resellerId }],
      },
    }),
  });
  const devices = (json as { deviceListResponse?: { devices?: RawDevice[] } } | null)
    ?.deviceListResponse?.devices;
  if (!Array.isArray(devices)) return [];
  return devices
    .filter((device): device is RawDevice & { deviceId: string } => Boolean(device?.deviceId))
    .map((device) => {
      const lastUsed = Number(device.deviceLastUsage);
      return {
        id: device.deviceId,
        name: device.deviceName?.trim() || device.deviceType || "Device",
        type: device.deviceType ?? "",
        resellerId: Number.isFinite(Number(device.resellerId)) ? Number(device.resellerId) : null,
        lastUsedAt: Number.isFinite(lastUsed) && lastUsed > 0 ? new Date(lastUsed) : null,
      };
    })
    .sort((a, b) => (b.lastUsedAt?.getTime() ?? 0) - (a.lastUsedAt?.getTime() ?? 0));
}

/** The browser (web reader) the tokens were taken from, else the most recent device. */
export function pickWebReaderDevice(devices: TolinoDevice[]): TolinoDevice | null {
  const browser = devices.find(
    (device) => /html5|web/i.test(device.type) || /webreader|web reader|browser/i.test(device.name),
  );
  return browser ?? devices[0] ?? null;
}

/** Ids in the format the web reader generates for browsers. */
export function generateHardwareId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const random = (length: number) =>
    Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `3xx${random(1)}-00${random(3)}-${random(5)}-${random(5)}-${random(4)}h`;
}

/** Registers `session.hardwareId` as a new device ("Retrospine") on the account. */
export async function registerDevice(session: TolinoSession, name = "Retrospine"): Promise<void> {
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    t_auth_token: session.accessToken,
    hardware_id: session.hardwareId,
    reseller_id: String(session.resellerId),
    client_type: CLIENT_TYPE,
    client_version: CLIENT_VERSION,
  };
  const body = JSON.stringify({ hardware_name: name });
  try {
    await call(`${apiBase(session)}/v1/devices`, {
      method: "POST",
      headers: { ...headers, hardware_type: CLIENT_TYPE },
      body,
    });
    return;
  } catch (error) {
    if (error instanceof TolinoError && error.kind !== "response") throw error;
    console.warn("[tolino] device registration via api failed, trying bosh", error);
  }
  await call(`${boshBase(session)}/v2/registerhw`, {
    method: "POST",
    headers: { ...headers, hardware_type: "HTML5" },
    body,
  });
}

/* -------------------------------------------------------------------------- */
/*  Inventory                                                                  */
/* -------------------------------------------------------------------------- */

async function fetchInventoryPaged(session: TolinoSession): Promise<TolinoPublication[]> {
  const byId = new Map<string, TolinoPublication>();
  let page = 0;
  for (let i = 0; i < MAX_INVENTORY_PAGES; i++) {
    const url = new URL(`${apiBase(session)}/v8/inventory`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("size", String(INVENTORY_PAGE_SIZE));
    url.searchParams.set("sort", "RECENT,DESC");
    for (const type of ["SKOOBE", "KOBODRM", "PREVIEW"]) {
      url.searchParams.append("extendedDataType", type);
    }
    url.searchParams.set("fullResponse", "true");
    const { json } = await call(url, { headers: apiHeaders(session) });
    for (const publication of parseInventory(json)) {
      if (!byId.has(publication.publicationId)) byId.set(publication.publicationId, publication);
    }
    const info = (json as { page?: { number?: number; totalPages?: number } } | null)?.page;
    if (
      !info ||
      typeof info.number !== "number" ||
      typeof info.totalPages !== "number" ||
      info.number + 1 >= info.totalPages
    ) {
      break;
    }
    page = info.number + 1;
  }
  return Array.from(byId.values());
}

async function fetchInventoryLegacy(session: TolinoSession): Promise<TolinoPublication[]> {
  const { json } = await call(`${boshBase(session)}/inventory/delta?strip=true`, {
    headers: boshHeaders(session),
  });
  return parseInventory(json);
}

/** All publications (purchases, uploads, audiobooks) in the account's library. */
export async function fetchInventory(session: TolinoSession): Promise<TolinoPublication[]> {
  try {
    return await fetchInventoryPaged(session);
  } catch (error) {
    if (error instanceof TolinoError && error.kind !== "response") throw error;
    console.warn("[tolino] paged inventory failed, falling back to bosh", error);
  }
  return fetchInventoryLegacy(session);
}

/* -------------------------------------------------------------------------- */
/*  Reading state                                                              */
/* -------------------------------------------------------------------------- */

async function fetchSyncDataCurrent(session: TolinoSession): Promise<unknown> {
  const { json } = await call(
    `${apiBase(session)}/v4/reading-metadata?paths=publications,audiobooks`,
    {
      method: "PATCH",
      headers: apiHeaders(session),
      body: JSON.stringify({ revision: "", patches: [] }),
    },
  );
  return json;
}

async function fetchSyncDataLegacy(session: TolinoSession): Promise<unknown> {
  const { json } = await call(`${boshBase(session)}/sync-data?paths=publications,audiobooks`, {
    method: "PATCH",
    headers: boshHeaders(session),
    body: JSON.stringify({ revision: null, patches: [] }),
  });
  return json;
}

/**
 * Reading positions and "finished" marks for every publication. Sending an
 * empty revision asks for the complete state instead of a delta.
 */
export async function fetchReadingState(
  session: TolinoSession,
): Promise<Map<string, TolinoReadingState>> {
  let json: unknown;
  try {
    json = await fetchSyncDataCurrent(session);
  } catch (error) {
    if (error instanceof TolinoError && error.kind !== "response") throw error;
    console.warn("[tolino] reading metadata failed, falling back to bosh sync-data", error);
    json = await fetchSyncDataLegacy(session);
  }
  return parseReadingState(collectPatches(json));
}
