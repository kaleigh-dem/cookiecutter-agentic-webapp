import { describe, expect, it } from 'vitest';

import { createReleaseManifest } from './release-manifest.mjs';
import { createReleasePlan, isSemanticVersion } from './release-plan.mjs';

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
        name: 'ghcr.io/example/agentic-webapp-api',
        digest: `sha256:${'a'.repeat(64)}`,
      },
      worker: {
        name: 'ghcr.io/example/agentic-webapp-worker',
        digest: `sha256:${'b'.repeat(64)}`,
      },
      web: {
        name: 'ghcr.io/example/agentic-webapp-web',
        digest: `sha256:${'c'.repeat(64)}`,
      },
    },
  });
}

describe('release planning', () => {
  it('accepts semantic versions and rejects incomplete versions', () => {
    expect(isSemanticVersion('1.2.3')).toBe(true);
    expect(isSemanticVersion('1.2.3-preview.1')).toBe(true);
    expect(isSemanticVersion('1.2')).toBe(false);
  });

  it('orders migrations before service deployment', () => {
    const plan = createReleasePlan({
      environment: 'production',
      imagePrefix: 'ghcr.io/example/agentic-webapp',
      version: '1.2.3',
    });
    const identifiers = plan.orderedSteps.map((step) => step.id);

    expect(identifiers.indexOf('capture-backup')).toBeLessThan(
      identifiers.indexOf('apply-migrations'),
    );
    expect(identifiers.indexOf('apply-migrations')).toBeLessThan(
      identifiers.indexOf('deploy-services'),
    );
    expect(plan.images.api).toBe('ghcr.io/example/agentic-webapp/api:1.2.3');
  });

  it('records immutable manifest digests in preview and production plans', () => {
    const manifest = sampleManifest();
    const preview = createReleasePlan({
      environment: 'preview',
      manifest,
    });
    const production = createReleasePlan({
      environment: 'production',
      manifest,
      imageEnvironmentFile: 'release-images.env',
    });

    expect(preview.schemaVersion).toBe(2);
    expect(preview.immutableImages).toBe(true);
    expect(preview.images.api).toBe(manifest.images.api.reference);
    expect(production.images).toEqual(preview.images);
    expect(production.source?.runId).toBe('123456789');
    expect(production.rollbackTag).toBeUndefined();
    expect(production.rollbackStrategy).toContain('approved release manifest');
    expect(
      production.orderedSteps.find((step) => step.id === 'deploy-services')
        ?.command,
    ).toContain('. release-images.env');
  });

  it('uses the production readiness gate only for production plans', () => {
    const manifest = sampleManifest();
    const production = createReleasePlan({
      environment: 'production',
      manifest,
    });
    const preview = createReleasePlan({
      environment: 'preview',
      manifest,
    });

    expect(
      production.orderedSteps.find(
        (step) => step.id === 'validate-configuration',
      )?.command,
    ).toBe('pnpm production:check -- infra/environments/production.env');
    expect(
      production.orderedSteps.find((step) => step.id === 'capture-backup')
        ?.command,
    ).toContain('BACKUP_OWNER');
    expect(
      preview.orderedSteps.find((step) => step.id === 'validate-configuration')
        ?.command,
    ).toBe(
      'node tools/delivery/validate-environment.mjs infra/environments/preview.env',
    );
  });
});
