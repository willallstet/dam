import { z } from "zod";

export const scopeSchema = z.enum([
  "agents:run",
  "agents:manage",
  "credentials:manage",
]);

export const agentBindingSchema = z.union([
  z.literal("*"),
  z.array(z.string().min(1)).min(1).max(256),
]);

export const apiKeyCreateInputSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(scopeSchema).min(1),
  agentIds: agentBindingSchema.default("*"),
  expiresAt: z.string().datetime().nullable().optional(),
});

export const apiKeyRevokeInputSchema = z.object({
  id: z.string().min(1),
});
