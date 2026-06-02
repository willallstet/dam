import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { t } from "./trpc.js";
import type { ApiContext } from "./context.js";
import type { Scope } from "./modules/api-keys/types.js";

/**
 * tRPC middleware that gates a procedure to one or more scopes. The request
 * is allowed if the principal has ANY of the listed scopes (OR semantics).
 * See ADR-057 for the scope vocabulary.
 */
function requireScope(...scopes: readonly Scope[]) {
  return t.middleware(({ ctx, next }) => {
    const granted = new Set(ctx.user.scopes);
    if (!scopes.some((s) => granted.has(s))) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Requires one of: ${scopes.join(", ")}`,
      });
    }
    return next();
  });
}

/** Operate an agent in its current configuration: sessions, prompts, approvals,
 *  pod-files, terminal. */
export const runProcedure = t.procedure.use(requireScope("agents:run"));

/** Change agent definitions or per-agent configuration that persists across
 *  runs: agent CRUD, schedules, channels, skills, egress rules, grant linkage. */
export const manageAgentsProcedure = t.procedure.use(
  requireScope("agents:manage"),
);

/** Global credential lifecycle: connections (OAuth) and secrets (user-supplied)
 *  CRUD. The grant linkage between a credential and an agent is `agents:manage`. */
export const manageConnectionsProcedure = t.procedure.use(
  requireScope("connections:manage"),
);

/** Read implicit in any agent-related scope. Use for list/get endpoints that
 *  both `agents:run` and `agents:manage` callers legitimately need. */
export const readAgentProcedure = t.procedure.use(
  requireScope("agents:run", "agents:manage"),
);

/**
 * Procedure available **only** to principals authenticated via an interactive
 * Keycloak session, not via API keys. The `api-keys.*` management surface
 * (mint / list / revoke) sits here so an exfiltrated key cannot mint or
 * revoke other keys — the single privilege-escalation barrier in ADR-057.
 */
export const browserOnlyProcedure = t.procedure.use(({ ctx, next }) => {
  if (ctx.user.keyId !== undefined) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "API keys cannot manage API keys. Use the web UI or `dam auth login`.",
    });
  }
  return next();
});

/**
 * Per-call agent-binding guard. Call from a service or procedure handler
 * whenever the operation targets a specific Agent ID. Pass-through when the
 * principal's binding is wildcard; throws when the key is restricted to a
 * different set. ADR-057.
 *
 * Prefer the `*Agent{ById,ByAgentId}Procedure` builders below; use this raw
 * helper only when the agent ID is resolved from another resource.
 */
export function checkAgentBinding(ctx: ApiContext, agentId: string): void {
  if (ctx.user.agentIds === "*") return;
  if (!ctx.user.agentIds.includes(agentId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `API key is not bound to agent ${agentId}`,
    });
  }
}

const agentIdInput = z.object({ agentId: z.string().min(1) });

/**
 * Scoped procedures that auto-enforce `checkAgentBinding` against
 * `input.agentId`. Chained `.input(agentIdInput)` runs before `.use(...)`, so
 * `input.agentId` is statically typed; a router attaching its own
 * `.input(...)` is intersected with `{ agentId: string }` at compile time.
 *
 * A forgotten check on a future endpoint becomes a type error (missing field
 * in the intersected input), not a silent privilege escalation past the
 * API-key agent binding.
 *
 * Fall back to inline `checkAgentBinding` only when the agent ID is resolved
 * from another resource (e.g. `schedules.get` loads first) or the input
 * field is optional.
 */
export const manageAgentByAgentIdProcedure = manageAgentsProcedure
  .input(agentIdInput)
  .use(({ ctx, input, next }) => {
    checkAgentBinding(ctx, input.agentId);
    return next();
  });

export const readAgentByAgentIdProcedure = readAgentProcedure
  .input(agentIdInput)
  .use(({ ctx, input, next }) => {
    checkAgentBinding(ctx, input.agentId);
    return next();
  });

export const runAgentByAgentIdProcedure = runProcedure
  .input(agentIdInput)
  .use(({ ctx, input, next }) => {
    checkAgentBinding(ctx, input.agentId);
    return next();
  });

/**
 * `agents.create` is the one mutation with no agentId to bind against — the
 * agent doesn't exist yet. A restricted key must therefore not be able to
 * create new agents, otherwise it expands its own blast radius beyond what
 * the user authorized at mint time. ADR-057.
 */
export const manageAgentCreateProcedure = manageAgentsProcedure.use(
  ({ ctx, next }) => {
    if (ctx.user.agentIds !== "*") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Agent creation requires a wildcard-bound key (or an interactive session). Restricted keys cannot mint new agents.",
      });
    }
    return next();
  },
);
