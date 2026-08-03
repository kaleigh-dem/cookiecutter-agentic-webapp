import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { validateBrowserAuthenticationBuild } from './validate-browser-auth-build.mjs';

describe('release browser authentication validation', () => {
  it.each(['oidc', 'session'] as const)(
    'accepts the %s profile with a same-origin endpoint',
    (profile) => {
      expect(
        validateBrowserAuthenticationBuild({
          NEXT_PUBLIC_AUTHENTICATION_PROFILE: profile,
          NEXT_PUBLIC_AUTH_SESSION_ENDPOINT: '/auth/session/access-token',
          NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS: '45',
        }),
      ).toEqual({
        profile,
        endpoint: '/auth/session/access-token',
        refreshSkewSeconds: 45,
      });
    },
  );

  it('accepts an intentionally unauthenticated release image', () => {
    expect(
      validateBrowserAuthenticationBuild({
        NEXT_PUBLIC_AUTHENTICATION_PROFILE: 'none',
      }),
    ).toEqual({
      profile: 'none',
      endpoint: null,
      refreshSkewSeconds: 30,
    });
  });

  it.each([undefined, '', 'development', 'unsupported'])(
    'rejects the release profile %s',
    (profile) => {
      expect(() =>
        validateBrowserAuthenticationBuild({
          NEXT_PUBLIC_AUTHENTICATION_PROFILE: profile,
          NEXT_PUBLIC_AUTH_SESSION_ENDPOINT: '/auth/session/access-token',
        }),
      ).toThrow();
    },
  );

  it('requires a credential endpoint for authenticated release profiles', () => {
    expect(() =>
      validateBrowserAuthenticationBuild({
        NEXT_PUBLIC_AUTHENTICATION_PROFILE: 'oidc',
      }),
    ).toThrow('NEXT_PUBLIC_AUTH_SESSION_ENDPOINT is required');
  });

  it('rejects browser-normalized cross-origin endpoints', () => {
    expect(() =>
      validateBrowserAuthenticationBuild({
        NEXT_PUBLIC_AUTHENTICATION_PROFILE: 'session',
        NEXT_PUBLIC_AUTH_SESSION_ENDPOINT: String.raw`/\evil`,
      }),
    ).toThrow('same-origin absolute path');
  });

  it('keeps both the Nx command and Dockerfile free of development defaults', () => {
    const webProject = JSON.parse(
      readFileSync(
        new URL('../../apps/web/project.json', import.meta.url),
        'utf8',
      ),
    ) as {
      targets: { container: { options: { command: string } } };
    };
    const dockerfile = readFileSync(
      new URL('../../infra/docker/Dockerfile.web', import.meta.url),
      'utf8',
    );

    expect(webProject.targets.container.options.command).toContain(
      '${NEXT_PUBLIC_AUTHENTICATION_PROFILE:?',
    );
    expect(webProject.targets.container.options.command).not.toContain(
      'NEXT_PUBLIC_AUTHENTICATION_PROFILE:-development',
    );
    expect(dockerfile).toContain('ARG NEXT_PUBLIC_AUTHENTICATION_PROFILE\n');
    expect(dockerfile).not.toContain(
      'ARG NEXT_PUBLIC_AUTHENTICATION_PROFILE=development',
    );
  });

  it('makes the release workflow pass and validate explicit deployed settings', () => {
    const workflow = readFileSync(
      new URL('../../.github/workflows/release.yml', import.meta.url),
      'utf8',
    );

    expect(workflow).toContain('authentication_profile:');
    expect(workflow).toContain('auth_session_endpoint:');
    expect(workflow).toContain(
      'NEXT_PUBLIC_AUTHENTICATION_PROFILE: ${{ inputs.authentication_profile }}',
    );
    expect(workflow).toContain(
      'NEXT_PUBLIC_AUTH_SESSION_ENDPOINT: ${{ inputs.auth_session_endpoint }}',
    );
    expect(workflow).toContain(
      'node tools/delivery/validate-browser-auth-build.mjs',
    );
    expect(workflow).not.toMatch(/^\s+- development$/m);
  });
});
