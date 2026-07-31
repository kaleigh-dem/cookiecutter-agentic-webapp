import { describe, expect, it } from 'vitest';

import {
  agentTaskExecutionRequestedSchema,
  agentTaskExecutionRequestedV1Schema,
  agentTaskExecutionRequestedV2Schema,
} from './schema';

describe('agent task execution requested events', () => {
  it('keeps existing v1 payloads valid during rollout', () => {
    const payload = {
      version: 1 as const,
      taskId: '11111111-1111-4111-8111-111111111111',
      actorId: 'actor-1',
      prompt: 'Summarize the document.',
      correlationId: 'correlation-1',
      occurredAt: '2026-07-31T17:00:00.000Z',
    };

    expect(agentTaskExecutionRequestedV1Schema.parse(payload)).toEqual(payload);
    expect(agentTaskExecutionRequestedSchema.parse(payload)).toEqual(payload);
  });

  it('requires operational identifiers on v2 payloads', () => {
    const payload = {
      version: 2 as const,
      taskId: '11111111-1111-4111-8111-111111111111',
      actorId: 'actor-1',
      userId: 'actor-1',
      prompt: 'Summarize the document.',
      requestId: 'request-1',
      traceId: 'trace-1',
      jobId: '22222222-2222-4222-8222-222222222222',
      correlationId: 'correlation-1',
      occurredAt: '2026-07-31T17:00:00.000Z',
    };

    expect(agentTaskExecutionRequestedV2Schema.parse(payload)).toEqual(payload);
    expect(agentTaskExecutionRequestedSchema.parse(payload)).toEqual(payload);
    expect(() =>
      agentTaskExecutionRequestedV2Schema.parse({
        ...payload,
        requestId: undefined,
      }),
    ).toThrow();
  });
});
