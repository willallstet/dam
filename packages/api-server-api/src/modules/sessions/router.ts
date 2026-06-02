import { t } from "../../trpc.js";
import {
  checkAgentBinding,
  runAgentByAgentIdProcedure,
  runProcedure,
} from "../../auth-procedures.js";
import {
  sessionCreateInputSchema,
  sessionDeleteInputSchema,
  sessionListByScheduleIdInputSchema,
  sessionListInputSchema,
  sessionResetByScheduleIdInputSchema,
  sessionResolveTerminalInputSchema,
  sessionSetModeInputSchema,
} from "./schemas.js";

export const sessionsRouter = t.router({
  list: runAgentByAgentIdProcedure
    .input(sessionListInputSchema)
    .query(({ ctx, input }) =>
      ctx.sessions.list(input.agentId, input.includeChannel),
    ),

  create: runAgentByAgentIdProcedure
    .input(sessionCreateInputSchema)
    .mutation(({ ctx, input }) =>
      ctx.sessions.create(
        input.sessionId,
        input.agentId,
        input.mode,
        input.type,
        input.scheduleId,
      ),
    ),

  setMode: runAgentByAgentIdProcedure
    .input(sessionSetModeInputSchema)
    .mutation(({ ctx, input }) =>
      ctx.sessions.setMode(input.sessionId, input.agentId, input.mode),
    ),

  delete: runAgentByAgentIdProcedure
    .input(sessionDeleteInputSchema)
    .mutation(({ ctx, input }) =>
      ctx.sessions.delete(input.sessionId, input.agentId),
    ),

  listByScheduleId: runProcedure
    .input(sessionListByScheduleIdInputSchema)
    .query(async ({ ctx, input }) => {
      // Resolve the schedule's agent before any data read so a restricted
      // key cannot fan out across schedules outside its binding (ADR-057).
      const sched = await ctx.schedules.get(input.scheduleId);
      if (!sched) return [];
      checkAgentBinding(ctx, sched.agentId);
      return ctx.sessions.listByScheduleId(input.scheduleId);
    }),

  resetByScheduleId: runProcedure
    .input(sessionResetByScheduleIdInputSchema)
    .mutation(async ({ ctx, input }) => {
      const sched = await ctx.schedules.get(input.scheduleId);
      if (!sched) return;
      checkAgentBinding(ctx, sched.agentId);
      return ctx.sessions.resetByScheduleId(input.scheduleId);
    }),

  resolveTerminal: runAgentByAgentIdProcedure
    .input(sessionResolveTerminalInputSchema)
    .mutation(({ ctx, input }) =>
      ctx.sessions.resolveTerminal(input.agentId, input.strategy, {
        reset: input.reset,
        force: input.force,
      }),
    ),
});
