import type { Db } from "db";
import type { ApiKeysService } from "api-server-api";
import {
  findActiveApiKeyByHash,
  insertApiKey,
  listApiKeysByOwner,
  revokeApiKey,
  touchApiKeyLastUsed,
} from "./infrastructure/api-keys-repository.js";
import {
  createApiKeyValidator,
  type ApiKeyValidator,
} from "./services/api-key-validator.js";
import { createApiKeysService } from "./services/api-keys-service.js";
import { createApiKeyTokenCodec } from "./domain/token.js";

/**
 * System-level wiring — the validator is shared across all requests
 * (looked up by hash, no per-user state). The service factory is
 * per-request because it carries `ownerSub` and `callerKeyId` from
 * the authenticated principal.
 */
export function composeApiKeysModule(deps: {
  db: Db;
  /** Server-side HMAC pepper for at-rest token digests (ADR-056). Stable
   *  across restarts — rotating it invalidates every existing key. */
  hmacKey: string;
  isAgentOwnedBy: (agentId: string, ownerSub: string) => Promise<boolean>;
}): {
  validator: ApiKeyValidator;
  createService: (perRequest: { ownerSub: string }) => ApiKeysService;
} {
  const { db, hmacKey, isAgentOwnedBy } = deps;
  const codec = createApiKeyTokenCodec(hmacKey);
  const list = listApiKeysByOwner(db);
  const insert = insertApiKey(db);
  const revoke = revokeApiKey(db);

  const validator = createApiKeyValidator({
    hashToken: codec.hash,
    findByHash: findActiveApiKeyByHash(db),
    touchLastUsed: touchApiKeyLastUsed(db),
  });

  return {
    validator,
    createService: ({ ownerSub }) =>
      createApiKeysService({
        ownerSub,
        list,
        insert,
        revoke,
        mintToken: codec.mint,
        isAgentOwnedBy,
      }),
  };
}
