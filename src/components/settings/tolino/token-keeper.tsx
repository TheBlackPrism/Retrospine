"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  getTolinoTokenStateAction,
  reportTolinoTokenFailureAction,
  storeTolinoTokensAction,
} from "@/lib/actions/tolino";
import { refreshTokensInBrowser } from "@/lib/tolino/browser";
import { needsRefresh } from "@/lib/tolino/tokens";

/** How often an open tab looks at the token state. */
const CHECK_MS = 5 * 60 * 1000;
/** Renew the access token this long before it expires. */
const REFRESH_MARGIN_MS = 15 * 60 * 1000;
const LOCK_NAME = "retrospine-tolino-token-refresh";

/** Runs `fn` in at most one tab of this browser at a time. */
async function exclusively(fn: () => Promise<void>): Promise<void> {
  if (typeof navigator !== "undefined" && "locks" in navigator) {
    await navigator.locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (lock) await fn();
    });
    return;
  }
  await fn();
}

/**
 * Keeps a Tolino connection alive from the browser when the bookshop blocks
 * the server: while Retrospine is open, the access token is renewed before it
 * expires and the rotated refresh token is handed back to the server. Renders
 * nothing.
 */
export function TolinoTokenKeeper() {
  const router = useRouter();

  useEffect(() => {
    let disposed = false;
    // Per effect instance, so a development double-mount cannot wedge it.
    let busy = false;

    async function check() {
      if (busy || disposed) return;
      busy = true;
      try {
        const state = await getTolinoTokenStateAction();
        if (disposed || !state || state.refreshMode !== "browser" || !state.refreshToken) return;
        if (!needsRefresh(state.accessTokenExpiresAt, REFRESH_MARGIN_MS)) return;
        if (state.refreshTokenExpiresAt && new Date(state.refreshTokenExpiresAt) <= new Date()) {
          return; // Expired for good; the settings page offers to connect again.
        }
        await exclusively(async () => {
          // Another tab may have renewed the tokens while we waited for the lock.
          const fresh = await getTolinoTokenStateAction();
          if (!fresh?.refreshToken || !needsRefresh(fresh.accessTokenExpiresAt, REFRESH_MARGIN_MS)) return;
          const result = await refreshTokensInBrowser(fresh.oauth, fresh.refreshToken);
          if (result.ok) {
            const stored = await storeTolinoTokensAction(result.tokens);
            if (stored.ok && stored.data?.syncStarted) router.refresh();
            return;
          }
          if (result.failure.kind === "auth") {
            // Only report when nobody else renewed the tokens in the meantime.
            const latest = await getTolinoTokenStateAction();
            if (latest && latest.tokenRefreshedAt === fresh.tokenRefreshedAt) {
              await reportTolinoTokenFailureAction(result.failure.message);
              router.refresh();
            }
            return;
          }
          console.warn("[tolino] token renewal in the browser failed:", result.failure.message);
        });
      } catch (error) {
        if (!disposed) console.warn("[tolino] token keeper", error);
      } finally {
        busy = false;
      }
    }

    void check();
    const timer = setInterval(() => void check(), CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
