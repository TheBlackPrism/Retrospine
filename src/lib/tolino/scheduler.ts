import { and, gt, isNotNull, lt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { env } from "@/lib/env";
import { getTolinoSession, listConnectionsDueForSync } from "./connection";
import { runTolinoSync } from "./sync";

/**
 * Background scheduler started once per server process. Every few minutes it
 * syncs the connections whose interval has elapsed and refreshes tokens that
 * are about to expire, so a connection stays alive even when nobody presses
 * "Sync now" for a while.
 */

const TICK_MS = 5 * 60 * 1000;
const FIRST_TICK_MS = 45 * 1000;
/** Refresh tokens that expire within this window even if no sync is due. */
const TOKEN_KEEPALIVE_MS = 3 * 60 * 60 * 1000;

type Timer = ReturnType<typeof setInterval>;
const globalForScheduler = globalThis as unknown as {
  __retrospineTolinoTimer?: Timer;
  __retrospineTolinoTicking?: boolean;
};

async function keepTokensAlive(): Promise<void> {
  const now = new Date();
  const soon = new Date(now.getTime() + TOKEN_KEEPALIVE_MS);
  // Tokens that already expired cannot be refreshed; the next sync reports that.
  const expiring = await db.query.tolinoConnections.findMany({
    where: and(
      isNotNull(schema.tolinoConnections.refreshTokenExpiresAt),
      lt(schema.tolinoConnections.refreshTokenExpiresAt, soon),
      gt(schema.tolinoConnections.refreshTokenExpiresAt, now),
    ),
  });
  for (const connection of expiring) {
    try {
      await getTolinoSession({ ...connection, accessToken: null, accessTokenExpiresAt: null });
    } catch (error) {
      console.warn(`[tolino] token refresh for user ${connection.userId} failed`, error);
    }
  }
}

/** One scheduler pass; exported so it can be driven from a test script. */
export async function runSchedulerTick(intervalMs: number): Promise<void> {
  return tick(intervalMs);
}

async function tick(intervalMs: number): Promise<void> {
  if (globalForScheduler.__retrospineTolinoTicking) return;
  globalForScheduler.__retrospineTolinoTicking = true;
  try {
    const due = await listConnectionsDueForSync(intervalMs);
    for (const connection of due) {
      await runTolinoSync(connection.userId, "scheduled");
    }
    await keepTokensAlive();
  } catch (error) {
    console.error("[tolino] scheduler tick failed", error);
  } finally {
    globalForScheduler.__retrospineTolinoTicking = false;
  }
}

export function startTolinoScheduler(): void {
  const minutes = env.tolinoSyncIntervalMinutes;
  if (!minutes) {
    console.log("[tolino] automatic sync is disabled (TOLINO_SYNC_INTERVAL)");
    return;
  }
  if (globalForScheduler.__retrospineTolinoTimer) return;
  const intervalMs = minutes * 60 * 1000;
  const timer = setInterval(() => void tick(intervalMs), TICK_MS);
  timer.unref?.();
  globalForScheduler.__retrospineTolinoTimer = timer;
  const first = setTimeout(() => void tick(intervalMs), FIRST_TICK_MS);
  first.unref?.();
  console.log(`[tolino] automatic sync every ${minutes} minutes`);
}
