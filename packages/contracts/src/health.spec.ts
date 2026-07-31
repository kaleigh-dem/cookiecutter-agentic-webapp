import { describe, expect, it } from 'vitest';
import { isHealthResponse } from './index';

describe('isHealthResponse', () => {
  it('accepts the public API health shape', () => {
    expect(isHealthResponse({ service: 'api', status: 'ok' })).toBe(true);
  });

  it('rejects unrelated values', () => {
    expect(isHealthResponse({ status: 'down' })).toBe(false);
  });
});
