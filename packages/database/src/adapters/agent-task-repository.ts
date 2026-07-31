import type {
  AgentTask,
  AgentTaskRepository,
  AgentTaskStatus,
} from '@agentic-webapp/backend-agent-task';
import {
  agentTaskExecutionRequestedV2Schema,
  type AgentTaskExecutionRequestedV2,
} from '@agentic-webapp/contracts';
import { eq } from 'drizzle-orm';

import type { Database } from '../client';
import { agentTasks, jobOutbox } from '../schema';

export class DrizzleAgentTaskRepository implements AgentTaskRepository {
  public constructor(private readonly database: Database) {}

  public async create(
    task: AgentTask,
    executionRequested: AgentTaskExecutionRequestedV2,
  ): Promise<void> {
    const payload =
      agentTaskExecutionRequestedV2Schema.parse(executionRequested);
    await this.database.transaction(async (transaction) => {
      await transaction.insert(agentTasks).values({
        id: task.id,
        ownerId: task.ownerId,
        title: task.title,
        prompt: task.prompt,
        status: task.status,
        correlationId: task.correlationId,
        createdAt: task.createdAt,
      });
      await transaction.insert(jobOutbox).values({
        id: payload.jobId,
        kind: 'agent-task.execute.v2',
        payload,
        correlationId: payload.correlationId,
        createdAt: task.createdAt,
      });
    });
  }

  public async findById(id: string): Promise<AgentTask | null> {
    const [row] = await this.database
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, id))
      .limit(1);
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      ownerId: row.ownerId,
      title: row.title,
      prompt: row.prompt,
      status: row.status as AgentTaskStatus,
      correlationId: row.correlationId,
      createdAt: row.createdAt,
    };
  }
}
