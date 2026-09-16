import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./index";

/** Reads the current session once per request. */
export const getSession = cache(async () => {
  // Read the request headers before anything touches the database. During
  // `next build` this makes prerendering bail out to dynamic rendering
  // immediately, so the build never needs a reachable database.
  const requestHeaders = await headers();
  const auth = await getAuth();
  return auth.api.getSession({ headers: requestHeaders });
});

export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export function isAdmin(session: Session | null | undefined): boolean {
  return session?.user.role === "admin";
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (!isAdmin(session)) redirect("/library");
  return session;
}
