import 'reflect-metadata';

import { InMemoryRateLimitStore } from '@agentic-webapp/backend-rate-limit';
import {
  HttpException,
  HttpStatus,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  generateKeyPairSync,
  sign,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  createOidcDiscoveryUrl,
  EnvironmentOidcClaimsMapper,
  OidcAccessTokenVerifier,
  type OidcFetch,
  type OidcVerifierConfig,
} from './oidc-access-token-verifier';
import { EnvironmentRateLimitProvider } from './rate-limit-provider';
import {
  AuthenticationGuard,
  AuthorizationGuard,
  type AccessTokenVerifier,
  type AuthenticatedPrincipal,
  RateLimitGuard,
  RequirePermissions,
} from './security.module';

const ISSUER = 'https://identity.example.com/tenant';
const AUDIENCE = 'agentic-api';
const JWKS_URI = 'https://identity.example.com/tenant/keys';
const NOW_MS = Date.parse('2026-08-03T20:00:00.000Z');

interface SigningKey {
  readonly privateKey: KeyObject;
  readonly publicJwk: JsonWebKey;
}

interface ProviderState {
  readonly fetch: OidcFetch;
  readonly keyRequests: () => number;
}

interface IntegrationResponse {
  readonly headers: ReadonlyMap<string, string>;
  readonly principal: AuthenticatedPrincipal;
}

class SecurityVerificationController {
  public read(): { readonly ok: true } {
    return { ok: true };
  }
}

const readDescriptor = Object.getOwnPropertyDescriptor(
  SecurityVerificationController.prototype,
  'read',
);
if (!readDescriptor) throw new Error('Security verification route is missing.');
RequirePermissions('agent-tasks:read')(
  SecurityVerificationController.prototype,
  'read',
  readDescriptor,
);

function createSigningKey(kid: string): SigningKey {
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
  key: SigningKey,
  claims: Readonly<Record<string, unknown>>,
): string {
  const header = encode({
    alg: 'RS256',
    kid: key.publicJwk.kid,
    typ: 'at+jwt',
  });
  const payload = encode(claims);
  const signingInput = `${header}.${payload}`;
  const signature = sign(
    'sha256',
    Buffer.from(signingInput, 'ascii'),
    key.privateKey,
  ).toString('base64url');
  return `${signingInput}.${signature}`;
}

function validClaims(
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    iss: ISSUER,
    aud: AUDIENCE,
    exp: Math.floor(NOW_MS / 1_000) + 300,
    nbf: Math.floor(NOW_MS / 1_000) - 30,
    sub: 'actor-1',
    permissions: ['agent-tasks:read'],
    tenant_id: 'tenant-1',
    ...overrides,
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function provider(keySets: readonly (readonly JsonWebKey[])[]): ProviderState {
  let keyRequestCount = 0;
  return {
    fetch: async (input) => {
      const url = input.toString();
      if (url === createOidcDiscoveryUrl(ISSUER).toString()) {
        return jsonResponse({ issuer: ISSUER, jwks_uri: JWKS_URI });
      }
      if (url === JWKS_URI) {
        const index = Math.min(keyRequestCount, keySets.length - 1);
        keyRequestCount += 1;
        return jsonResponse({ keys: keySets[index] ?? [] });
      }
      return new Response('{}', { status: 404 });
    },
    keyRequests: () => keyRequestCount,
  };
}

function verifier(providerState: ProviderState): AccessTokenVerifier {
  const config: OidcVerifierConfig = {
    issuer: ISSUER,
    audiences: [AUDIENCE],
    allowedAlgorithms: new Set(['RS256']),
    clockSkewSeconds: 0,
    discoveryCacheTtlMs: 60_000,
    jwksCacheTtlMs: 60_000,
    requestTimeoutMs: 1_000,
  };
  return new OidcAccessTokenVerifier(
    config,
    new EnvironmentOidcClaimsMapper({ AUTH_OIDC_TENANT_CLAIM: 'tenant_id' }),
    providerState.fetch,
    () => NOW_MS,
  );
}

function createContext(accessToken: string): {
  readonly context: ExecutionContext;
  readonly headers: ReadonlyMap<string, string>;
  readonly request: { principal?: AuthenticatedPrincipal };
} {
  const headers = new Map<string, string>();
  const request = {
    headers: { authorization: `Bearer ${accessToken}` },
    method: 'GET',
    originalUrl: '/security-verification/read',
    route: { path: '/security-verification/read' },
    socket: { remoteAddress: '203.0.113.10' },
  } as {
    headers: { authorization: string };
    method: string;
    originalUrl: string;
    route: { path: string };
    socket: { remoteAddress: string };
    principal?: AuthenticatedPrincipal;
  };
  const response = {
    setHeader(name: string, value: unknown) {
      headers.set(name.toLowerCase(), String(value));
      return response;
    },
  };
  const context = {
    getClass: () => SecurityVerificationController,
    getHandler: () => SecurityVerificationController.prototype.read,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, headers, request };
}

function guards(
  accessTokenVerifier: AccessTokenVerifier,
  authenticatedLimit = 100,
): {
  readonly authenticate: AuthenticationGuard;
  readonly authorize: AuthorizationGuard;
  readonly limit: RateLimitGuard;
} {
  const reflector = new Reflector();
  const configuration = {
    anonymousLimit: 100,
    authenticatedLimit,
    routeLimit: 100,
    tenantLimit: 100,
    windowMs: 60_000,
  };
  return {
    authenticate: new AuthenticationGuard(reflector, accessTokenVerifier),
    authorize: new AuthorizationGuard(reflector),
    limit: new RateLimitGuard(
      reflector,
      { configuration } as EnvironmentRateLimitProvider,
      new InMemoryRateLimitStore(),
    ),
  };
}

async function runRequest(
  pipeline: ReturnType<typeof guards>,
  accessToken: string,
): Promise<IntegrationResponse> {
  const { context, headers, request } = createContext(accessToken);
  await pipeline.authenticate.canActivate(context);
  await pipeline.limit.canActivate(context);
  pipeline.authorize.canActivate(context);
  if (!request.principal) throw new Error('Authentication did not set a principal.');
  return { headers, principal: request.principal };
}

async function expectHttpError(
  request: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  try {
    await request;
    throw new Error(`Expected HTTP ${status}.`);
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const httpError = error as HttpException;
    expect(httpError.getStatus()).toBe(status);
    expect(httpError.getResponse()).toMatchObject({ code });
  }
}

describe('security guard integration', () => {
  it('rejects expired, wrong-issuer, and wrong-audience access tokens', async () => {
    const signingKey = createSigningKey('current-key');
    const pipeline = guards(verifier(provider([[signingKey.publicJwk]])));

    for (const claims of [
      validClaims({ exp: Math.floor(NOW_MS / 1_000) - 1 }),
      validClaims({ iss: 'https://unexpected.example.com/tenant' }),
      validClaims({ aud: 'different-api' }),
    ]) {
      await expectHttpError(
        runRequest(pipeline, createAccessToken(signingKey, claims)),
        HttpStatus.UNAUTHORIZED,
        'invalid_access_token',
      );
    }
  });

  it('refreshes JWKS once when a provider rotates signing keys', async () => {
    const oldKey = createSigningKey('old-key');
    const currentKey = createSigningKey('current-key');
    const providerState = provider([
      [oldKey.publicJwk],
      [currentKey.publicJwk],
    ]);
    const pipeline = guards(verifier(providerState));

    await expect(
      runRequest(pipeline, createAccessToken(oldKey, validClaims())),
    ).resolves.toMatchObject({ principal: { subject: 'actor-1' } });
    await expect(
      runRequest(pipeline, createAccessToken(currentKey, validClaims())),
    ).resolves.toMatchObject({ principal: { subject: 'actor-1' } });
    expect(providerState.keyRequests()).toBe(2);
  });

  it('denies a valid identity that lacks the route permission', async () => {
    const signingKey = createSigningKey('current-key');
    const pipeline = guards(verifier(provider([[signingKey.publicJwk]])));

    await expectHttpError(
      runRequest(
        pipeline,
        createAccessToken(
          signingKey,
          validClaims({ permissions: ['operations:read'] }),
        ),
      ),
      HttpStatus.FORBIDDEN,
      'insufficient_permissions',
    );
  });

  it('enforces the authenticated rate limit without sharing counters between subjects', async () => {
    const signingKey = createSigningKey('current-key');
    const pipeline = guards(verifier(provider([[signingKey.publicJwk]])), 1);
    const firstToken = createAccessToken(signingKey, validClaims());

    await expect(runRequest(pipeline, firstToken)).resolves.toMatchObject({
      principal: { subject: 'actor-1' },
    });
    try {
      await runRequest(pipeline, firstToken);
      throw new Error('Expected the authenticated rate limit to reject.');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const httpError = error as HttpException;
      expect(httpError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(httpError.getResponse()).toMatchObject({
        code: 'rate_limit_exceeded',
      });
    }

    const secondSubject = createAccessToken(
      signingKey,
      validClaims({ sub: 'actor-2' }),
    );
    const secondResponse = await runRequest(pipeline, secondSubject);
    expect(secondResponse.principal.subject).toBe('actor-2');
  });
});
