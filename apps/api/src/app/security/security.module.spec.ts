import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  FixedWindowRateLimiter,
  createTestPrincipal,
  extractBearerToken,
  hasRequiredPermissions,
  verifyDevelopmentAccessToken,
} from './security.module';

describe('security boundary', () => {
  it('extracts bearer tokens without accepting other authorization schemes', () => {
    expect(extractBearerToken('Bearer access-token')).toBe('access-token');
    expect(extractBearerToken('bearer   spaced-token')).toBe('spaced-token');
    expect(extractBearerToken('Basic credentials')).toBeUndefined();
    expect(extractBearerToken(undefined)).toBeUndefined();
  });

  it('requires every declared permission', () => {
    const principal = createTestPrincipal({
      permissions: ['agent-tasks:read', 'agent-tasks:write'],
    });

    expect(hasRequiredPermissions(principal, ['agent-tasks:read'])).toBe(true);
    expect(
      hasRequiredPermissions(principal, [
        'agent-tasks:read',
        'operations:read',
      ]),
    ).toBe(false);
  });

  it('verifies the deterministic development identity', () => {
    expect(
      verifyDevelopmentAccessToken('configured-token', {
        NODE_ENV: 'test',
        AUTH_DEVELOPMENT_TOKEN: 'configured-token',
        AUTH_DEVELOPMENT_SUBJECT: 'actor-1',
        AUTH_DEVELOPMENT_PERMISSIONS: 'agent-tasks:read, operations:read',
      }),
    ).toEqual({
      subject: 'actor-1',
      permissions: ['agent-tasks:read', 'operations:read'],
    });
  });

  it('rejects invalid and production development tokens', () => {
    expect(() =>
      verifyDevelopmentAccessToken('wrong-token', {
        NODE_ENV: 'test',
        AUTH_DEVELOPMENT_TOKEN: 'configured-token',
      }),
    ).toThrow(UnauthorizedException);
    expect(() =>
      verifyDevelopmentAccessToken('configured-token', {
        NODE_ENV: 'production',
        AUTH_DEVELOPMENT_TOKEN: 'configured-token',
      }),
    ).toThrow(UnauthorizedException);
  });

  it('enforces a fixed request window and resets after expiry', () => {
    const limiter = new FixedWindowRateLimiter(1, 1_000);

    expect(limiter.consume('client', 1_000)).toBeUndefined();
    expect(limiter.consume('client', 1_001)).toEqual({
      count: 2,
      resetAt: 2_000,
    });
    expect(limiter.consume('client', 2_000)).toBeUndefined();
  });
});
