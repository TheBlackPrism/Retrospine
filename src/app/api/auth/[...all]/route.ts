import { getAuth } from "@/lib/auth";

/**
 * Better Auth handler. The instance is resolved per request because the
 * OIDC provider can be reconfigured from the settings UI at runtime.
 */
async function handle(request: Request) {
  const auth = await getAuth();
  return auth.handler(request);
}

export { handle as GET, handle as POST };
