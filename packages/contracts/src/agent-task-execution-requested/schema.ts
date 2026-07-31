import { z } from 'zod';

const agentTaskExecutionRequestedFields = {
  taskId: z.string().uuid(),
  actorId: z.string().min(1),
  prompt: z.string().min(1).max(4000),
  correlationId: z.string().min(1),
  occurredAt: z.string().datetime(),
};

export const agentTaskExecutionRequestedV1Schema = z.object({
  version: z.literal(1),
  ...agentTaskExecutionRequestedFields,
});

export type AgentTaskExecutionRequestedV1 = z.infer<
  typeof agentTaskExecutionRequestedV1Schema
>;

export const agentTaskExecutionRequestedV2Schema = z.object({
  version: z.literal(2),
  ...agentTaskExecutionRequestedFields,
  userId: z.string().min(1),
  requestId: z.string().min(1),
  traceId: z.string().min(1),
  jobId: z.string().uuid(),
});

export type AgentTaskExecutionRequestedV2 = z.infer<
  typeof agentTaskExecutionRequestedV2Schema
>;

export const agentTaskExecutionRequestedSchema = z.discriminatedUnion('version', [
  agentTaskExecutionRequestedV1Schema,
  agentTaskExecutionRequestedV2Schema,
]);

export type AgentTaskExecutionRequested = z.infer<
  typeof agentTaskExecutionRequestedSchema
>;
