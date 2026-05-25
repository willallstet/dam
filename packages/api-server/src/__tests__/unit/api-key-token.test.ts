import { describe, it, expect } from "vitest";
import { API_KEY_PREFIX } from "api-server-api";
import {
  hashApiKeyToken,
  isApiKeyToken,
  mintApiKeyToken,
} from "../../modules/api-keys/domain/token.js";

describe("api-key token", () => {
  it("mints prefixed token + matching sha256 digest", () => {
    const { token, hash } = mintApiKeyToken();
    expect(token.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashApiKeyToken(token)).toBe(hash);
  });

  it("produces a base64url body (alphabet + - _, no padding) after the prefix", () => {
    const { token } = mintApiKeyToken();
    const body = token.slice(API_KEY_PREFIX.length);
    expect(body).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes -> ceil(32 * 8 / 6) = 43 base64url chars (no padding)
    expect(body.length).toBe(43);
  });

  it("isApiKeyToken discriminates against JWTs", () => {
    expect(isApiKeyToken("pk_abc")).toBe(true);
    expect(isApiKeyToken("eyJhbGciOiJSUzI1NiIs")).toBe(false);
    expect(isApiKeyToken("")).toBe(false);
  });

  it("mints distinct tokens across calls (entropy sanity)", () => {
    const a = mintApiKeyToken();
    const b = mintApiKeyToken();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });
});
