import {
  type ArgumentsHost,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  createEnvironmentAccessTokenVerifier,
  createTestPrincipal,
  extractBearerToken,
  hasRequiredPermissions,
  NormalizedHttpExceptionFilter,
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

  it('preserves normalized field errors in HTTP error responses', () => {
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status, json }) }),
    } as unknown as ArgumentsHost;

    new NormalizedHttpExceptionFilter().catch(
      new BadRequestException({
        code: 'validation_failed',
        message: 'Request validation failed.',
        fields: [
          {
            location: 'body',
            path: 'title',
            code: 'too_small',
            message: 'Too small',
          },
        ],
      }),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'validation_failed',
        fields: [expect.objectContaining({ location: 'body', path: 'title' })],
      }),
    );
  });
});
