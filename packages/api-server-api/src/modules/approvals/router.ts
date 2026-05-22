import { t } from "../../trpc.js";
import { checkAgentBinding, runProcedure } from "../../auth-procedures.js";
import {
  approvalApproveHostInputSchema,
  approvalApproveOnceInputSchema,
  approvalApprovePermanentInputSchema,
  approvalDenyForeverInputSchema,
  approvalDismissInputSchema,
  approvalListForInstanceInputSchema,
  approvalListForOwnerInputSchema,
} from "./schemas.js";

export const approvalsRouter = t.router({
  listForOwner: runProcedure
    .input(approvalListForOwnerInputSchema)
    .query(({ ctx, input }) => ctx.approvals.listForOwner(input)),

  listForInstance: runProcedure
    .input(approvalListForInstanceInputSchema)
    .query(({ ctx, input }) => {
      checkAgentBinding(ctx, input.agentId);
      return ctx.approvals.listForInstance(input.agentId, {
        limit: input.limit,
        status: input.status,
      });
    }),

  approveOnce: runProcedure
    .input(approvalApproveOnceInputSchema)
    .mutation(({ ctx, input }) => ctx.approvals.approveOnce(input.id)),

  approvePermanent: runProcedure
    .input(approvalApprovePermanentInputSchema)
    .mutation(({ ctx, input }) => ctx.approvals.approvePermanent(input.id)),

  approveHost: runProcedure
    .input(approvalApproveHostInputSchema)
    .mutation(({ ctx, input }) => ctx.approvals.approveHost(input.id)),

  denyForever: runProcedure
    .input(approvalDenyForeverInputSchema)
    .mutation(({ ctx, input }) => ctx.approvals.denyForever(input.id)),

  dismiss: runProcedure
    .input(approvalDismissInputSchema)
    .mutation(({ ctx, input }) => ctx.approvals.dismiss(input.id)),
});
