import { describe, expect, it } from 'vitest';

import { OpenAIModelAdapter } from './openai-model-adapter';

const generationRequest = {
  model: 'gpt-test',
  messages: [{ role: 'user' as const, content: 'hello' }],
};

describe('OpenAIModelAdapter usage validation', () => {
  it('rejects generation usage when total_tokens is missing', async () => {
    const fetchMock: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          model: 'gpt-test',
          choices: [
            {
              finish_reason: 'stop',
              message: { content: 'hello back' },
            },
          ],
          usage: {
            prompt_tokens: 4,
            completion_tokens: 2,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    const adapter = new OpenAIModelAdapter({
      apiKey: 'secret',
      fetch: fetchMock,
    });

    await expect(adapter.generate(generationRequest)).rejects.toMatchObject({
      code: 'invalid_response',
      provider: 'openai',
      retryable: false,
    });
  });
});
