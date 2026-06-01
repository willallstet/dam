import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Scope } from "api-server-api";
import { createApiKeysService } from "../../modules/api-keys/services/api-keys-service.js";
import { createApiKeyTokenCodec } from "../../modules/api-keys/domain/token.js";
import type { ApiKeyRow } from "../../modules/api-keys/domain/types.js";

const testCodec = createApiKeyTokenCodec("test-pepper");

interface InsertArgs {
  id: string;
  ownerSub: string;
  name: string;
  hash: string;
  scopes: readonly Scope[];
  agentIds: readonly string[] | null;
  expiresAt: Date | null;
}

interface FakeRepo {
  store: Map<string, ApiKeyRow>;
  list: (owner: string) => Promise<ApiKeyRow[]>;
  insert: (row: InsertArgs) => Promise<ApiKeyRow>;
  revoke: (id: string, owner: string) => Promise<boolean>;
}

function fakeRepo(): FakeRepo {
  const store = new Map<string, ApiKeyRow>();
  return {
    store,
    list: async (owner) =>
      Array.from(store.values()).filter(
        (r) => r.ownerSub === owner && !r.revokedAt,
      ),
    insert: async (row) => {
      const persisted: ApiKeyRow = {
        ...row,
        createdAt: new Date(),
        lastUsedAt: null,
        revokedAt: null,
      };
      store.set(persisted.id, persisted);
      return persisted;
    },
    revoke: async (id, owner) => {
      const row = store.get(id);
      if (!row || row.ownerSub !== owner || row.revokedAt) return false;
      store.set(id, { ...row, revokedAt: new Date() });
      return true;
    },
  };
}

interface ServiceFixture {
  svc: ReturnType<typeof createApiKeysService>;
  repo: FakeRepo;
}

function createService(
  opts: {
    isAgentOwnedBy?: (agentId: string, ownerSub: string) => Promise<boolean>;
  } = {},
): ServiceFixture {
  const repo = fakeRepo();
  const svc = createApiKeysService({
    ownerSub: "owner-1",
    list: repo.list,
    insert: repo.insert,
    revoke: repo.revoke,
    mintToken: testCodec.mint,
    isAgentOwnedBy: opts.isAgentOwnedBy ?? (async () => true),
  });
  return { svc, repo };
}

// Note: "API keys cannot manage API keys" is enforced at the router via
// `browserOnlyProcedure` (api-server-api/auth-procedures.ts), so the
// service no longer carries `callerKeyId` and the corresponding tests
// move to the router/middleware layer.
describe("ApiKeysService", () => {
  it("create returns plaintext once + a view without secret material", async () => {
    const { svc } = createService();
    const result = await svc.create({
      name: "ci",
      scopes: ["agents:run"],
      agentIds: "*",
    });
    expect(result.plaintext.startsWith("pk_")).toBe(true);
    expect(result.key.name).toBe("ci");
    expect(result.key.agentIds).toBe("*");
    expect(result.key.scopes).toEqual(["agents:run"]);
    expect((result.key as unknown as { hash?: string }).hash).toBeUndefined();
    expect(
      (result.key as unknown as { plaintext?: string }).plaintext,
    ).toBeUndefined();
  });

  it("list returns only the current owner's non-revoked keys", async () => {
    const { svc } = createService();
    await svc.create({ name: "k1", scopes: ["agents:run"], agentIds: "*" });
    const { key: k2 } = await svc.create({
      name: "k2",
      scopes: ["agents:run"],
      agentIds: "*",
    });
    await svc.revoke(k2.id);
    const listed = await svc.list();
    expect(listed.map((k) => k.name)).toEqual(["k1"]);
  });

  it("revoke throws NOT_FOUND for unknown ids", async () => {
    const { svc } = createService();
    await expect(svc.revoke("key-nope")).rejects.toThrow(TRPCError);
  });

  describe("agent binding validation", () => {
    it("rejects creating a key bound to a non-owned agent", async () => {
      const { svc } = createService({
        isAgentOwnedBy: async (id) => id === "agent-mine",
      });
      await expect(
        svc.create({
          name: "x",
          scopes: ["agents:run"],
          agentIds: ["agent-yours"],
        }),
      ).rejects.toThrow(TRPCError);
    });

    it("accepts a key bound to an owned agent", async () => {
      const { svc } = createService({
        isAgentOwnedBy: async (id) => id === "agent-mine",
      });
      const result = await svc.create({
        name: "x",
        scopes: ["agents:run"],
        agentIds: ["agent-mine"],
      });
      expect(result.key.agentIds).toEqual(["agent-mine"]);
    });
  });

  it("rejects expiresAt in the past", async () => {
    const { svc } = createService();
    const yesterday = new Date(Date.now() - 86_400_000).toISOString();
    await expect(
      svc.create({
        name: "x",
        scopes: ["agents:run"],
        agentIds: "*",
        expiresAt: yesterday,
      }),
    ).rejects.toThrow(TRPCError);
  });
});
