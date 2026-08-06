import { UnauthorizedException } from '@nestjs/common';
import {
  generateKeyPairSync,
  sign,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import {
  createOidcDiscoveryUrl,
  createOidcVerifierConfig,
  EnvironmentOidcClaimsMapper,
  OidcAccessTokenVerifier,
  type OidcFetch,
  type OidcVerifierConfig,
} from './oidc-access-token-verifier';

const ISSUER = 'https://identity.example.com/tenant';
const AUDIENCE = 'steadystack-api';
const JWKS_URI = 'https://identity.example.com/tenant/keys';

function keyPair(kid: string): {
  privateKey: KeyObject;
  publicJwk: JsonWebKey;
} {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2_048,
  });
  return {
    privateKey,
    publicJwk: {
      ...publicKey.export({ format: 'jwk' }),
      alg: 'RS256',
      kid,
      use: 'sig',
    } as JsonWebKey,
  };
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createAccessToken(
  privateKey: KeyObject,
  claims: Readonly<Record<string, unknown>>,
  options: { readonly algorithm?: string; readonly kid?: string } = {},
): string {
  const header = encode({
    alg: options.algorithm ?? 'RS256',
    typ: 'at+jwt',
    ...(options.kid ? { kid: options.kid } : {}),
  });
  const payload = encode(claims);
  const signingInput = `${header}.${payload}`;
  const signature = sign(
    'sha256',
    Buffer.from(signingInput, 'ascii'),
    privateKey,
  ).toString('base64url');
  return `${signingInput}.${signature}`;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function config(
  overrides: Partial<OidcVerifierConfig> = {},
): OidcVerifierConfig {
  return {
    issuer: ISSUER,
    audiences: [AUDIENCE],
    allowedAlgorithms: new Set(['RS256']),
    clockSkewSeconds: 60,
    discoveryCacheTtlMs: 60_000,
    jwksCacheTtlMs: 60_000,
    requestTimeoutMs: 1_000,
    ...overrides,
  };
}

function providerFetch(
  keys: readonly JsonWebKey[],
): ReturnType<typeof vi.fn<OidcFetch>> {
  return vi.fn<OidcFetch>(async (input) => {
    const url = input.toString();
    if (url === createOidcDiscoveryUrl(ISSUER).toString()) {
      return jsonResponse({ issuer: ISSUER, jwks_uri: JWKS_URI });
    }
    if (url === JWKS_URI) return jsonResponse({ keys });
    return new Response('{}', { status: 404 });
  });
}

function claims(nowMs: number): Record<string, unknown> {
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    exp: Math.floor(nowMs / 1_000) + 300,
    nbf: Math.floor(nowMs / 1_000) - 30,
    sub: 'actor-1',
    permissions: ['agent-tasks:read'],
  };
}

describe('OIDC access-token verification', () => {
  it('maps an optional configured tenant claim into the principal', () => {
    const mapper = new EnvironmentOidcClaimsMapper({
      AUTH_OIDC_TENANT_CLAIM: 'organization.id',
    });

    expect(
      mapper.map({
        sub: 'actor-1',
        organization: { id: 'tenant-1' },
      }),
    ).toEqual({
      subject: 'actor-1',
      permissions: [],
      tenantId: 'tenant-1',
    });
    expect(() =>
      mapper.map({ sub: 'actor-1', organization: { id: 42 } }),
    ).toThrow(UnauthorizedException);
  });

  it('discovers keys, validates claims, maps identity, and reuses bounded caches', async () => {
    const nowMs = Date.parse('2026-08-02T20:00:00.000Z');
    const pair = keyPair('current-key');
    const fetchImplementation = providerFetch([pair.publicJwk]);
    const verifier = new OidcAccessTokenVerifier(
      config(),
      new EnvironmentOidcClaimsMapper({
        AUTH_OIDC_SUBJECT_CLAIM: 'identity.user',
        AUTH_OIDC_PERMISSIONS_CLAIM: 'roles',
        AUTH_OIDC_SCOPE_CLAIM: 'scp',
      }),
      fetchImplementation,
      () => nowMs,
    );
    const token = createAccessToken(
      pair.privateKey,
      {
        ...claims(nowMs),
        identity: { user: 'oidc-user' },
        roles: ['agent-tasks:read', 'operations:read'],
        scp: 'agent-tasks:write operations:read',
      },
      { kid: 'current-key' },
    );

    await expect(verifier.verify(token)).resolves.toEqual({
      subject: 'oidc-user',
      permissions: ['agent-tasks:read', 'operations:read', 'agent-tasks:write'],
    });
    await expect(verifier.verify(token)).resolves.toEqual(
      expect.objectContaining({ subject: 'oidc-user' }),
    );

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      createOidcDiscoveryUrl(ISSUER),
      expect.objectContaining({ redirect: 'error' }),
    );
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      2,
      new URL(JWKS_URI),
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('forces one JWKS refresh when a rotated key is not cached', async () => {
    const nowMs = Date.parse('2026-08-02T20:00:00.000Z');
    const oldPair = keyPair('old-key');
    const currentPair = keyPair('current-key');
    let keyRequest = 0;
    const fetchImplementation = vi.fn<OidcFetch>(async (input) => {
      const url = input.toString();
      if (url === createOidcDiscoveryUrl(ISSUER).toString()) {
        return jsonResponse({ issuer: ISSUER, jwks_uri: JWKS_URI });
      }
      if (url === JWKS_URI) {
        keyRequest += 1;
        return jsonResponse({
          keys:
            keyRequest === 1 ? [oldPair.publicJwk] : [currentPair.publicJwk],
        });
      }
      return new Response('{}', { status: 404 });
    });
    const verifier = new OidcAccessTokenVerifier(
      config(),
      new EnvironmentOidcClaimsMapper({}),
      fetchImplementation,
      () => nowMs,
    );
    const token = createAccessToken(currentPair.privateKey, claims(nowMs), {
      kid: 'current-key',
    });

    await expect(verifier.verify(token)).resolves.toEqual({
      subject: 'actor-1',
      permissions: ['agent-tasks:read'],
    });
    expect(keyRequest).toBe(2);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it('refreshes discovery and keys after their bounded cache lifetimes', async () => {
    let nowMs = Date.parse('2026-08-02T20:00:00.000Z');
    const pair = keyPair('current-key');
    const fetchImplementation = providerFetch([pair.publicJwk]);
    const verifier = new OidcAccessTokenVerifier(
      config({ discoveryCacheTtlMs: 1_000, jwksCacheTtlMs: 1_000 }),
      new EnvironmentOidcClaimsMapper({}),
      fetchImplementation,
      () => nowMs,
    );
    const token = createAccessToken(pair.privateKey, claims(nowMs), {
      kid: 'current-key',
    });

    await verifier.verify(token);
    nowMs += 1_001;
    await verifier.verify(token);

    expect(fetchImplementation).toHaveBeenCalledTimes(4);
  });

  it.each([
    ['issuer', { iss: 'https://other.example.com' }],
    ['audience', { aud: 'different-api' }],
    ['expiration', { exp: 1 }],
    ['not-before', { nbf: 4_000_000_000 }],
  ])('rejects an invalid %s claim', async (_name, claimOverride) => {
    const nowMs = Date.parse('2026-08-02T20:00:00.000Z');
    const pair = keyPair('current-key');
    const verifier = new OidcAccessTokenVerifier(
      config({ clockSkewSeconds: 0 }),
      new EnvironmentOidcClaimsMapper({}),
      providerFetch([pair.publicJwk]),
      () => nowMs,
    );
    const token = createAccessToken(
      pair.privateKey,
      { ...claims(nowMs), ...claimOverride },
      { kid: 'current-key' },
    );

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects algorithms outside the configured allowlist before fetching keys', async () => {
    const nowMs = Date.parse('2026-08-02T20:00:00.000Z');
    const pair = keyPair('current-key');
    const fetchImplementation = providerFetch([pair.publicJwk]);
    const verifier = new OidcAccessTokenVerifier(
      config({ allowedAlgorithms: new Set(['PS256']) }),
      new EnvironmentOidcClaimsMapper({}),
      fetchImplementation,
      () => nowMs,
    );
    const token = createAccessToken(pair.privateKey, claims(nowMs), {
      kid: 'current-key',
    });

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it('rejects mismatched discovery metadata', async () => {
    const nowMs = Date.parse('2026-08-02T20:00:00.000Z');
    const pair = keyPair('current-key');
    const fetchImplementation = vi.fn<OidcFetch>(async () =>
      jsonResponse({
        issuer: 'https://unexpected.example.com',
        jwks_uri: JWKS_URI,
      }),
    );
    const verifier = new OidcAccessTokenVerifier(
      config(),
      new EnvironmentOidcClaimsMapper({}),
      fetchImplementation,
      () => nowMs,
    );
    const token = createAccessToken(pair.privateKey, claims(nowMs), {
      kid: 'current-key',
    });

    await expect(verifier.verify(token)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'identity_provider_unavailable',
      }),
    });
  });

  it('validates configuration bounds and issuer discovery paths', () => {
    expect(createOidcDiscoveryUrl(ISSUER).toString()).toBe(
      'https://identity.example.com/tenant/.well-known/openid-configuration',
    );
    expect(
      createOidcVerifierConfig({
        AUTH_OIDC_ISSUER: ISSUER,
        AUTH_OIDC_AUDIENCE: `${AUDIENCE},second-api`,
        AUTH_OIDC_ALLOWED_ALGORITHMS: 'RS256,PS256',
        AUTH_OIDC_CLOCK_SKEW_SECONDS: '30',
      }),
    ).toEqual(
      expect.objectContaining({
        issuer: ISSUER,
        audiences: [AUDIENCE, 'second-api'],
        allowedAlgorithms: new Set(['RS256', 'PS256']),
        clockSkewSeconds: 30,
      }),
    );
    expect(() =>
      createOidcVerifierConfig({
        AUTH_OIDC_ISSUER: 'http://identity.example.com',
        AUTH_OIDC_AUDIENCE: AUDIENCE,
      }),
    ).toThrow('AUTH_OIDC_ISSUER must be an absolute HTTPS URL.');
    expect(() =>
      createOidcVerifierConfig({
        AUTH_OIDC_ISSUER: ISSUER,
        AUTH_OIDC_AUDIENCE: AUDIENCE,
        AUTH_OIDC_ALLOWED_ALGORITHMS: 'none',
      }),
    ).toThrow('Unsupported OIDC access-token algorithm: none.');
    expect(() =>
      createOidcVerifierConfig({
        AUTH_OIDC_ISSUER: ISSUER,
        AUTH_OIDC_AUDIENCE: AUDIENCE,
        AUTH_OIDC_JWKS_CACHE_TTL_MS: '3600001',
      }),
    ).toThrow('Expected an integer between 1000 and 3600000');
  });
});
