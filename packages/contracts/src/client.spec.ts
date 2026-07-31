import { describe, expect, expectTypeOf, it } from 'vitest';

import { createApiClient } from './generated/client';
import type { GetHealthSuccessResponse } from './generated/server';

describe('generated API client', () => {
  it('calls the generated health operation with a typed response', async () => {
    const requests: Array<{ method: string | undefined; url: string }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      requests.push({ method: init?.method, url: String(input) });
      return new Response(JSON.stringify({ service: 'api', status: 'ok' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      });
    };
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
    });

    const response = await client.getHealth();

    expectTypeOf(response).toEqualTypeOf<GetHealthSuccessResponse>();
    expect(response).toEqual({ service: 'api', status: 'ok' });
    expect(requests).toEqual([
      { method: 'GET', url: 'https://api.example.test/api/health' },
    ]);
  });
});
