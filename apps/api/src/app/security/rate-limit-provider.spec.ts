import { describe, expect, it } from 'vitest';

import {
  createRateLimitConfiguration,
  parseTrustedProxyHops,
  resolveClientIp,
  resolveRateLimitStoreMode,
} from './rate-limit-provider';

describe('rate-limit environment', () => {
  it('defaults production to PostgreSQL and development to memory', () => {
    expect(resolveRateLimitStoreMode({ NODE_ENV: 'production' })).toBe(
      'postgres',
    );
    expect(resolveRateLimitStoreMode({ NODE_ENV: 'development' })).toBe(
      'memory',
    );
  });

  it('rejects the process-local store in production', () => {
    expect(() =>
      resolveRateLimitStoreMode({
        NODE_ENV: 'production',
        API_RATE_LIMIT_STORE: 'memory',
      }),
    ).toThrow('cannot run in production');
  });

  it('validates proxy hops and layered limits', () => {
    expect(parseTrustedProxyHops({ API_TRUSTED_PROXY_HOPS: '2' })).toBe(2);
    expect(() =>
      parseTrustedProxyHops({ API_TRUSTED_PROXY_HOPS: '-1' }),
    ).toThrow();
    expect(
      createRateLimitConfiguration({
        API_RATE_LIMIT_ANONYMOUS_MAX: '10',
        API_RATE_LIMIT_AUTHENTICATED_MAX: '20',
        API_RATE_LIMIT_ROUTE_MAX: '5',
        API_RATE_LIMIT_TENANT_MAX: '100',
        API_RATE_LIMIT_WINDOW_MS: '1000',
      }),
    ).toEqual({
      anonymousLimit: 10,
      authenticatedLimit: 20,
      routeLimit: 5,
      tenantLimit: 100,
      windowMs: 1_000,
    });
  });

  it('uses only the client address resolved by the configured Express proxy trust', () => {
    expect(
      resolveClientIp({
        ip: '203.0.113.10',
        socket: { remoteAddress: '10.0.0.8' },
      }),
    ).toBe('203.0.113.10');
    expect(resolveClientIp({ socket: { remoteAddress: '10.0.0.8' } })).toBe(
      '10.0.0.8',
    );
  });
});
