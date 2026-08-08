import { z } from 'zod';

export const AGENT_STREAM_PROTOCOL = 'steadystack.agent-stream' as const;
export const AGENT_STREAM_VERSION = 1 as const;
export const AGENT_STREAM_CONTENT_TYPE =
  'application/x-ndjson; charset=utf-8' as const;

const identifierSchema = z.string().trim().min(1);

const eventBase = {
  protocol: z.literal(AGENT_STREAM_PROTOCOL),
  version: z.literal(AGENT_STREAM_VERSION),
  sequence: z.number().int().nonnegative(),
  emittedAt: z.string().datetime(),
  traceId: identifierSchema,
  actorId: identifierSchema,
  conversationId: identifierSchema,
  providerId: identifierSchema,
  modelId: identifierSchema,
};

export const agentStreamUsageSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  cachedInputTokens: z.number().int().nonnegative().optional(),
});

export const agentStreamStartedV1Schema = z.strictObject({
  ...eventBase,
  type: z.literal('started'),
});

export const agentStreamTextDeltaV1Schema = z.strictObject({
  ...eventBase,
  type: z.literal('text_delta'),
  text: z.string(),
});

export const agentStreamUsageV1Schema = z.strictObject({
  ...eventBase,
  type: z.literal('usage'),
  usage: agentStreamUsageSchema,
});

const toolEventFields = {
  toolId: identifierSchema,
  toolCallId: identifierSchema,
};

export const agentStreamToolStartedV1Schema = z.strictObject({
  ...eventBase,
  ...toolEventFields,
  type: z.literal('tool_started'),
});

export const agentStreamToolCompletedV1Schema = z.strictObject({
  ...eventBase,
  ...toolEventFields,
  type: z.literal('tool_completed'),
});

export const agentStreamToolDeniedV1Schema = z.strictObject({
  ...eventBase,
  ...toolEventFields,
  type: z.literal('tool_denied'),
  reasonCode: identifierSchema,
});

export const agentStreamCompletedV1Schema = z.strictObject({
  ...eventBase,
  type: z.literal('completed'),
  finishReason: z.enum(['stop', 'length', 'content_filter', 'unknown']),
  usage: agentStreamUsageSchema,
});

export const agentStreamErrorV1Schema = z.strictObject({
  ...eventBase,
  type: z.literal('error'),
  code: identifierSchema,
});

export const agentStreamEventV1Schema = z.discriminatedUnion('type', [
  agentStreamStartedV1Schema,
  agentStreamTextDeltaV1Schema,
  agentStreamUsageV1Schema,
  agentStreamToolStartedV1Schema,
  agentStreamToolCompletedV1Schema,
  agentStreamToolDeniedV1Schema,
  agentStreamCompletedV1Schema,
  agentStreamErrorV1Schema,
]);

export const agentStreamEventSchema = agentStreamEventV1Schema;

export type AgentStreamUsage = z.infer<typeof agentStreamUsageSchema>;
export type AgentStreamEventV1 = z.infer<typeof agentStreamEventV1Schema>;
export type AgentStreamEvent = z.infer<typeof agentStreamEventSchema>;
