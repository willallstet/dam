import { t } from "../../trpc.js";
import {
  checkAgentBinding,
  manageAgentsProcedure,
  manageConnectionsProcedure,
} from "../../auth-procedures.js";
import {
  secretCreateGithubPatInputSchema,
  secretCreateInputSchema,
  secretDeleteInputSchema,
  secretGetAgentAccessInputSchema,
  secretListGrantedAgentsInputSchema,
  secretSetAgentAccessInputSchema,
  secretTestAnthropicInputSchema,
  secretUpdateGithubPatInputSchema,
  secretUpdateInputSchema,
} from "./schemas.js";

function messageForStatus(status: number): string {
  if (status === 401) return "Invalid credential.";
  if (status === 403) return "Credential lacks required permissions.";
  if (status === 429) return "Rate limited by Anthropic.";
  if (status >= 500) return "Anthropic is unavailable right now.";
  return `Unexpected response (${status}).`;
}

export const secretsRouter = t.router({
  // Credential lifecycle (CRUD on the credential itself) — connections:manage.
  list: manageConnectionsProcedure.query(({ ctx }) => ctx.secrets.list()),

  create: manageConnectionsProcedure
    .input(secretCreateInputSchema)
    .mutation(({ ctx, input }) => ctx.secrets.create(input)),

  createGithubPat: manageConnectionsProcedure
    .input(secretCreateGithubPatInputSchema)
    .mutation(({ ctx, input }) => ctx.secrets.createGithubPat(input)),

  updateGithubPat: manageConnectionsProcedure
    .input(secretUpdateGithubPatInputSchema)
    .mutation(({ ctx, input }) => ctx.secrets.updateGithubPat(input)),

  update: manageConnectionsProcedure
    .input(secretUpdateInputSchema)
    .mutation(({ ctx, input }) => ctx.secrets.update(input)),

  delete: manageConnectionsProcedure
    .input(secretDeleteInputSchema)
    .mutation(({ ctx, input }) => ctx.secrets.delete(input.id)),

  // Per-agent grant linkage is configuration of the agent, not the credential —
  // agents:manage. ADR-047.
  getAgentAccess: manageAgentsProcedure
    .input(secretGetAgentAccessInputSchema)
    .query(({ ctx, input }) => {
      checkAgentBinding(ctx, input.agentId);
      return ctx.secrets.getAgentAccess(input.agentId);
    }),

  testAnthropic: manageConnectionsProcedure
    .input(secretTestAnthropicInputSchema)
    .mutation(async ({ input }) => {
      const headers: Record<string, string> = {
        "anthropic-version": "2023-06-01",
      };
      if (input.envName === "ANTHROPIC_API_KEY") {
        headers["x-api-key"] = input.value;
      } else {
        headers["Authorization"] = `Bearer ${input.value}`;
        headers["anthropic-beta"] = "oauth-2025-04-20";
      }
      try {
        const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
          method: "GET",
          headers,
        });
        if (res.ok) return { ok: true as const };
        return {
          ok: false as const,
          status: res.status,
          message: messageForStatus(res.status),
        };
      } catch {
        return { ok: false as const, message: "Could not reach Anthropic." };
      }
    }),

  setAgentAccess: manageAgentsProcedure
    .input(secretSetAgentAccessInputSchema)
    .mutation(({ ctx, input }) => {
      checkAgentBinding(ctx, input.agentId);
      return ctx.secrets.setAgentAccess(input.agentId, {
        secretIds: input.secretIds,
      });
    }),

  listGrantedAgents: manageConnectionsProcedure
    .input(secretListGrantedAgentsInputSchema)
    .query(({ ctx, input }) => ctx.secrets.listGrantedAgents(input.id)),
});
