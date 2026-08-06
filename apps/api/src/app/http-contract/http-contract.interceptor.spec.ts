import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';
import { createAgentTaskHttpContract } from '@steadystack/contracts/runtime';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { HttpContractInterceptor } from './http-contract.interceptor';

function executionContext(
  request: Record<string, unknown>,
  statusCode = 201,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ statusCode }),
    }),
  } as unknown as ExecutionContext;
}

function handle(value: unknown): CallHandler {
  return { handle: () => of(value) };
}

const validRequest = {
  body: { title: 'Summarize', prompt: 'Summarize the document.' },
  headers: { 'x-correlation-id': 'correlation-1' },
  params: {},
  query: {},
};

const validResponse = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Summarize',
  prompt: 'Summarize the document.',
  status: 'queued',
  correlationId: 'correlation-1',
  createdAt: '2026-08-03T12:00:00.000Z',
};

describe('HttpContractInterceptor', () => {
  const interceptor = new HttpContractInterceptor(createAgentTaskHttpContract);

  it.each([
    ['malformed', { title: '', prompt: 'valid' }, 'title'],
    ['oversized', { title: 'valid', prompt: 'x'.repeat(4_001) }, 'prompt'],
    [
      'unknown-field',
      { title: 'valid', prompt: 'valid', administrator: true },
      'administrator',
    ],
  ])('rejects %s request bodies with field-level errors', (_, body, path) => {
    expect.assertions(3);
    try {
      interceptor.intercept(
        executionContext({ ...validRequest, body }),
        handle(validResponse),
      );
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse();
      expect(response).toMatchObject({
        code: 'validation_failed',
        fields: [expect.objectContaining({ location: 'body', path })],
      });
      expect(response).toMatchObject({ message: 'Request validation failed.' });
    }
  });

  it('rejects undeclared query parameters', () => {
    expect(() =>
      interceptor.intercept(
        executionContext({ ...validRequest, query: { debug: 'true' } }),
        handle(validResponse),
      ),
    ).toThrow(BadRequestException);
  });

  it('passes valid responses through the generated response schema', async () => {
    await expect(
      lastValueFrom(
        interceptor.intercept(
          executionContext(validRequest),
          handle(validResponse),
        ),
      ),
    ).resolves.toEqual(validResponse);
  });

  it('fails closed when a handler produces an invalid response', async () => {
    await expect(
      lastValueFrom(
        interceptor.intercept(
          executionContext(validRequest),
          handle({ ...validResponse, internalOnly: true }),
        ),
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
