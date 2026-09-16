/** Extracts a human readable message from Better Auth or generic errors. */
export function errorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (error && typeof error === "object") {
    const candidate = error as { body?: { message?: string }; message?: string };
    if (candidate.body?.message) return candidate.body.message;
    if (typeof candidate.message === "string" && candidate.message) {
      return candidate.message;
    }
  }
  return fallback;
}
