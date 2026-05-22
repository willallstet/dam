import { describe, it, expect } from "vitest";
import { API_KEY_PREFIX } from "api-server-api";
import {
  hashApiKeyToken,
  isApiKeyToken,
  mintApiKeyToken,
} from "../../modules/api-keys/domain/token.js";

describe("api-key token", () => {
  it("mints prefixed plaintext + matching sha256 digest", () => {
    const { plaintext, hash } = mintApiKeyToken();
    expect(plaintext.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKeyToken(plaintext)).toBe(hash);
  });

  it("produces a base32 body (lowercase, no padding) after the prefix", () => {
    const { plaintext } = mintApiKeyToken();
    const body = plaintext.slice(API_KEY_PREFIX.length);
    expect(body).toMatch(/^[a-z2-7]+$/);
    // 32 bytes -> ceil(32 * 8 / 5) = 52 base32 chars
    expect(body.length).toBe(52);
  });

  it("isApiKeyToken discriminates against JWTs", () => {
    expect(isApiKeyToken("damkey_abc")).toBe(true);
    expect(isApiKeyToken("eyJhbGciOiJSUzI1NiIs")).toBe(false);
    expect(isApiKeyToken("")).toBe(false);
  });

  it("mints distinct tokens across calls (entropy sanity)", () => {
    const a = mintApiKeyToken();
    const b = mintApiKeyToken();
    expect(a.plaintext).not.toBe(b.plaintext);
    expect(a.hash).not.toBe(b.hash);
  });
});
