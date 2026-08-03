import { describe, expect, it, vi } from 'vitest';

import {
  createAuthenticationHeaders,
  createBrowserAuthenticationAdapter,
  createDevelopmentAuthenticationAdapter,
  createSessionAuthenticationAdapter,
} from './authentication';

describe('browser authentication adapter', () => {
  it('creates bearer headers from the fixed local development token', async () => {
    const headers = createAuthenticationHeaders(
      createDevelopmentAuthenticationAdapter({
        NODE_ENV: 'development',
      }),
    );

    expect(await headers()).toEqual({
      authorization: 'Bearer local-development-token',
    });
  });

  it('rejects the development adapter in every production build', async () => {
    const adapter = createBrowserAuthenticationAdapter({
      NODE_ENV: 'production',
      NEXT_PUBLIC_AUTHENTICATION_PROFILE: 'development',
    });

    await expect(
      Promise.resolve().then(() => adapter.getAccessToken()),
    ).rejects.toThrow('cannot run in production');
  });

  it('requires an explicit production profile', () => {
    expect(() =>
      createBrowserAuthenticationAdapter({ NODE_ENV: 'production' }),
    ).toThrow('NEXT_PUBLIC_AUTHENTICATION_PROFILE is required');
  });

  it('deliberately omits authorization for the unauthenticated profile', async () => {
    const headers = createAuthenticationHeaders(
      createBrowserAuthenticationAdapter({
        NODE_ENV: 'production',
        NEXT_PUBLIC_AUTHENTICATION_PROFILE: 'none',
      }),
    );

    expect(await headers()).toEqual({});
  });

  it('obtains, caches, and renews a session-backed access token', async () => {
    let nowMs = Date.parse('2026-08-02T20:00:00.000Z');
    let request = 0;
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      request += 1;
      return new Response(
        JSON.stringify({
          accessToken: `access-token-${request}`,
          expiresAt: nowMs + 60_000,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });
    const adapter = createSessionAuthenticationAdapter({
      endpoint: '/auth/session/access-token',
      fetchImplementation,
      now: () => nowMs,
      refreshSkewMs: 10_000,
    });

    await expect(
      Promise.all([adapter.getAccessToken(), adapter.getAccessToken()]),
    ).resolves.toEqual(['access-token-1', 'access-token-1']);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(fetchImplementation).toHaveBeenCalledWith(
      '/auth/session/access-token',
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      }),
    );

    nowMs += 50_001;
    await expect(adapter.getAccessToken()).resolves.toBe('access-token-2');
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it('supports explicit invalidation without persistent browser storage', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            accessToken: 'session-token',
            expiresAt: Date.now() + 60_000,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const adapter = createSessionAuthenticationAdapter({
      endpoint: '/auth/session/access-token',
      fetchImplementation,
    });

    await adapter.getAccessToken();
    adapter.invalidate?.();
    await adapter.getAccessToken();

    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });

  it.each(['oidc', 'session'] as const)(
    'selects the session credential endpoint for the %s production profile',
    async (profile) => {
      const fetchImplementation = vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({
              accessToken: `${profile}-access-token`,
              expiresAt: Date.now() + 60_000,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      );
      const headers = createAuthenticationHeaders(
        createBrowserAuthenticationAdapter(
          {
            NODE_ENV: 'production',
            NEXT_PUBLIC_AUTHENTICATION_PROFILE: profile,
            NEXT_PUBLIC_AUTH_SESSION_ENDPOINT: '/auth/session/access-token',
          },
          { fetchImplementation },
        ),
      );

      await expect(headers()).resolves.toEqual({
        authorization: `Bearer ${profile}-access-token`,
      });
    },
  );

  it('rejects cross-origin session credential endpoints', () => {
    expect(() =>
      createSessionAuthenticationAdapter({
        endpoint: 'https://identity.example.com/token',
      }),
    ).toThrow('same-origin absolute path');
  });

  it('rejects malformed session credentials', async () => {
    const adapter = createSessionAuthenticationAdapter({
      endpoint: '/auth/session/access-token',
      fetchImplementation: async () =>
        new Response(JSON.stringify({ accessToken: '', expiresAt: 0 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    });

    await expect(adapter.getAccessToken()).rejects.toThrow(
      'returned an invalid credential',
    );
  });
});
