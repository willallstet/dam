import { createHash, randomBytes } from "node:crypto";
import { API_KEY_PREFIX } from "api-server-api";

const RANDOM_BYTES = 32;

// RFC 4648 base32, lowercase, no padding. Picked over base64url because
// shells, copy-paste tools, and `--token=` flags in screenshots survive
// base32 round-trips without case folding hazards. 32B → 52 chars.
const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

function base32(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}

export function mintApiKeyToken(): { plaintext: string; hash: string } {
  const plaintext = API_KEY_PREFIX + base32(randomBytes(RANDOM_BYTES));
  return { plaintext, hash: hashApiKeyToken(plaintext) };
}

export function hashApiKeyToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function isApiKeyToken(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}
