import { describe, expect, it } from 'vitest';

import {
  createAuthenticationHeaders,
  createDevelopmentAuthenticationAdapter,
} from './authentication';

describe('browser authentication adapter', () => {
  it('creates bearer headers from the development token', async () => {
    const headers = createAuthenticationHeaders(
      createDevelopmentAuthenticationAdapter({
        NODE_ENV: 'development',
        NEXT_PUBLIC_AUTH_DEVELOPMENT_TOKEN: 'test-token',
      }),
    );

    expect(await headers()).toEqual({ authorization: 'Bearer test-token' });
  });

  it('uses the deterministic local token when development is unconfigured', async () => {
    const adapter = createDevelopmentAuthenticationAdapter({
      NODE_ENV: 'development',
    });

    expect(await adapter.getAccessToken()).toBe('local-development-token');
  });

  it('requires a provider-backed adapter in every production build', async () => {
    const adapter = createDevelopmentAuthenticationAdapter({
      NODE_ENV: 'production',
      NEXT_PUBLIC_AUTH_DEVELOPMENT_ENABLED: 'true',
      NEXT_PUBLIC_AUTH_DEVELOPMENT_TOKEN: 'must-not-be-used',
    });

    await expect(
      Promise.resolve().then(() => adapter.getAccessToken()),
    ).rejects.toThrow('provider-backed browser authentication adapter');
  });
});
