import { z } from 'zod';

export const agentTaskExecutionRequestedSchema = z.object({
  version: z.literal(1),
  taskId: z.string().uuid(),
  actorId: z.string().min(1),
  prompt: z.string().min(1).max(4000),
  correlationId: z.string().min(1),
  occurredAt: z.string().datetime(),
});

export type AgentTaskExecutionRequested = z.infer<
  typeof agentTaskExecutionRequestedSchema
>;
