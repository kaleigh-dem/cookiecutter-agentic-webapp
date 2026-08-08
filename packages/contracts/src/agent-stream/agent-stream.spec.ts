import { describe, expect, it } from 'vitest';

import { AgentStreamDecoder, serializeAgentStreamEvent } from './codec';
import {
  AGENT_STREAM_PROTOCOL,
  AGENT_STREAM_VERSION,
  agentStreamEventV1Schema,
  type AgentStreamEventV1,
} from './schema';

const base = {
  protocol: AGENT_STREAM_PROTOCOL,
  version: AGENT_STREAM_VERSION,
  emittedAt: '2026-08-08T02:40:00.000Z',
  traceId: 'trace-01',
  actorId: 'actor-01',
  conversationId: 'conversation-01',
  providerId: 'provider-01',
  modelId: 'model-01',
};

describe('agent stream protocol', () => {
  it('round-trips chunked NDJSON while preserving model and tool identifiers', () => {
    const events: AgentStreamEventV1[] = [
      { ...base, sequence: 0, type: 'started' },
      {
        ...base,
        sequence: 1,
        type: 'tool_started',
        toolId: 'lookup-weather',
        toolCallId: 'tool-call-01',
      },
      {
        ...base,
        sequence: 2,
        type: 'tool_completed',
        toolId: 'lookup-weather',
        toolCallId: 'tool-call-01',
      },
      {
        ...base,
        sequence: 3,
        type: 'completed',
        finishReason: 'stop',
        usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 },
      },
    ];
    const payload = events.map(serializeAgentStreamEvent).join('');
    const bytes = new TextEncoder().encode(payload);
    const decoder = new AgentStreamDecoder();

    const decoded = [
      ...decoder.push(bytes.slice(0, 17)),
      ...decoder.push(bytes.slice(17, 89)),
      ...decoder.push(bytes.slice(89)),
      ...decoder.finish(),
    ];

    expect(decoded).toEqual(events);
    expect(decoded[1]).toMatchObject({
      traceId: 'trace-01',
      actorId: 'actor-01',
      conversationId: 'conversation-01',
      modelId: 'model-01',
      toolId: 'lookup-weather',
      toolCallId: 'tool-call-01',
    });
  });

  it('rejects unsupported protocol versions instead of guessing compatibility', () => {
    expect(() =>
      agentStreamEventV1Schema.parse({
        ...base,
        version: 2,
        sequence: 0,
        type: 'started',
      }),
    ).toThrow();
  });

  it('rejects unexpected fields so raw tool payloads cannot silently enter the transport', () => {
    expect(() =>
      agentStreamEventV1Schema.parse({
        ...base,
        sequence: 0,
        type: 'tool_completed',
        toolId: 'lookup-weather',
        toolCallId: 'tool-call-01',
        result: { secret: 'not-part-of-v1' },
      }),
    ).toThrow();
  });
});
