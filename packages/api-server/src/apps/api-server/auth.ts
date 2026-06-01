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
  /** OIDC client ID used by the web UI; matched against JWT `azp` to attribute requests to surface="ui". */
  uiClientId: string;
  /** OIDC client ID used by the dam CLI; matched against JWT `azp` to attribute requests to surface="cli". */
  cliClientId: string;
  /** Realm role marking a user as core team (used by activity tracking to
   *  exclude internal traffic from pilot metrics). Empty/unset = nobody is
   *  flagged core. Read from JWT `realm_access.roles` at verify time. */
  coreRole?: string;
}

export interface AuthDeps {
  /** Validates a `pk_…` (platform key) token, see ADR-056. Optional —
   *  when omitted, API-key tokens are rejected so deployments without
   *  the api-keys module wired in remain JWT-only. */
  verifyApiKey?: (
    token: string,
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
  "/api/terms",
]);

const PUBLIC_PATH_PREFIXES = ["/api/brand/"];

export function createAuth(config: AuthConfig, deps: AuthDeps = {}) {
  const JWKS = createRemoteJWKSet(new URL(config.jwksUrl));

  async function verifyJwt(
    token: string,
  ): Promise<{ user: UserIdentity; azp: string; roles: string[] }> {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: config.issuerUrl,
      audience: config.audience,
      algorithms: ["RS256"],
    });

    const claims = payload as Record<string, unknown>;
    const realmAccess = claims.realm_access as { roles?: string[] } | undefined;
    const roles = realmAccess?.roles ?? [];

    if (config.requiredRole && !roles.includes(config.requiredRole)) {
      throw new ForbiddenError(config.requiredRole);
    }

    return {
      user: {
        sub: payload.sub!,
        preferredUsername:
          (claims.preferred_username as string) ?? payload.sub!,
        // Browser-flow principals carry full effective scopes; agent binding
        // is unconstrained (wildcard). The API-key path narrows both.
        scopes: ALL_SCOPES,
        agentIds: "*",
      },
      azp: typeof claims.azp === "string" ? claims.azp : "",
      roles,
    };
  }

  async function verifyApiKey(
    token: string,
  ): Promise<{ user: UserIdentity; azp: string; roles: string[] }> {
    if (!deps.verifyApiKey) {
      throw new UnauthorizedError("api keys not enabled");
    }
    const result = await deps.verifyApiKey(token);
    if (!result.ok) throw new UnauthorizedError(result.error);

    const key = result.value;
    // Per-request owner-active check (ADR-056). When the owner has been
    // deleted in Keycloak, any of their keys lose authority immediately —
    // no revocation sweep is needed. Role demotion within Keycloak is a
    // weaker form of this check and is deferred to a follow-up.
    if (deps.verifyOwnerActive) {
      const active = await deps.verifyOwnerActive(key.ownerSub);
      if (!active) throw new UnauthorizedError("owner inactive");
    }

    return {
      user: {
        sub: key.ownerSub,
        preferredUsername: key.ownerSub,
        scopes: key.scopes,
        agentIds: key.agentIds,
        keyId: key.id,
      },
      // API-key principals are not browser/CLI OIDC clients and carry no realm
      // roles — they attribute as surface="other" and never count as core.
      azp: "",
      roles: [],
    };
  }

  async function verify(
    token: string,
  ): Promise<{ user: UserIdentity; azp: string; roles: string[] }> {
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
      const { user, azp, roles } = await verify(token);
      c.set("user", user);
      c.set("roles", roles);
      const surface =
        azp === config.uiClientId
          ? "ui"
          : azp === config.cliClientId
            ? "cli"
            : "other";
      const isCore = config.coreRole ? roles.includes(config.coreRole) : false;
      emit({
        type: EventType.UserAuthenticated,
        userSub: user.sub,
        surface,
        isCore,
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
