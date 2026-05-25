import { describe, it, expect } from "vitest";
import { TRPCError } from "@trpc/server";
import { ALL_SCOPES, type ApiContext, type UserIdentity } from "api-server-api";
// auth-procedures isn't reachable through the barrel (it loads @trpc/server
// at module init and we keep that out of browser bundles); import direct.
import {
  browserOnlyProcedure,
  manageConnectionsProcedure,
} from "api-server-api/auth-procedures";

function ctx(user: Partial<UserIdentity> = {}): ApiContext {
  const principal: UserIdentity = {
    sub: "owner-1",
    preferredUsername: "owner-1",
    scopes: ALL_SCOPES,
    agentIds: "*",
    ...user,
  };
  return { user: principal } as unknown as ApiContext;
}

async function runProcedure(
  procedure: { _def: { middlewares: ReadonlyArray<unknown> } },
  user: Partial<UserIdentity>,
): Promise<unknown> {
  // tRPC keeps the middleware chain on the procedure's internal _def. Run
  // it through a minimal harness so we can assert FORBIDDEN / pass-through
  // without spinning up an HTTP server.
  const mw = (
    procedure._def.middlewares as ReadonlyArray<
      (opts: {
        ctx: ApiContext;
        next: () => Promise<{ ok: true; data: string } | unknown>;
      }) => Promise<unknown>
    >
  )[0];
  return mw({
    ctx: ctx(user),
    next: async () => ({ ok: true, data: "pass" }),
  });
}

describe("browserOnlyProcedure", () => {
  it("passes through for interactive Keycloak principals (no keyId)", async () => {
    const result = await runProcedure(browserOnlyProcedure, {});
    expect(result).toEqual({ ok: true, data: "pass" });
  });

  it("rejects API-key principals with FORBIDDEN", async () => {
    await expect(
      runProcedure(browserOnlyProcedure, { keyId: "key-deadbeef" }),
    ).rejects.toMatchObject({
      name: "TRPCError",
      code: "FORBIDDEN",
    });
  });

  it("error message guides the caller to the correct auth flow", async () => {
    try {
      await runProcedure(browserOnlyProcedure, { keyId: "key-abc" });
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).message).toContain(
        "API keys cannot manage API keys",
      );
    }
  });
});

describe("scope guards", () => {
  it("manageConnectionsProcedure rejects principals without connections:manage", async () => {
    await expect(
      runProcedure(manageConnectionsProcedure, { scopes: ["agents:run"] }),
    ).rejects.toMatchObject({
      name: "TRPCError",
      code: "FORBIDDEN",
    });
  });

  it("manageConnectionsProcedure passes when scope is held", async () => {
    const result = await runProcedure(manageConnectionsProcedure, {
      scopes: ["connections:manage"],
    });
    expect(result).toEqual({ ok: true, data: "pass" });
  });
});
