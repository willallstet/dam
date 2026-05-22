import type { Scope } from "api-server-api";

export interface ApiKeyRow {
  id: string;
  ownerSub: string;
  name: string;
  hash: string;
  scopes: readonly Scope[];
  agentIds: readonly string[] | null;
  expiresAt: Date | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface ApiKeyValidation {
  id: string;
  ownerSub: string;
  scopes: readonly Scope[];
  agentIds: readonly string[] | "*";
}
