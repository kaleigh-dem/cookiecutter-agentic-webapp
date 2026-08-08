import { describe, expect, it } from 'vitest';

import type { ModelStreamEvent } from '../lib/model';
import { OpenAIModelAdapter } from './openai-model-adapter';

function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('content-type', 'application/json');
  return new Response(JSON.stringify(value), {
    status,
    headers: responseHeaders,
  });
}

const generationRequest = {
  model: 'gpt-test',
  messages: [{ role: 'user' as const, content: 'hello' }],
};

describe('OpenAIModelAdapter', () => {
  it('normalizes generation usage and retries retryable provider failures', async () => {
    let calls = 0;
    const delays: number[] = [];
    let capturedUrl = '';
    let capturedBody: unknown;
    let capturedAuthorization: string | null = null;
    const fetchMock: typeof fetch = async (input, init) => {
      calls += 1;
      capturedUrl = String(input);
      capturedAuthorization = new Headers(init?.headers).get('authorization');
      capturedBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      if (calls === 1) {
        return jsonResponse(
          { error: { message: 'rate limited' } },
          429,
          { 'retry-after': '0.01' },
        );
      }
      return jsonResponse({
        model: 'gpt-test-2026-08-07',
        choices: [
          {
            finish_reason: 'stop',
            message: { content: 'hello back' },
          },
        ],
        usage: {
          prompt_tokens: 4,
          completion_tokens: 2,
          total_tokens: 6,
          prompt_tokens_details: { cached_tokens: 1 },
        },
      });
    };
    const adapter = new OpenAIModelAdapter({
      apiKey: 'secret',
      fetch: fetchMock,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });

    const result = await adapter.generate({
      ...generationRequest,
      retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 5 },
    });

    expect(calls).toBe(2);
    expect(delays).toEqual([5]);
    expect(capturedUrl).toBe('https://api.openai.com/v1/chat/completions');
    expect(capturedAuthorization).toBe('Bearer secret');
    expect(capturedBody).toMatchObject({ model: 'gpt-test' });
    expect(result).toEqual({
      provider: 'openai',
      model: 'gpt-test-2026-08-07',
      text: 'hello back',
      finishReason: 'stop',
      usage: {
        inputTokens: 4,
        outputTokens: 2,
        totalTokens: 6,
        cachedInputTokens: 1,
      },
    });
  });

  it('uses JSON Schema structured output and validates application values', async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchMock: typeof fetch = async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({
        model: 'gpt-test',
        choices: [
          {
            finish_reason: 'stop',
            message: { content: '{"answer":"yes"}' },
          },
        ],
        usage: {
          prompt_tokens: 3,
          completion_tokens: 2,
          total_tokens: 5,
        },
      });
    };
    const adapter = new OpenAIModelAdapter({
      apiKey: 'secret',
      fetch: fetchMock,
    });

    const result = await adapter.generateStructured({
      ...generationRequest,
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

    expect(capturedBody?.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'answer',
        strict: true,
        schema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
          additionalProperties: false,
        },
      },
    });
    expect(result.value).toEqual({ answer: 'yes' });
    expect(result.rawText).toBe('{"answer":"yes"}');
  });

  it('normalizes embeddings in input order', async () => {
    const fetchMock: typeof fetch = async () =>
      jsonResponse({
        model: 'text-embedding-test',
        data: [
          { index: 1, embedding: [0.3, 0.4] },
          { index: 0, embedding: [0.1, 0.2] },
        ],
        usage: { prompt_tokens: 7, total_tokens: 7 },
      });
    const adapter = new OpenAIModelAdapter({
      apiKey: 'secret',
      fetch: fetchMock,
    });

    const result = await adapter.embed({
      model: 'text-embedding-test',
      inputs: ['first', 'second'],
    });

    expect(result.embeddings).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(result.usage).toEqual({
      inputTokens: 7,
      outputTokens: 0,
      totalTokens: 7,
    });
  });

  it('translates provider SSE into provider-neutral stream events', async () => {
    const stream = [
      'data: {"model":"gpt-test","choices":[{"delta":{"content":"Hel"},"finish_reason":null}]}',
      '',
      'data: {"model":"gpt-test","choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}]}',
      '',
      'data: {"model":"gpt-test","choices":[],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n');
    const fetchMock: typeof fetch = async () =>
      new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    const adapter = new OpenAIModelAdapter({
      apiKey: 'secret',
      fetch: fetchMock,
    });
    const events: ModelStreamEvent[] = [];

    for await (const event of adapter.stream(generationRequest)) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: 'text_delta',
        provider: 'openai',
        model: 'gpt-test',
        text: 'Hel',
      },
      {
        type: 'text_delta',
        provider: 'openai',
        model: 'gpt-test',
        text: 'lo',
      },
      {
        type: 'usage',
        provider: 'openai',
        model: 'gpt-test',
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
      },
      {
        type: 'completed',
        provider: 'openai',
        model: 'gpt-test',
        finishReason: 'stop',
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
      },
    ]);
  });

  it('maps non-retryable provider authentication failures', async () => {
    const fetchMock: typeof fetch = async () =>
      jsonResponse({ error: { message: 'invalid key' } }, 401);
    const adapter = new OpenAIModelAdapter({
      apiKey: 'secret',
      fetch: fetchMock,
    });

    await expect(adapter.generate(generationRequest)).rejects.toMatchObject({
      code: 'authentication',
      provider: 'openai',
      retryable: false,
      status: 401,
    });
  });
});
