import { describe, it, expect } from "vitest";
import { API_KEY_PREFIX } from "api-server-api";
import {
  createApiKeyTokenCodec,
  isApiKeyToken,
} from "../../modules/api-keys/domain/token.js";

const codec = createApiKeyTokenCodec("test-pepper");

describe("api-key token", () => {
  it("mints prefixed token + matching hmac-sha256 digest", () => {
    const { token, hash } = codec.mint();
    expect(token.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(codec.hash(token)).toBe(hash);
  });

  it("produces a base64url body (alphabet + - _, no padding) after the prefix", () => {
    const { token } = codec.mint();
    const body = token.slice(API_KEY_PREFIX.length);
    expect(body).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 bytes -> ceil(32 * 8 / 6) = 43 base64url chars (no padding)
    expect(body.length).toBe(43);
  });

  it("digest depends on the pepper — same token, different key, different hash", () => {
    const { token } = codec.mint();
    const other = createApiKeyTokenCodec("different-pepper");
    expect(other.hash(token)).not.toBe(codec.hash(token));
  });

  it("refuses to construct a codec without a pepper", () => {
    expect(() => createApiKeyTokenCodec("")).toThrow(/API_KEY_HMAC_KEY/);
  });

  it("isApiKeyToken discriminates against JWTs", () => {
    expect(isApiKeyToken("pk_abc")).toBe(true);
    expect(isApiKeyToken("eyJhbGciOiJSUzI1NiIs")).toBe(false);
    expect(isApiKeyToken("")).toBe(false);
  });

  it("mints distinct tokens across calls (entropy sanity)", () => {
    const a = codec.mint();
    const b = codec.mint();
    expect(a.token).not.toBe(b.token);
    expect(a.hash).not.toBe(b.hash);
  });
});
