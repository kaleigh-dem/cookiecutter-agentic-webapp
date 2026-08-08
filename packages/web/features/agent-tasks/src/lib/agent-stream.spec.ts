import { describe, expect, it } from 'vitest';

import {
  AGENT_STREAM_PROTOCOL,
  AGENT_STREAM_VERSION,
  serializeAgentStreamEvent,
  type AgentStreamEventV1,
} from '@steadystack/contracts';

import { AgentStreamConsumer } from './agent-stream';

const base = {
  protocol: AGENT_STREAM_PROTOCOL,
  version: AGENT_STREAM_VERSION,
  emittedAt: '2026-08-08T02:45:00.000Z',
  traceId: 'trace-web-01',
  actorId: 'actor-web-01',
  conversationId: 'conversation-web-01',
  providerId: 'provider-web-01',
  modelId: 'model-web-01',
};

function payload(events: readonly AgentStreamEventV1[]): Uint8Array {
  return new TextEncoder().encode(
    events.map(serializeAgentStreamEvent).join(''),
  );
}

describe('AgentStreamConsumer', () => {
  it('consumes chunked V1 events and preserves model and tool identifiers', () => {
    const events: AgentStreamEventV1[] = [
      { ...base, sequence: 0, type: 'started' },
      {
        ...base,
        sequence: 1,
        type: 'text_delta',
        text: 'hello',
      },
      {
        ...base,
        sequence: 2,
        type: 'tool_started',
        toolId: 'lookup-weather',
        toolCallId: 'call-web-01',
      },
      {
        ...base,
        sequence: 3,
        type: 'tool_denied',
        toolId: 'lookup-weather',
        toolCallId: 'call-web-01',
        reasonCode: 'missing_scope',
      },
    ];
    const bytes = payload(events);
    const consumer = new AgentStreamConsumer();
    const received = [
      ...consumer.push(bytes.slice(0, 13)),
      ...consumer.push(bytes.slice(13)),
      ...consumer.finish(),
    ];

    expect(received).toEqual(events);
    expect(received[2]).toMatchObject({
      traceId: 'trace-web-01',
      actorId: 'actor-web-01',
      conversationId: 'conversation-web-01',
      modelId: 'model-web-01',
      toolId: 'lookup-weather',
      toolCallId: 'call-web-01',
    });
  });

  it('rejects missing or duplicate sequence numbers', () => {
    const consumer = new AgentStreamConsumer();
    const events: AgentStreamEventV1[] = [
      { ...base, sequence: 0, type: 'started' },
      { ...base, sequence: 2, type: 'text_delta', text: 'gap' },
    ];
    let error: unknown;

    try {
      consumer.push(payload(events));
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ code: 'sequence_mismatch' });
  });

  it('rejects actor, trace, or conversation identity changes within one stream', () => {
    const consumer = new AgentStreamConsumer();
    const events: AgentStreamEventV1[] = [
      { ...base, sequence: 0, type: 'started' },
      {
        ...base,
        actorId: 'different-actor',
        sequence: 1,
        type: 'text_delta',
        text: 'mixed stream',
      },
    ];
    let error: unknown;

    try {
      consumer.push(payload(events));
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({ code: 'identity_mismatch' });
  });
});
