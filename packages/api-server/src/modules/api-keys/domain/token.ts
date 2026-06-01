import { createHash, randomBytes } from "node:crypto";
import { API_KEY_PREFIX } from "api-server-api";

const RANDOM_BYTES = 32;

export function mintApiKeyToken(): { token: string; hash: string } {
  // base64url chosen over base32: stdlib-supported (no hand-rolled encoder
  // and its trailing-bits edge case), shorter (43 chars vs 52 for 32B of
  // entropy), and is the standard high-entropy bearer-token shape used by
  // most provider APIs. Case-sensitivity is fine here — modern shells,
  // clipboards, and screenshot OCR all preserve case for bearer tokens.
  const token =
    API_KEY_PREFIX + randomBytes(RANDOM_BYTES).toString("base64url");
  return { token, hash: hashApiKeyToken(token) };
}

/**
 * Server-side digest of an API key token. The token is 256 bits of
 * cryptographic randomness (32 random bytes, base64url-encoded), not a
 * user-chosen password — SHA-256 over a high-entropy random string is
 * brute-force-infeasible. See ADR-056 § Alternatives Considered for
 * why argon2id / bcrypt / scrypt would solve a problem we do not have.
 */
// lgtm[js/insufficient-password-hash]
export function hashApiKeyToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isApiKeyToken(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}
