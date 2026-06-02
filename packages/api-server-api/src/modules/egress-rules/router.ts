import { TRPCError } from "@trpc/server";
import { t } from "../../trpc.js";
import {
  checkAgentBinding,
  manageAgentByAgentIdProcedure,
  manageAgentsProcedure,
  readAgentByAgentIdProcedure,
  readAgentProcedure,
} from "../../auth-procedures.js";
import {
  egressRuleApplyPresetInputSchema,
  egressRuleCreateInputSchema,
  egressRuleCurrentPresetInputSchema,
  egressRuleListForAgentInputSchema,
  egressRuleRevokeInputSchema,
  egressRuleUpdateInputSchema,
} from "./schemas.js";

export const egressRulesRouter = t.router({
  listForAgent: readAgentByAgentIdProcedure
    .input(egressRuleListForAgentInputSchema)
    .query(({ ctx, input }) => ctx.egressRules.listForAgent(input.agentId)),

  currentPreset: readAgentByAgentIdProcedure
    .input(egressRuleCurrentPresetInputSchema)
    .query(({ ctx, input }) => ctx.egressRules.currentPreset(input.agentId)),

  create: manageAgentByAgentIdProcedure
    .input(egressRuleCreateInputSchema)
    .mutation(({ ctx, input }) => ctx.egressRules.create(input)),

  // Input carries the rule id, not agentId — resolve first, then bind-check.
  update: manageAgentsProcedure
    .input(egressRuleUpdateInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.egressRules.getById(input.id);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      checkAgentBinding(ctx, existing.agentId);
      return ctx.egressRules.update(input);
    }),

  revoke: manageAgentsProcedure
    .input(egressRuleRevokeInputSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.egressRules.getById(input.id);
      if (!existing) return;
      checkAgentBinding(ctx, existing.agentId);
      return ctx.egressRules.revoke(input.id);
    }),

  applyPreset: manageAgentByAgentIdProcedure
    .input(egressRuleApplyPresetInputSchema)
    .mutation(({ ctx, input }) =>
      ctx.egressRules.applyPreset(input.agentId, input.preset),
    ),

  trustedHosts: readAgentProcedure.query(({ ctx }) =>
    ctx.egressRules.trustedHosts(),
  ),
});
