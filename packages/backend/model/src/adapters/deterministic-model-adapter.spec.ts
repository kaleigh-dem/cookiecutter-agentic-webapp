import { describe, expect, it } from 'vitest';

import { DeterministicModelAdapter } from './deterministic-model-adapter';

describe('DeterministicModelAdapter', () => {
  const adapter = new DeterministicModelAdapter({
    generationText: 'fixture response',
    structuredValue: { answer: 'fixture' },
    embeddings: [
      [0.1, 0.2],
      [0.3, 0.4],
    ],
    streamTextChunks: ['fixture ', 'response'],
    usage: {
      inputTokens: 3,
      outputTokens: 2,
      totalTokens: 5,
      cachedInputTokens: 1,
    },
  });

  it('returns deterministic generation, structured output, embeddings, and stream events', async () => {
    const generation = await adapter.generate({
      model: 'fixture-model',
      messages: [{ role: 'user', content: 'ignored by fixture' }],
    });
    expect(generation).toEqual({
      provider: 'deterministic',
      model: 'fixture-model',
      text: 'fixture response',
      finishReason: 'stop',
      usage: {
        inputTokens: 3,
        outputTokens: 2,
        totalTokens: 5,
        cachedInputTokens: 1,
      },
    });

    const structured = await adapter.generateStructured({
      model: 'fixture-model',
      messages: [{ role: 'user', content: 'return JSON' }],
      schemaName: 'answer',
      schema: {
        type: 'object',
        properties: { answer: { type: 'string' } },
        required: ['answer'],
        additionalProperties: false,
      },
      parse: (value) => {
        const answer = (value as { answer?: unknown }).answer;
        if (typeof answer !== 'string') throw new Error('answer required');
        return { answer };
      },
    });
    expect(structured.value).toEqual({ answer: 'fixture' });
    expect(structured.rawText).toBe('{"answer":"fixture"}');

    const embeddings = await adapter.embed({
      model: 'fixture-embedding-model',
      inputs: ['one', 'two'],
    });
    expect(embeddings.embeddings).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);

    const events = [];
    for await (const event of adapter.stream({
      model: 'fixture-model',
      messages: [{ role: 'user', content: 'stream' }],
    })) {
      events.push(event);
    }
    expect(events.map((event) => event.type)).toEqual([
      'text_delta',
      'text_delta',
      'usage',
      'completed',
    ]);
    expect(events[0]).toMatchObject({ text: 'fixture ' });
    expect(events[1]).toMatchObject({ text: 'response' });
  });

  it('surfaces fixture shape errors through the normalized error contract', async () => {
    const invalid = new DeterministicModelAdapter({
      generationText: 'unused',
      structuredValue: null,
      embeddings: [],
    });

    await expect(
      invalid.embed({ model: 'fixture', inputs: ['one'] }),
    ).rejects.toMatchObject({
      code: 'invalid_response',
      provider: 'deterministic',
      retryable: false,
    });
  });
});
