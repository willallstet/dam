import { t } from "../../trpc.js";
import {
  manageAgentByAgentIdProcedure,
  manageConnectionsProcedure,
} from "../../auth-procedures.js";
import {
  connectionCreateInputSchema,
  connectionDiscoverMcpInputSchema,
  connectionGetAgentConnectionsInputSchema,
  connectionIdInputSchema,
  connectionSetAgentConnectionsInputSchema,
  connectionStartOAuthInputSchema,
} from "./schemas.js";

export const connectionsRouter = t.router({
  listTemplates: manageConnectionsProcedure.query(({ ctx }) =>
    ctx.connections.listTemplates(),
  ),

  list: manageConnectionsProcedure.query(({ ctx }) =>
    ctx.connections.listConnections(),
  ),

  get: manageConnectionsProcedure
    .input(connectionIdInputSchema)
    .query(({ ctx, input }) => ctx.connections.getConnection(input.id)),

  create: manageConnectionsProcedure
    .input(connectionCreateInputSchema)
    .mutation(({ ctx, input }) =>
      ctx.connections.createFromTemplate(input).then((id) => ({ id })),
    ),

  startOAuth: manageConnectionsProcedure
    .input(connectionStartOAuthInputSchema)
    .mutation(({ ctx, input }) =>
      ctx.connections.startOAuth(input.connectionId),
    ),

  discoverMcp: manageConnectionsProcedure
    .input(connectionDiscoverMcpInputSchema)
    .mutation(({ ctx, input }) => ctx.connections.discoverMcp(input)),

  delete: manageConnectionsProcedure
    .input(connectionIdInputSchema)
    .mutation(({ ctx, input }) => ctx.connections.deleteConnection(input.id)),

  // Per-agent grant linkage lives under agents:manage (the agent is the
  // resource being configured, not the connection itself). ADR-057.
  getAgentConnections: manageAgentByAgentIdProcedure
    .input(connectionGetAgentConnectionsInputSchema)
    .query(({ ctx, input }) =>
      ctx.connections.getAgentConnections(input.agentId),
    ),

  setAgentConnections: manageAgentByAgentIdProcedure
    .input(connectionSetAgentConnectionsInputSchema)
    .mutation(({ ctx, input }) =>
      ctx.connections.setAgentConnections(input.agentId, input.connectionIds),
    ),
});
