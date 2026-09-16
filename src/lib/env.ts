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
  get autoMigrate(): boolean {
    return (process.env.AUTO_MIGRATE ?? "true").toLowerCase() !== "false";
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === "production";
  },
};
