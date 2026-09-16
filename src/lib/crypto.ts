import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { env } from "@/lib/env";

/**
 * Authenticated encryption for secrets stored in the database
 * (for example the OIDC client secret). The key is derived from
 * BETTER_AUTH_SECRET, so rotating that secret invalidates stored values.
 */

const VERSION = "v1";
const ALGORITHM = "aes-256-gcm";

function deriveKey(): Buffer {
  return Buffer.from(
    hkdfSync("sha256", env.authSecret, "retrospine", "settings-encryption", 32),
  );
}

export function encryptSecret(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const cipherText = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    cipherText.toString("base64url"),
    tag.toString("base64url"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const [version, iv, cipherText, tag] = payload.split(":");
  if (version !== VERSION || !iv || !cipherText || !tag) {
    throw new Error("Unrecognised encrypted payload");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    deriveKey(),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherText, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
