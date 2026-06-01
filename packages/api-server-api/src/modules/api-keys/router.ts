import { t } from "../../trpc.js";
import { browserOnlyProcedure } from "../../auth-procedures.js";
import { apiKeyCreateInputSchema, apiKeyRevokeInputSchema } from "./schemas.js";

// All three procedures gate at the router via `browserOnlyProcedure`, so
// the service layer no longer has to enforce "keys can't manage keys".
// ADR-057 § Decision: this is the single privilege-escalation barrier.
export const apiKeysRouter = t.router({
  list: browserOnlyProcedure.query(({ ctx }) => ctx.apiKeys.list()),

  create: browserOnlyProcedure
    .input(apiKeyCreateInputSchema)
    .mutation(({ ctx, input }) => ctx.apiKeys.create(input)),

  revoke: browserOnlyProcedure
    .input(apiKeyRevokeInputSchema)
    .mutation(({ ctx, input }) => ctx.apiKeys.revoke(input.id)),
});

void t;
