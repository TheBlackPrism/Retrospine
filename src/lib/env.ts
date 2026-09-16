/**
 * Small, lazy accessors for environment configuration.
 * Values are read at call time (not import time) so that `next build`
 * can evaluate modules without a configured environment.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get databaseUrl(): string {
    return required("DATABASE_URL");
  },
  get authSecret(): string {
    return required("BETTER_AUTH_SECRET");
  },
  /** Public base URL of the deployment, without a trailing slash. */
  get baseUrl(): string {
    const raw =
      process.env.BETTER_AUTH_URL ??
      process.env.APP_URL ??
      "http://localhost:3000";
    return raw.replace(/\/+$/, "");
  },
  get googleBooksApiKey(): string | undefined {
    return process.env.GOOGLE_BOOKS_API_KEY || undefined;
  },
  /**
   * ISO 3166-1 country code sent with Google Books requests. Google answers
   * 503 "Service temporarily unavailable" for IP ranges it cannot geolocate
   * (typical for cloud servers and VPNs); an explicit country avoids that.
   */
  get googleBooksCountry(): string {
    return process.env.GOOGLE_BOOKS_COUNTRY?.trim().toUpperCase() || "US";
  },
  get autoMigrate(): boolean {
    return (process.env.AUTO_MIGRATE ?? "true").toLowerCase() !== "false";
  },
  /**
   * Minutes between automatic Tolino Cloud syncs (default 60). `0`, `false`
   * or `off` disables the scheduler; the "Sync now" button keeps working.
   */
  get tolinoSyncIntervalMinutes(): number {
    const raw = (process.env.TOLINO_SYNC_INTERVAL ?? "60").trim().toLowerCase();
    if (raw === "" || raw === "false" || raw === "off") return 0;
    const minutes = Number(raw);
    return Number.isFinite(minutes) && minutes > 0 ? Math.max(5, minutes) : 0;
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
};
