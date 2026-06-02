import type { z } from "zod";
import type {
  apiKeyCreateInputSchema,
  apiKeyRevokeInputSchema,
  scopeSchema,
} from "./schemas.js";

export type Scope = z.infer<typeof scopeSchema>;

export const ALL_SCOPES: readonly Scope[] = [
  "agents:run",
  "agents:manage",
  "connections:manage",
] as const;

export type AgentBinding = readonly string[] | "*";

export interface ApiKeyView {
  id: string;
  name: string;
  scopes: readonly Scope[];
  agentIds: AgentBinding;
  expiresAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateInputSchema>;
export type ApiKeyRevokeInput = z.infer<typeof apiKeyRevokeInputSchema>;

export interface ApiKeyCreateResult {
  key: ApiKeyView;
  /** Plaintext token. Returned ONCE on create; never persisted, never recoverable. */
  plaintext: string;
}

export interface ApiKeysService {
  list(): Promise<ApiKeyView[]>;
  create(input: ApiKeyCreateInput): Promise<ApiKeyCreateResult>;
  revoke(id: string): Promise<void>;
}

/** Token prefix that distinguishes an API key from a Keycloak JWT in the
 *  shared `Authorization: Bearer` slot. See ADR-058. Brand-neutral on
 *  purpose — `platform` is the codename in the codebase, so `pk_`
 *  ("platform key") is permanent and survives any rebrand of the
 *  user-visible product name. */
export const API_KEY_PREFIX = "pk_";
