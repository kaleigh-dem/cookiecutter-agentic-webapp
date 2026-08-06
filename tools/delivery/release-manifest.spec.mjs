import { describe, expect, it } from 'vitest';

import {
  createReleaseManifest,
  imageEnvironmentContent,
  releaseEnvironmentEntries,
  validateReleaseManifest,
} from './release-manifest.mjs';

function sampleManifest() {
  return createReleaseManifest({
    version: '1.2.3',
    source: {
      environment: 'preview',
      repository: 'example/platform',
      workflow: '.github/workflows/release.yml',
      runId: '123456789',
      commitSha: '1'.repeat(40),
      ref: 'refs/heads/main',
    },
    build: {
      apiBaseUrl: 'https://api.example.com',
      authenticationProfile: 'oidc',
      authSessionEndpoint: '/auth/session/access-token',
      authSessionRefreshSkewSeconds: '30',
    },
    images: {
      api: {
        name: 'ghcr.io/example/steadystack-api',
        digest: `sha256:${'a'.repeat(64)}`,
      },
      worker: {
        name: 'ghcr.io/example/steadystack-worker',
        digest: `sha256:${'b'.repeat(64)}`,
      },
      web: {
        name: 'ghcr.io/example/steadystack-web',
        digest: `sha256:${'c'.repeat(64)}`,
      },
    },
  });
}

describe('release manifests', () => {
  it('records exact digest references for all production images', () => {
    const manifest = sampleManifest();

    expect(manifest.source.environment).toBe('preview');
    expect(manifest.source.ref).toBe('refs/heads/main');
    expect(manifest.images.api.reference).toBe(
      `ghcr.io/example/steadystack-api@sha256:${'a'.repeat(64)}`,
    );
    expect(manifest.images.worker.reference).toContain('@sha256:');
    expect(manifest.images.web.reference).toContain('@sha256:');
  });

  it('rejects mutable, incomplete, or untrusted release metadata', () => {
    const manifest = sampleManifest();

    expect(() =>
      validateReleaseManifest({
        ...manifest,
        source: { ...manifest.source, ref: 'refs/heads/feature' },
      }),
    ).toThrow('refs/heads/main');
    expect(() =>
      validateReleaseManifest({
        ...manifest,
        images: {
          ...manifest.images,
          api: {
            ...manifest.images.api,
            digest: 'sha256:short',
          },
        },
      }),
    ).toThrow('lowercase sha256 digest');
    expect(() =>
      validateReleaseManifest({
        ...manifest,
        images: {
          ...manifest.images,
          web: undefined,
        },
      }),
    ).toThrow('missing the web image');
    expect(() =>
      validateReleaseManifest({
        ...manifest,
        build: {
          ...manifest.build,
          authSessionRefreshSkewSeconds: '301',
        },
      }),
    ).toThrow('between 0 and 300');
  });

  it('exports only validated immutable references for deployment', () => {
    const manifest = sampleManifest();
    const entries = releaseEnvironmentEntries(manifest);
    const imageEnvironment = imageEnvironmentContent(manifest);

    expect(entries.APP_VERSION).toBe('1.2.3');
    expect(entries.API_IMAGE).toContain('@sha256:');
    expect(entries.NEXT_PUBLIC_API_BASE_URL).toBe('https://api.example.com');
    expect(entries.NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS).toBe('30');
    expect(imageEnvironment).toContain(`API_IMAGE=${entries.API_IMAGE}`);
    expect(imageEnvironment).not.toContain('NEXT_PUBLIC_API_BASE_URL');
  });

  it('checks expected workflow metadata during promotion', () => {
    const manifest = sampleManifest();

    expect(() =>
      validateReleaseManifest(manifest, {
        version: '1.2.4',
      }),
    ).toThrow('does not match');
    expect(() =>
      validateReleaseManifest(manifest, {
        repository: 'other/platform',
      }),
    ).toThrow('does not match');
    expect(() =>
      validateReleaseManifest(manifest, {
        runId: '987654321',
      }),
    ).toThrow('does not match');
  });
});
