import { createRemoteJWKSet, jwtVerify } from "jose";
import type { MiddlewareHandler } from "hono";
import { ALL_SCOPES, type UserIdentity } from "api-server-api";
import type { Result } from "../../core/result.js";
import { emit, EventType } from "../../events.js";
import {
  isApiKeyToken,
  type ApiKeyValidationFailure,
  type ValidatedApiKey,
} from "../../modules/api-keys/index.js";

export class ForbiddenError extends Error {
  constructor(public readonly requiredRole: string) {
    super(`Missing required role: ${requiredRole}`);
  }
}

export class UnauthorizedError extends Error {
  constructor(public readonly reason: string) {
    super(`Unauthorized: ${reason}`);
  }
}

export interface AuthConfig {
  /** External issuer URL (matches token `iss` claim), e.g. http://keycloak.localhost:4444/realms/platform */
  issuerUrl: string;
  /** Internal JWKS endpoint for key fetching, e.g. http://platform-keycloak:8080/realms/platform/protocol/openid-connect/certs */
  jwksUrl: string;
  /** Expected audience in access tokens (e.g. "platform-api") */
  audience?: string;
  /** Realm role required to access the API (e.g. "platform-access"). If unset, all authenticated users are allowed. */
  requiredRole?: string;
}

export interface AuthDeps {
  /** Validates a `damkey_…` token (ADR-047). Optional — when omitted,
   *  API-key tokens are rejected so deployments without the api-keys
   *  module wired in remain JWT-only. */
  verifyApiKey?: (
    plaintext: string,
  ) => Promise<Result<ValidatedApiKey, ApiKeyValidationFailure>>;
  /** Per-request owner-still-active check for API-key principals. Returns
   *  false if the owner no longer exists in Keycloak; the key is then
   *  treated as revoked for the request. JWT principals don't need this
   *  (Keycloak signs each access token). */
  verifyOwnerActive?: (sub: string) => Promise<boolean>;
}

const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/auth/config",
  "/api/oauth/callback",
  "/api/slack/oauth/callback",
  "/api/telegram/oauth/callback",
]);

const PUBLIC_PATH_PREFIXES = ["/api/brand/"];

export function createAuth(config: AuthConfig, deps: AuthDeps = {}) {
  const JWKS = createRemoteJWKSet(new URL(config.jwksUrl));

  async function verifyJwt(token: string): Promise<UserIdentity> {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: config.issuerUrl,
      audience: config.audience,
      algorithms: ["RS256"],
    });

    if (config.requiredRole) {
      const realmAccess = (payload as Record<string, unknown>).realm_access as
        | { roles?: string[] }
        | undefined;
      if (!realmAccess?.roles?.includes(config.requiredRole)) {
        throw new ForbiddenError(config.requiredRole);
      }
    }

    return {
      sub: payload.sub!,
      preferredUsername:
        ((payload as Record<string, unknown>).preferred_username as string) ??
        payload.sub!,
      // Browser-flow principals carry full effective scopes; agent binding
      // is unconstrained (wildcard). The API-key path narrows both.
      scopes: ALL_SCOPES,
      agentIds: "*",
    };
  }

  async function verifyApiKey(plaintext: string): Promise<UserIdentity> {
    if (!deps.verifyApiKey) {
      throw new UnauthorizedError("api keys not enabled");
    }
    const result = await deps.verifyApiKey(plaintext);
    if (!result.ok) throw new UnauthorizedError(result.error);

    const key = result.value;
    // Per-request owner-active check (ADR-047). When the owner has been
    // deleted in Keycloak, any of their keys lose authority immediately —
    // no revocation sweep is needed. Role demotion within Keycloak is a
    // weaker form of this check and is deferred to a follow-up.
    if (deps.verifyOwnerActive) {
      const active = await deps.verifyOwnerActive(key.ownerSub);
      if (!active) throw new UnauthorizedError("owner inactive");
    }

    return {
      sub: key.ownerSub,
      preferredUsername: key.ownerSub,
      scopes: key.scopes,
      agentIds: key.agentIds,
      keyId: key.id,
    };
  }

  async function verify(token: string): Promise<UserIdentity> {
    return isApiKeyToken(token) ? verifyApiKey(token) : verifyJwt(token);
  }

  const middleware: MiddlewareHandler = async (c, next) => {
    if (
      PUBLIC_PATHS.has(c.req.path) ||
      PUBLIC_PATH_PREFIXES.some((p) => c.req.path.startsWith(p))
    )
      return next();

    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "unauthorized" }, 401);
    }

    const token = authHeader.slice(7);
    try {
      const user = await verify(token);
      c.set("user", user);
      // The userJwt field on UserAuthenticated is consumed by downstream
      // modules that need to forward the principal's Keycloak JWT to other
      // services (e.g. token-exchange). API-key principals don't have one
      // — emit with an empty string so the event still fires for telemetry
      // and so JWT-only consumers stay backwards compatible.
      emit({
        type: EventType.UserAuthenticated,
        userSub: user.sub,
        userJwt: user.keyId ? "" : token,
      });
      return next();
    } catch (err) {
      if (err instanceof ForbiddenError) {
        return c.json(
          {
            error: "forbidden",
            message: "Access pending approval. Contact your administrator.",
          },
          403,
        );
      }
      return c.json({ error: "unauthorized" }, 401);
    }
  };

  return { middleware, verify };
}
