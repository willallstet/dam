import { z } from "zod";
import { egressPresetSchema } from "../egress-rules/schemas.js";
import { envVarSchema } from "../shared.js";

const agentIdSchema = z.object({ agentId: z.string().min(1) });

export const agentGetInputSchema = agentIdSchema;
export const agentDeleteInputSchema = agentIdSchema;
export const agentRestartInputSchema = agentIdSchema;
export const agentWakeInputSchema = agentIdSchema;
export const agentDisconnectSlackInputSchema = agentIdSchema;
export const agentDisconnectTelegramInputSchema = agentIdSchema;

export const agentCreateInputSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .refine((n) => !n.startsWith("agent-"), {
        message: "agent name cannot start with 'agent-' (reserved for IDs)",
      }),
    templateId: z.string().optional(),
    image: z.string().optional(),
    description: z.string().optional(),
    env: z.array(envVarSchema).max(64).optional(),
    secretRef: z.string().optional(),
    allowedUserEmails: z.array(z.email()).optional(),
    egressPreset: egressPresetSchema.optional(),
  })
  .refine((d) => d.templateId !== undefined || d.image !== undefined, {
    message: "Either templateId or image is required",
  });

export const agentUpdateInputSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  env: z.array(envVarSchema).max(64).optional(),
  secretRef: z.string().optional(),
  allowedUserEmails: z.array(z.email()).optional(),
});

export const agentConnectSlackInputSchema = z.object({
  agentId: z.string().min(1),
  slackChannelId: z.string().min(1),
});

export const agentConnectTelegramInputSchema = z.object({
  agentId: z.string().min(1),
  botToken: z.string().min(1),
});

// The Agent CR spec shape is the generated AgentSpecCR (crd-types.gen.ts, from
// the controller's CRD); the public AgentSpec (types.ts) derives from it. K8s
// validates it at admission (ADR-058), so there's no Zod re-validation here.
