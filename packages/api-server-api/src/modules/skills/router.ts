import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { t } from "../../trpc.js";
import {
  checkAgentBinding,
  manageAgentByAgentIdProcedure,
  manageAgentsProcedure,
  readAgentByAgentIdProcedure,
  readAgentProcedure,
} from "../../auth-procedures.js";
import {
  localSkillSchema,
  skillCreateSourceInputSchema,
  skillDeleteSourceInputSchema,
  skillInstallInputSchema,
  skillListInputSchema,
  skillListLocalInputSchema,
  skillListSourcesInputSchema,
  skillPublishInputSchema,
  skillPublishResultSchema,
  skillRefSchema,
  skillRefreshSourceInputSchema,
  skillSchema,
  skillSourceSchema,
  skillStateInputSchema,
  skillStateOutputSchema,
  skillUninstallInputSchema,
} from "./schemas.js";

export const skillsRouter = t.router({
  sources: t.router({
    list: readAgentProcedure
      .input(skillListSourcesInputSchema)
      .output(z.array(skillSourceSchema))
      .query(({ ctx, input }) => {
        if (input?.agentId) checkAgentBinding(ctx, input.agentId);
        return ctx.skills.listSources(input?.agentId);
      }),

    create: manageAgentsProcedure
      .input(skillCreateSourceInputSchema)
      .output(skillSourceSchema)
      .mutation(({ ctx, input }) => ctx.skills.createSource(input)),

    delete: manageAgentsProcedure
      .input(skillDeleteSourceInputSchema)
      .mutation(({ ctx, input }) => ctx.skills.deleteSource(input.id)),

    /** Drop the scan cache for this source so the next listSkills re-queries
     *  upstream. Called after merging a PR, pushing out-of-band, etc. */
    refresh: manageAgentsProcedure
      .input(skillRefreshSourceInputSchema)
      .mutation(({ ctx, input }) => ctx.skills.refreshSource(input.id)),
  }),

  /** `agentId` is optional — public-archive scans don't need an instance.
   *  Private-source scans (that fall through to the authenticated
   *  agent-runtime path) will throw with a clear hint if it's missing. */
  list: readAgentProcedure
    .input(skillListInputSchema)
    .output(z.array(skillSchema))
    .query(async ({ ctx, input }) => {
      if (input.agentId) checkAgentBinding(ctx, input.agentId);
      const src = await ctx.skills.getSource(input.sourceId);
      if (!src) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.skills.list(input.sourceId, input.agentId);
    }),

  install: manageAgentByAgentIdProcedure
    .input(skillInstallInputSchema)
    .output(z.array(skillRefSchema))
    .mutation(({ ctx, input }) => ctx.skills.install(input)),

  uninstall: manageAgentByAgentIdProcedure
    .input(skillUninstallInputSchema)
    .output(z.array(skillRefSchema))
    .mutation(({ ctx, input }) => ctx.skills.uninstall(input)),

  listLocal: readAgentByAgentIdProcedure
    .input(skillListLocalInputSchema)
    .output(z.array(localSkillSchema))
    .query(({ ctx, input }) => ctx.skills.listLocal(input.agentId)),

  /**
   * Reconciled skills view for an instance — drops ghost SkillRefs (entries
   * in spec.skills whose directories were removed out-of-band) before
   * returning. Persists the cleanup so subsequent reads see a consistent
   * declarative state. Use this from the UI in preference to
   * `instances.get().skills` + `skills.listLocal` — same two pieces of data,
   * one trip, self-healing.
   *
   * `instancePublishes` is the explicit log of successful publish events
   * used to drive the "Published" badge on standalone skills.
   */
  state: readAgentByAgentIdProcedure
    .input(skillStateInputSchema)
    .output(skillStateOutputSchema)
    .query(({ ctx, input }) => ctx.skills.getState(input.agentId)),

  publish: manageAgentByAgentIdProcedure
    .input(skillPublishInputSchema)
    .output(skillPublishResultSchema)
    .mutation(({ ctx, input }) => ctx.skills.publish(input)),
});
