export const agentTaskStatuses = [
  'queued',
  'running',
  'completed',
  'failed',
] as const;
export type AgentTaskStatus = (typeof agentTaskStatuses)[number];

export interface AgentTask {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  readonly prompt: string;
  readonly status: AgentTaskStatus;
  readonly correlationId: string;
  readonly createdAt: Date;
}

export interface CreateAgentTaskInput {
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
  readonly prompt: string;
  readonly correlationId: string;
  readonly createdAt: Date;
}

export class AgentTaskValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'AgentTaskValidationError';
  }
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') {
    throw new AgentTaskValidationError(`${field} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new AgentTaskValidationError(`${field} is required.`);
  }
  if (normalized.length > maximum) {
    throw new AgentTaskValidationError(
      `${field} must be at most ${maximum} characters.`,
    );
  }
  return normalized;
}

export function createAgentTask(input: CreateAgentTaskInput): AgentTask {
  return {
    id: requiredText(input.id, 'id', 128),
    ownerId: requiredText(input.ownerId, 'ownerId', 128),
    title: requiredText(input.title, 'title', 120),
    prompt: requiredText(input.prompt, 'prompt', 4000),
    status: 'queued',
    correlationId: requiredText(input.correlationId, 'correlationId', 128),
    createdAt: input.createdAt,
  };
}
