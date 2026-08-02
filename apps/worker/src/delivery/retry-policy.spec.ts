import { describe, expect, it } from 'vitest';

import {
  calculateRetryDelayMs,
  defaultRetryPolicy,
  validateRetryPolicy,
} from './retry-policy';

describe('retry policy', () => {
  it('uses capped exponential backoff with bounded jitter', () => {
    expect(calculateRetryDelayMs(1, defaultRetryPolicy, () => 0)).toBe(500);
    expect(calculateRetryDelayMs(2, defaultRetryPolicy, () => 0)).toBe(1_000);
    expect(calculateRetryDelayMs(3, defaultRetryPolicy, () => 1)).toBe(4_000);
    expect(calculateRetryDelayMs(20, defaultRetryPolicy, () => 1)).toBe(
      60_000,
    );
    expect(calculateRetryDelayMs(20, defaultRetryPolicy, () => 0)).toBe(
      30_000,
    );
  });

  it('rejects invalid policy and random values', () => {
    expect(() =>
      validateRetryPolicy({
        ...defaultRetryPolicy,
        maxDelayMs: defaultRetryPolicy.baseDelayMs - 1,
      }),
    ).toThrow('maxDelayMs');
    expect(() =>
      calculateRetryDelayMs(1, defaultRetryPolicy, () => 2),
    ).toThrow('random');
  });
});
