import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  FixedWindowRateLimiter,
  createEnvironmentAccessTokenVerifier,
  createRateLimitKey,
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

  it('rejects oversized authorization headers without regular-expression work', () => {
    expect(
      extractBearerToken(`Bearer ${' '.repeat(8_192)}token`),
    ).toBeUndefined();
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

  it('keeps development verification behind the shared verifier interface', async () => {
    const verifier = createEnvironmentAccessTokenVerifier({
      NODE_ENV: 'test',
      AUTH_ACCESS_TOKEN_VERIFIER: 'development',
      AUTH_DEVELOPMENT_TOKEN: 'configured-token',
      AUTH_DEVELOPMENT_SUBJECT: 'actor-1',
      AUTH_DEVELOPMENT_PERMISSIONS: 'agent-tasks:read',
    });

    await expect(verifier.verify('configured-token')).resolves.toEqual({
      subject: 'actor-1',
      permissions: ['agent-tasks:read'],
    });
  });

  it('defaults production to OIDC and rejects unsupported verifier modes', () => {
    expect(() =>
      createEnvironmentAccessTokenVerifier({ NODE_ENV: 'production' }),
    ).toThrow('AUTH_OIDC_ISSUER is required for OIDC verification.');
    expect(() =>
      createEnvironmentAccessTokenVerifier({
        NODE_ENV: 'test',
        AUTH_ACCESS_TOKEN_VERIFIER: 'unsupported',
      }),
    ).toThrow(
      'AUTH_ACCESS_TOKEN_VERIFIER must be development or oidc, received unsupported.',
    );
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

  it('uses a stable client identity across changing methods and URLs', () => {
    const firstRequest = {
      socket: { remoteAddress: '203.0.113.10' },
      method: 'GET',
      url: '/api/agent-tasks?nonce=1',
    };
    const secondRequest = {
      socket: { remoteAddress: '203.0.113.10' },
      method: 'POST',
      url: '/api/agent-tasks?nonce=2',
    };

    expect(createRateLimitKey(firstRequest)).toBe('ip:203.0.113.10');
    expect(createRateLimitKey(secondRequest)).toBe('ip:203.0.113.10');
  });

  it('prefers the authenticated subject when one is available', () => {
    expect(
      createRateLimitKey({
        principal: { subject: 'actor-1' },
        socket: { remoteAddress: '203.0.113.10' },
      }),
    ).toBe('subject:actor-1');
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

  it('strictly bounds stored client buckets under identity churn', () => {
    const limiter = new FixedWindowRateLimiter(10, 60_000, 2);

    limiter.consume('client-1', 1_000);
    limiter.consume('client-2', 1_000);
    limiter.consume('client-3', 1_000);

    expect(limiter.bucketCount).toBe(2);
    expect(limiter.consume('client-1', 1_001)).toBeUndefined();
    expect(limiter.bucketCount).toBe(2);
  });
});
