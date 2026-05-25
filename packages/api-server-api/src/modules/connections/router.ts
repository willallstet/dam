import { t } from "../../trpc.js";
import {
  checkAgentBinding,
  manageAgentsProcedure,
  manageConnectionsProcedure,
} from "../../auth-procedures.js";
import {
  connectionGetAgentConnectionsInputSchema,
  connectionSetAgentConnectionsInputSchema,
} from "./schemas.js";

export const connectionsRouter = t.router({
  list: manageConnectionsProcedure.query(({ ctx }) => ctx.connections.list()),

  // Per-agent grant linkage lives under agents:manage (the agent is the
  // resource being configured, not the connection itself). ADR-047.
  getAgentConnections: manageAgentsProcedure
    .input(connectionGetAgentConnectionsInputSchema)
    .query(({ ctx, input }) => {
      checkAgentBinding(ctx, input.agentId);
      return ctx.connections.getAgentConnections(input.agentId);
    }),

  setAgentConnections: manageAgentsProcedure
    .input(connectionSetAgentConnectionsInputSchema)
    .mutation(({ ctx, input }) => {
      checkAgentBinding(ctx, input.agentId);
      return ctx.connections.setAgentConnections(
        input.agentId,
        input.connectionIds,
      );
    }),
});
