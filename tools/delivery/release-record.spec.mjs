import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createReleaseManifest } from './release-manifest.mjs';
import {
  validateReleaseRecord,
  verifyReleaseRecordAttachments,
} from './release-record.mjs';

const services = ['api', 'worker', 'web'];

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

function attachment(path, character) {
  return {
    path,
    sha256: character.repeat(64),
    bytes: 128,
  };
}

function sampleRecord() {
  const manifest = sampleManifest();
  return {
    schemaVersion: 1,
    version: manifest.version,
    source: {
      repository: manifest.source.repository,
      releaseWorkflowRunId: manifest.source.runId,
      promotionWorkflowRunId: '223456789',
      commitSha: manifest.source.commitSha,
    },
    backup: {
      identifier: 'snapshot-production-1234',
      capturedAt: '2026-08-07T16:00:00Z',
    },
    rollback: {
      windowMinutes: 60,
      schemaCompatibility: 'backward-compatible',
      decision:
        'Previous application digests remain compatible with the migrated schema.',
      decidedBy: 'release-owner',
      decidedAt: '2026-08-07T16:05:00Z',
    },
    smokeTest: {
      status: 'passed',
      profile: 'release',
      completedAt: '2026-08-07T16:10:00Z',
    },
    images: Object.fromEntries(
      services.map((service) => [
        service,
        {
          reference: manifest.images[service].reference,
          digest: manifest.images[service].digest,
        },
      ]),
    ),
    attachments: {
      releaseManifest: attachment('release-manifest.json', '1'),
      releaseImagesEnvironment: attachment('release-images.env', '2'),
      releasePlan: attachment('release-plan.production.json', '3'),
      sourceRun: attachment('source-run.json', '4'),
      releaseRun: attachment('release-run.json', '5'),
      promotionRun: attachment('promotion-run.json', '6'),
      migrationPlan: attachment('migration-plan.production.json', '7'),
      smokeTestResult: attachment('smoke-test.json', '8'),
      smokeTestLog: attachment('smoke-test.log', '9'),
      sboms: {
        api: attachment('image-supply-chain/api.spdx.json', 'a'),
        worker: attachment('image-supply-chain/worker.spdx.json', 'b'),
        web: attachment('image-supply-chain/web.spdx.json', 'c'),
      },
      scanReports: {
        api: attachment('image-supply-chain/api.trivy.json', 'd'),
        worker: attachment('image-supply-chain/worker.trivy.json', 'e'),
        web: attachment('image-supply-chain/web.trivy.json', 'f'),
      },
    },
    attestations: {
      api: {
        subject: manifest.images.api.reference,
        provenancePredicateType: 'https://slsa.dev/provenance/v1',
        sbomPredicateType: 'https://spdx.dev/Document/v2.3',
        verification: attachment('attestations/api.txt', '8'),
      },
      worker: {
        subject: manifest.images.worker.reference,
        provenancePredicateType: 'https://slsa.dev/provenance/v1',
        sbomPredicateType: 'https://spdx.dev/Document/v2.3',
        verification: attachment('attestations/worker.txt', '9'),
      },
      web: {
        subject: manifest.images.web.reference,
        provenancePredicateType: 'https://slsa.dev/provenance/v1',
        sbomPredicateType: 'https://spdx.dev/Document/v2.3',
        verification: attachment('attestations/web.txt', 'a'),
      },
    },
  };
}

function allSupportingAttachments(record) {
  return [
    record.attachments.releaseManifest,
    record.attachments.releaseImagesEnvironment,
    record.attachments.releasePlan,
    record.attachments.sourceRun,
    record.attachments.releaseRun,
    record.attachments.promotionRun,
    record.attachments.migrationPlan,
    record.attachments.smokeTestResult,
    record.attachments.smokeTestLog,
    ...services.flatMap((service) => [
      record.attachments.sboms[service],
      record.attachments.scanReports[service],
      record.attestations[service].verification,
    ]),
  ];
}

async function materializeBundle(record) {
  const directory = await mkdtemp(join(tmpdir(), 'release-record-'));
  for (const evidence of allSupportingAttachments(record)) {
    const absolutePath = join(directory, evidence.path);
    await mkdir(dirname(absolutePath), { recursive: true });
    const contents = `fixture:${evidence.path}\n`;
    await writeFile(absolutePath, contents);
    evidence.sha256 = createHash('sha256').update(contents).digest('hex');
    evidence.bytes = Buffer.byteLength(contents);
  }
  return directory;
}

async function repositoryFile(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('release records', () => {
  it('binds rollback, backup, smoke, supply-chain, attestation, and digest evidence to the release manifest', () => {
    const manifest = sampleManifest();
    const record = validateReleaseRecord(sampleRecord(), { manifest });

    expect(record.version).toBe(manifest.version);
    expect(record.source.releaseWorkflowRunId).toBe(manifest.source.runId);
    expect(record.rollback.windowMinutes).toBe(60);
    expect(record.rollback.schemaCompatibility).toBe('backward-compatible');
    expect(record.smokeTest.status).toBe('passed');
    expect(record.images.api.reference).toBe(manifest.images.api.reference);
    expect(record.attachments.smokeTestLog.path).toBe('smoke-test.log');
    expect(record.attachments.sboms.web.path).toBe(
      'image-supply-chain/web.spdx.json',
    );
    expect(record.attachments.scanReports.api.path).toBe(
      'image-supply-chain/api.trivy.json',
    );
    expect(record.attestations.worker.subject).toBe(
      manifest.images.worker.reference,
    );
  });

  it('fails closed when rollback or schema-compatibility evidence is missing', () => {
    expect(() =>
      validateReleaseRecord({
        ...sampleRecord(),
        rollback: {
          ...sampleRecord().rollback,
          windowMinutes: 0,
        },
      }),
    ).toThrow('positive integer');

    expect(() =>
      validateReleaseRecord({
        ...sampleRecord(),
        rollback: {
          ...sampleRecord().rollback,
          schemaCompatibility: 'unknown',
        },
      }),
    ).toThrow('backward-compatible or roll-forward-only');

    expect(() =>
      validateReleaseRecord({
        ...sampleRecord(),
        rollback: {
          ...sampleRecord().rollback,
          decision: 'TBD',
        },
      }),
    ).toThrow('not a placeholder');
  });

  it('requires a recorded backup and successful release smoke result', () => {
    expect(() =>
      validateReleaseRecord({
        ...sampleRecord(),
        backup: {
          ...sampleRecord().backup,
          identifier: 'pending',
        },
      }),
    ).toThrow('not a placeholder');

    expect(() =>
      validateReleaseRecord({
        ...sampleRecord(),
        smokeTest: {
          ...sampleRecord().smokeTest,
          status: 'failed',
        },
      }),
    ).toThrow('must be passed');
  });

  it('rejects image or attestation evidence that is not bound to the manifest digest', () => {
    const manifest = sampleManifest();
    const record = sampleRecord();

    expect(() =>
      validateReleaseRecord(
        {
          ...record,
          images: {
            ...record.images,
            api: {
              ...record.images.api,
              reference: `ghcr.io/example/steadystack-api@sha256:${'f'.repeat(64)}`,
              digest: `sha256:${'f'.repeat(64)}`,
            },
          },
        },
        { manifest },
      ),
    ).toThrow('does not match the release manifest');

    expect(() =>
      validateReleaseRecord({
        ...record,
        attestations: {
          ...record.attestations,
          web: {
            ...record.attestations.web,
            subject: record.images.api.reference,
          },
        },
      }),
    ).toThrow('must match its image reference');
  });

  it('rejects mutation of scan reports and smoke logs in a finalized bundle', async () => {
    for (const relativePath of [
      'image-supply-chain/api.trivy.json',
      'smoke-test.log',
    ]) {
      const manifest = sampleManifest();
      const record = sampleRecord();
      const directory = await materializeBundle(record);
      try {
        const normalized = validateReleaseRecord(record, { manifest });
        await expect(
          verifyReleaseRecordAttachments(directory, normalized),
        ).resolves.toBeUndefined();

        await writeFile(join(directory, relativePath), 'tampered\n');
        await expect(
          verifyReleaseRecordAttachments(directory, normalized),
        ).rejects.toThrow('attachment hash or size does not match the record');
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
  });
});

describe('release record workflows', () => {
  it('finalizes only complete exact-run production evidence', async () => {
    const workflow = await repositoryFile(
      '.github/workflows/release-record.yml',
    );

    expect(workflow).toContain('name: Finalize release record');
    expect(workflow).toContain('environment:\n      name: production');
    expect(workflow).toContain('actions: read');
    expect(workflow).toContain('attestations: read');
    expect(workflow).toContain('packages: read');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).not.toContain('packages: write');
    expect(workflow).toContain('production-promotion-${{ inputs.version }}');
    expect(workflow).toContain('image-supply-chain-${{ inputs.version }}');
    expect(workflow).toContain('run-id: ${{ inputs.promotion_run_id }}');
    expect(workflow).toContain('run-id: ${{ inputs.source_run_id }}');
    expect(workflow).toContain('schema_compatibility:');
    expect(workflow).toContain('rollback_window_minutes:');
    expect(workflow).toContain('backup_identifier:');
    expect(workflow).toContain('smoke-test.mjs --profile release');
    expect(workflow).toContain('smoke-test.log');
    expect(workflow).toContain('release-record.mjs create');
    expect(workflow).toContain('--base-directory "$RECORD_DIRECTORY"');
    expect(workflow).toContain('release-record-${{ inputs.version }}');
  });

  it('schedules an isolated PostgreSQL restore exercise', async () => {
    const workflow = await repositoryFile(
      '.github/workflows/disaster-recovery.yml',
    );

    expect(workflow).toContain("cron: '17 6 1 */3 *'");
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('pg_dump -U postgres -d app -Fc');
    expect(workflow).toContain('createdb -U postgres restore_exercise');
    expect(workflow).toContain('pg_restore -U postgres -d restore_exercise');
    expect(workflow).toContain('table-counts.source.txt');
    expect(workflow).toContain('table-counts.restored.txt');
    expect(workflow).toContain('pnpm db:status');
    expect(workflow).toContain('restore-evidence.json');
    expect(workflow).toContain(
      'disaster-recovery-exercise-${{ github.run_id }}',
    );
  });

  it('keeps example release-record validation in delivery checks', async () => {
    const project = JSON.parse(
      await repositoryFile('tools/delivery/project.json'),
    );
    const commands = project.targets['config-check'].options.commands;

    expect(commands).toContain(
      'node tools/delivery/release-record.mjs validate --record infra/release/release-record.example.json --manifest infra/release/release-manifest.example.json',
    );
  });
});
