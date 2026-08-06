import { describe, expect, it, vi } from 'vitest';

import {
  EnvironmentOidcClaimsMapper,
  OidcAccessTokenVerifier,
  type OidcFetch,
  type OidcVerifierConfig,
} from './oidc-access-token-verifier';

const ISSUER = 'https://identity.example.com/tenant';
const JWKS_URI = `${ISSUER}/keys`;

function accessToken(): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString(
    'base64url',
  );
  const payload = Buffer.from(JSON.stringify({})).toString('base64url');
  return `${header}.${payload}.AA`;
}

function config(): OidcVerifierConfig {
  return {
    issuer: ISSUER,
    audiences: ['steadystack-api'],
    allowedAlgorithms: new Set(['RS256']),
    clockSkewSeconds: 60,
    discoveryCacheTtlMs: 60_000,
    jwksCacheTtlMs: 60_000,
    requestTimeoutMs: 1_000,
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('OIDC provider metadata validation', () => {
  it.each([
    ['malformed', 'not a URL'],
    ['non-HTTPS', 'http://identity.example.com/tenant/keys'],
  ])(
    'maps a %s discovery jwks_uri to identity_provider_unavailable',
    async (_case, jwksUri) => {
      const fetchImplementation = vi.fn<OidcFetch>(async () =>
        jsonResponse({ issuer: ISSUER, jwks_uri: jwksUri }),
      );
      const verifier = new OidcAccessTokenVerifier(
        config(),
        new EnvironmentOidcClaimsMapper({}),
        fetchImplementation,
      );

      await expect(verifier.verify(accessToken())).rejects.toMatchObject({
        status: 503,
        response: expect.objectContaining({
          code: 'identity_provider_unavailable',
        }),
      });
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
    },
  );

  it('maps malformed JWKS contents to identity_provider_unavailable', async () => {
    const fetchImplementation = vi.fn<OidcFetch>(async (input) => {
      const url = input.toString();
      if (url.endsWith('/.well-known/openid-configuration')) {
        return jsonResponse({ issuer: ISSUER, jwks_uri: JWKS_URI });
      }
      if (url === JWKS_URI) return jsonResponse({ keys: [{}] });
      return new Response('{}', { status: 404 });
    });
    const verifier = new OidcAccessTokenVerifier(
      config(),
      new EnvironmentOidcClaimsMapper({}),
      fetchImplementation,
    );

    await expect(verifier.verify(accessToken())).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({
        code: 'identity_provider_unavailable',
      }),
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });
});
