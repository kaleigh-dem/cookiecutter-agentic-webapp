import { InMemoryRateLimitStore } from '@agentic-webapp/backend-rate-limit';
import { Controller, Get, type INestApplication, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, NestFactory } from '@nestjs/core';
import {
  generateKeyPairSync,
  sign,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto';
import type { Server } from 'node:http';
import { describe, expect, it } from 'vitest';

import {
  createOidcDiscoveryUrl,
  EnvironmentOidcClaimsMapper,
  OidcAccessTokenVerifier,
  type OidcFetch,
  type OidcVerifierConfig,
} from './oidc-access-token-verifier';
import {
  EnvironmentRateLimitProvider,
  RATE_LIMIT_STORE,
} from './rate-limit-provider';
import {
  ACCESS_TOKEN_VERIFIER,
  AuthenticationGuard,
  AuthorizationGuard,
  type AccessTokenVerifier,
  NormalizedHttpExceptionFilter,
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

interface RunningApplication {
  readonly app: INestApplication;
  readonly baseUrl: string;
}

interface ProviderState {
  readonly fetch: OidcFetch;
  readonly keyRequests: () => number;
}

class SecurityVerificationController {
  public read(): { readonly ok: true } {
    return { ok: true };
  }
}

Controller('security-verification')(SecurityVerificationController);
const readDescriptor = Object.getOwnPropertyDescriptor(
  SecurityVerificationController.prototype,
  'read',
);
if (!readDescriptor) throw new Error('Security verification route is missing.');
Get('read')(
  SecurityVerificationController.prototype,
  'read',
  readDescriptor,
);
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

async function startApplication(
  accessTokenVerifier: AccessTokenVerifier,
  authenticatedLimit = 100,
): Promise<RunningApplication> {
  class SecurityIntegrationModule {}
  Module({
    controllers: [SecurityVerificationController],
    providers: [
      {
        provide: ACCESS_TOKEN_VERIFIER,
        useValue: accessTokenVerifier,
      },
      {
        provide: EnvironmentRateLimitProvider,
        useValue: {
          configuration: {
            anonymousLimit: 100,
            authenticatedLimit,
            routeLimit: 100,
            tenantLimit: 100,
            windowMs: 60_000,
          },
        },
      },
      {
        provide: RATE_LIMIT_STORE,
        useValue: new InMemoryRateLimitStore(),
      },
      { provide: APP_GUARD, useClass: AuthenticationGuard },
      { provide: APP_GUARD, useClass: RateLimitGuard },
      { provide: APP_GUARD, useClass: AuthorizationGuard },
      { provide: APP_FILTER, useClass: NormalizedHttpExceptionFilter },
    ],
  })(SecurityIntegrationModule);

  const app = await NestFactory.create(SecurityIntegrationModule, {
    logger: false,
  });
  await app.listen(0, '127.0.0.1');
  const address = (app.getHttpServer() as Server).address();
  if (!address || typeof address === 'string') {
    await app.close();
    throw new Error('Security integration server did not expose a TCP port.');
  }
  return { app, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function request(
  application: RunningApplication,
  accessToken: string,
): Promise<Response> {
  return fetch(`${application.baseUrl}/security-verification/read`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

describe('security HTTP integration', () => {
  it('rejects expired, wrong-issuer, and wrong-audience access tokens', async () => {
    const signingKey = createSigningKey('current-key');
    const application = await startApplication(
      verifier(provider([[signingKey.publicJwk]])),
    );

    try {
      for (const claims of [
        validClaims({ exp: Math.floor(NOW_MS / 1_000) - 1 }),
        validClaims({ iss: 'https://unexpected.example.com/tenant' }),
        validClaims({ aud: 'different-api' }),
      ]) {
        const response = await request(
          application,
          createAccessToken(signingKey, claims),
        );
        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toMatchObject({
          code: 'invalid_access_token',
        });
      }
    } finally {
      await application.app.close();
    }
  });

  it('refreshes JWKS once when a provider rotates signing keys', async () => {
    const oldKey = createSigningKey('old-key');
    const currentKey = createSigningKey('current-key');
    const providerState = provider([
      [oldKey.publicJwk],
      [currentKey.publicJwk],
    ]);
    const application = await startApplication(verifier(providerState));

    try {
      expect(
        (await request(application, createAccessToken(oldKey, validClaims())))
          .status,
      ).toBe(200);
      expect(
        (
          await request(
            application,
            createAccessToken(currentKey, validClaims()),
          )
        ).status,
      ).toBe(200);
      expect(providerState.keyRequests()).toBe(2);
    } finally {
      await application.app.close();
    }
  });

  it('denies a valid identity that lacks the route permission', async () => {
    const signingKey = createSigningKey('current-key');
    const application = await startApplication(
      verifier(provider([[signingKey.publicJwk]])),
    );

    try {
      const response = await request(
        application,
        createAccessToken(
          signingKey,
          validClaims({ permissions: ['operations:read'] }),
        ),
      );
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        code: 'insufficient_permissions',
      });
    } finally {
      await application.app.close();
    }
  });

  it('enforces the authenticated rate limit without sharing counters between subjects', async () => {
    const signingKey = createSigningKey('current-key');
    const application = await startApplication(
      verifier(provider([[signingKey.publicJwk]])),
      1,
    );

    try {
      const firstToken = createAccessToken(signingKey, validClaims());
      expect((await request(application, firstToken)).status).toBe(200);

      const limited = await request(application, firstToken);
      expect(limited.status).toBe(429);
      expect(limited.headers.get('x-rate-limit-policy')).toBe('authenticated');
      await expect(limited.json()).resolves.toMatchObject({
        code: 'rate_limit_exceeded',
      });

      const secondSubject = createAccessToken(
        signingKey,
        validClaims({ sub: 'actor-2' }),
      );
      expect((await request(application, secondSubject)).status).toBe(200);
    } finally {
      await application.app.close();
    }
  });
});
