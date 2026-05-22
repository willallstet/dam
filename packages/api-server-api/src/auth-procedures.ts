import { TRPCError } from "@trpc/server";
import { t } from "./trpc.js";
import type { ApiContext } from "./context.js";
import type { Scope } from "./modules/api-keys/types.js";

/**
 * tRPC middleware that gates a procedure to one or more scopes. The request
 * is allowed if the principal has ANY of the listed scopes (OR semantics).
 * See ADR-047 for the scope vocabulary.
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
export const manageCredentialsProcedure = t.procedure.use(
  requireScope("credentials:manage"),
);

/** Read implicit in any agent-related scope. Use for list/get endpoints that
 *  both `agents:run` and `agents:manage` callers legitimately need. */
export const readAgentProcedure = t.procedure.use(
  requireScope("agents:run", "agents:manage"),
);

/**
 * Per-call agent-binding guard. Call from a service or procedure handler
 * whenever the operation targets a specific Agent ID. Pass-through when the
 * principal's binding is wildcard; throws when the key is restricted to a
 * different set. ADR-047.
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
