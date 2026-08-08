import { describe, expect, it } from 'vitest';

import { ModelError, executeModelOperation } from './model';

describe('model execution policy', () => {
  it('retries normalized retryable errors with bounded exponential delays', async () => {
    const attempts: number[] = [];
    const delays: number[] = [];

    const result = await executeModelOperation(
      {
        timeoutMs: 100,
        retry: { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 20 },
      },
      async ({ attempt }) => {
        attempts.push(attempt);
        if (attempt < 3) {
          throw new ModelError('try again', {
            code: 'rate_limited',
            retryable: true,
          });
        }
        return 'complete';
      },
      {
        sleep: async (milliseconds) => {
          delays.push(milliseconds);
        },
      },
    );

    expect(result).toBe('complete');
    expect(attempts).toEqual([1, 2, 3]);
    expect(delays).toEqual([10, 20]);
  });

  it('normalizes an operation timeout and does not retry when limited to one attempt', async () => {
    await expect(
      executeModelOperation(
        {
          timeoutMs: 5,
          retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
        },
        ({ signal }) =>
          new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new Error('transport aborted')),
              { once: true },
            );
          }),
      ),
    ).rejects.toMatchObject({ code: 'timeout', retryable: true });
  });

  it('fails immediately when the caller has already cancelled the request', async () => {
    const controller = new AbortController();
    controller.abort('cancelled by caller');
    let invoked = false;

    await expect(
      executeModelOperation({ signal: controller.signal }, async () => {
        invoked = true;
      }),
    ).rejects.toMatchObject({ code: 'aborted', retryable: false });
    expect(invoked).toBe(false);
  });

  it('rejects invalid retry configuration before invoking a provider', async () => {
    await expect(
      executeModelOperation(
        {
          retry: { maxAttempts: 2, baseDelayMs: 20, maxDelayMs: 10 },
        },
        async () => 'unused',
      ),
    ).rejects.toMatchObject({ code: 'invalid_request' });
  });
});
