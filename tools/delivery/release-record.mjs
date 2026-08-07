import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, normalize, relative, resolve } from 'node:path';

import {
  RELEASE_SERVICES,
  validateReleaseManifest,
} from './release-manifest.mjs';

const semanticVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const schemaCompatibilityValues = new Set([
  'backward-compatible',
  'roll-forward-only',
]);
const provenancePredicateType = 'https://slsa.dev/provenance/v1';
const sbomPredicateType = 'https://spdx.dev/Document/v2.3';

function parseArguments(arguments_) {
  const [command = 'validate', ...rest] = arguments_;
  const values = {};
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument?.startsWith('--')) continue;
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${argument} requires a value.`);
    }
    values[argument.slice(2)] = value;
    index += 1;
  }
  return { command, values };
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }
  if (/[\r\n]/u.test(value)) {
    throw new Error(`${label} must not contain newlines.`);
  }
  return value.trim();
}

function requirePositiveInteger(
  value,
  label,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  const normalized =
    typeof value === 'number' ? String(value) : requireString(value, label);
  if (!/^[1-9]\d*$/u.test(normalized)) {
    throw new Error(`${label} must be a positive integer.`);
  }
  const number = Number(normalized);
  if (!Number.isSafeInteger(number) || number > maximum) {
    throw new Error(`${label} exceeds the supported maximum.`);
  }
  return number;
}

function requireTimestamp(value, label) {
  const normalized = requireString(value, label);
  const parsed = new Date(normalized);
  if (
    Number.isNaN(parsed.getTime()) ||
    !/[zZ]|[+-]\d\d:\d\d$/u.test(normalized)
  ) {
    throw new Error(`${label} must be an ISO-8601 timestamp with a timezone.`);
  }
  return normalized;
}

function requireEvidenceText(value, label) {
  const normalized = requireString(value, label);
  if (/^(?:todo|tbd|pending|unknown|n\/a|none)$/iu.test(normalized)) {
    throw new Error(
      `${label} must contain recorded evidence, not a placeholder.`,
    );
  }
  return normalized;
}

function validateRelativePath(value, label) {
  const path = requireString(value, label);
  if (isAbsolute(path)) {
    throw new Error(
      `${label} must be relative to the release-record directory.`,
    );
  }
  const normalized = normalize(path).replaceAll('\\', '/');
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`${label} must stay inside the release-record directory.`);
  }
  return normalized;
}

function validateAttachment(attachment, label) {
  if (
    !attachment ||
    typeof attachment !== 'object' ||
    Array.isArray(attachment)
  ) {
    throw new Error(`${label} attachment is required.`);
  }
  const path = validateRelativePath(
    attachment.path,
    `${label} attachment path`,
  );
  const sha256 = requireString(
    attachment.sha256,
    `${label} attachment SHA-256`,
  );
  if (!sha256Pattern.test(sha256)) {
    throw new Error(
      `${label} attachment SHA-256 must be lowercase hexadecimal.`,
    );
  }
  const bytes = requirePositiveInteger(
    attachment.bytes,
    `${label} attachment size`,
  );
  return { path, sha256, bytes };
}

function validateImageEvidence(images, manifest) {
  if (!images || typeof images !== 'object' || Array.isArray(images)) {
    throw new Error('Release record image evidence is required.');
  }

  const normalized = {};
  for (const service of RELEASE_SERVICES) {
    const image = images[service];
    if (!image || typeof image !== 'object' || Array.isArray(image)) {
      throw new Error(`Release record is missing ${service} image evidence.`);
    }
    const reference = requireString(
      image.reference,
      `${service} image reference`,
    );
    const digest = requireString(image.digest, `${service} image digest`);
    if (!digestPattern.test(digest)) {
      throw new Error(
        `${service} image digest must be a lowercase sha256 digest.`,
      );
    }
    if (!reference.endsWith(`@${digest}`)) {
      throw new Error(`${service} image reference must end with its digest.`);
    }
    if (manifest && reference !== manifest.images[service].reference) {
      throw new Error(
        `${service} image reference does not match the release manifest.`,
      );
    }
    normalized[service] = { reference, digest };
  }
  return normalized;
}

function validateAttestations(attestations, images) {
  if (
    !attestations ||
    typeof attestations !== 'object' ||
    Array.isArray(attestations)
  ) {
    throw new Error('Release record attestation evidence is required.');
  }

  const normalized = {};
  for (const service of RELEASE_SERVICES) {
    const attestation = attestations[service];
    if (
      !attestation ||
      typeof attestation !== 'object' ||
      Array.isArray(attestation)
    ) {
      throw new Error(
        `Release record is missing ${service} attestation evidence.`,
      );
    }
    const subject = requireString(
      attestation.subject,
      `${service} attestation subject`,
    );
    if (subject !== images[service].reference) {
      throw new Error(
        `${service} attestation subject must match its image reference.`,
      );
    }
    if (attestation.provenancePredicateType !== provenancePredicateType) {
      throw new Error(
        `${service} provenance predicate type must be ${provenancePredicateType}.`,
      );
    }
    if (attestation.sbomPredicateType !== sbomPredicateType) {
      throw new Error(
        `${service} SBOM predicate type must be ${sbomPredicateType}.`,
      );
    }
    normalized[service] = {
      subject,
      provenancePredicateType,
      sbomPredicateType,
      verification: validateAttachment(
        attestation.verification,
        `${service} attestation verification`,
      ),
    };
  }
  return normalized;
}

export function validateReleaseRecord(record, options = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('Release record must be an object.');
  }
  if (record.schemaVersion !== 1) {
    throw new Error('Release record schemaVersion must be 1.');
  }

  const version = requireString(record.version, 'Release record version');
  if (!semanticVersionPattern.test(version)) {
    throw new Error('Release record version must use semantic versioning.');
  }

  const source = record.source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Release record source metadata is required.');
  }
  const repository = requireString(
    source.repository,
    'Release record repository',
  );
  if (!repositoryPattern.test(repository)) {
    throw new Error('Release record repository must be in owner/name form.');
  }
  const releaseWorkflowRunId = String(
    requirePositiveInteger(
      source.releaseWorkflowRunId,
      'Release workflow run ID',
    ),
  );
  const promotionWorkflowRunId = String(
    requirePositiveInteger(
      source.promotionWorkflowRunId,
      'Promotion workflow run ID',
    ),
  );
  const commitSha = requireString(
    source.commitSha,
    'Release record commit SHA',
  );
  if (!commitPattern.test(commitSha)) {
    throw new Error('Release record commit SHA must be a full lowercase SHA.');
  }

  const backup = record.backup;
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    throw new Error('Release record backup evidence is required.');
  }
  const backupIdentifier = requireEvidenceText(
    backup.identifier,
    'Database backup identifier',
  );
  const backupCapturedAt = requireTimestamp(
    backup.capturedAt,
    'Database backup capture time',
  );

  const rollback = record.rollback;
  if (!rollback || typeof rollback !== 'object' || Array.isArray(rollback)) {
    throw new Error('Release record rollback evidence is required.');
  }
  const windowMinutes = requirePositiveInteger(
    rollback.windowMinutes,
    'Rollback window minutes',
    10_080,
  );
  const schemaCompatibility = requireString(
    rollback.schemaCompatibility,
    'Schema compatibility decision',
  );
  if (!schemaCompatibilityValues.has(schemaCompatibility)) {
    throw new Error(
      'Schema compatibility decision must be backward-compatible or roll-forward-only.',
    );
  }
  const decision = requireEvidenceText(
    rollback.decision,
    'Rollback decision rationale',
  );
  const decidedBy = requireEvidenceText(
    rollback.decidedBy,
    'Rollback decision owner',
  );
  const decidedAt = requireTimestamp(
    rollback.decidedAt,
    'Rollback decision time',
  );

  const smokeTest = record.smokeTest;
  if (!smokeTest || typeof smokeTest !== 'object' || Array.isArray(smokeTest)) {
    throw new Error('Release record smoke-test evidence is required.');
  }
  if (smokeTest.status !== 'passed') {
    throw new Error('Release record smoke-test status must be passed.');
  }
  if (smokeTest.profile !== 'release') {
    throw new Error('Release record smoke-test profile must be release.');
  }
  const smokeCompletedAt = requireTimestamp(
    smokeTest.completedAt,
    'Smoke-test completion time',
  );

  const manifest = options.manifest
    ? validateReleaseManifest(options.manifest)
    : undefined;
  if (manifest) {
    if (manifest.version !== version) {
      throw new Error(
        'Release record version does not match the release manifest.',
      );
    }
    if (manifest.source.repository !== repository) {
      throw new Error(
        'Release record repository does not match the release manifest.',
      );
    }
    if (manifest.source.runId !== releaseWorkflowRunId) {
      throw new Error(
        'Release record release workflow run ID does not match the release manifest.',
      );
    }
    if (manifest.source.commitSha !== commitSha) {
      throw new Error(
        'Release record commit SHA does not match the release manifest.',
      );
    }
  }

  const images = validateImageEvidence(record.images, manifest);

  const attachments = record.attachments;
  if (
    !attachments ||
    typeof attachments !== 'object' ||
    Array.isArray(attachments)
  ) {
    throw new Error('Release record attachments are required.');
  }
  const normalizedAttachments = {
    releaseManifest: validateAttachment(
      attachments.releaseManifest,
      'Release manifest',
    ),
    releaseImagesEnvironment: validateAttachment(
      attachments.releaseImagesEnvironment,
      'Release image environment',
    ),
    releasePlan: validateAttachment(attachments.releasePlan, 'Release plan'),
    sourceRun: validateAttachment(
      attachments.sourceRun,
      'Promotion source run',
    ),
    releaseRun: validateAttachment(
      attachments.releaseRun,
      'Release workflow run metadata',
    ),
    promotionRun: validateAttachment(
      attachments.promotionRun,
      'Promotion workflow run metadata',
    ),
    migrationPlan: validateAttachment(
      attachments.migrationPlan,
      'Migration plan',
    ),
    smokeTestResult: validateAttachment(
      attachments.smokeTestResult,
      'Smoke-test result',
    ),
    smokeTestLog: validateAttachment(
      attachments.smokeTestLog,
      'Smoke-test log',
    ),
    sboms: {},
    scanReports: {},
  };
  for (const service of RELEASE_SERVICES) {
    normalizedAttachments.sboms[service] = validateAttachment(
      attachments.sboms?.[service],
      `${service} SBOM`,
    );
    normalizedAttachments.scanReports[service] = validateAttachment(
      attachments.scanReports?.[service],
      `${service} scan report`,
    );
  }

  const attestations = validateAttestations(record.attestations, images);

  return {
    schemaVersion: 1,
    version,
    source: {
      repository,
      releaseWorkflowRunId,
      promotionWorkflowRunId,
      commitSha,
    },
    backup: {
      identifier: backupIdentifier,
      capturedAt: backupCapturedAt,
    },
    rollback: {
      windowMinutes,
      schemaCompatibility,
      decision,
      decidedBy,
      decidedAt,
    },
    smokeTest: {
      status: 'passed',
      profile: 'release',
      completedAt: smokeCompletedAt,
    },
    images,
    attachments: normalizedAttachments,
    attestations,
  };
}

async function createAttachment(baseDirectory, relativePath, label) {
  const path = validateRelativePath(relativePath, `${label} path`);
  const base = resolve(baseDirectory);
  const absolutePath = resolve(base, path);
  const relativePathFromBase = relative(base, absolutePath);
  if (
    relativePathFromBase === '..' ||
    relativePathFromBase.startsWith(
      `..${process.platform === 'win32' ? '\\' : '/'}`,
    )
  ) {
    throw new Error(
      `${label} path must stay inside the release-record directory.`,
    );
  }
  const contents = await readFile(absolutePath);
  const metadata = await stat(absolutePath);
  if (!metadata.isFile() || contents.length === 0) {
    throw new Error(`${label} attachment must be a non-empty file.`);
  }
  return {
    path,
    sha256: createHash('sha256').update(contents).digest('hex'),
    bytes: contents.length,
  };
}

async function verifyAttachment(baseDirectory, attachment, label) {
  const expected = validateAttachment(attachment, label);
  const actual = await createAttachment(baseDirectory, expected.path, label);
  if (actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) {
    throw new Error(
      `${label} attachment hash or size does not match the record.`,
    );
  }
}

export async function verifyReleaseRecordAttachments(baseDirectory, record) {
  await verifyAttachment(
    baseDirectory,
    record.attachments.releaseManifest,
    'Release manifest',
  );
  await verifyAttachment(
    baseDirectory,
    record.attachments.releaseImagesEnvironment,
    'Release image environment',
  );
  await verifyAttachment(
    baseDirectory,
    record.attachments.releasePlan,
    'Release plan',
  );
  await verifyAttachment(
    baseDirectory,
    record.attachments.sourceRun,
    'Promotion source run',
  );
  await verifyAttachment(
    baseDirectory,
    record.attachments.releaseRun,
    'Release workflow run metadata',
  );
  await verifyAttachment(
    baseDirectory,
    record.attachments.promotionRun,
    'Promotion workflow run metadata',
  );
  await verifyAttachment(
    baseDirectory,
    record.attachments.migrationPlan,
    'Migration plan',
  );
  await verifyAttachment(
    baseDirectory,
    record.attachments.smokeTestResult,
    'Smoke-test result',
  );
  await verifyAttachment(
    baseDirectory,
    record.attachments.smokeTestLog,
    'Smoke-test log',
  );
  for (const service of RELEASE_SERVICES) {
    await verifyAttachment(
      baseDirectory,
      record.attachments.sboms[service],
      `${service} SBOM`,
    );
    await verifyAttachment(
      baseDirectory,
      record.attachments.scanReports[service],
      `${service} scan report`,
    );
    await verifyAttachment(
      baseDirectory,
      record.attestations[service].verification,
      `${service} attestation verification`,
    );
  }
}

async function createCommand(values) {
  const manifestPath = requireString(values.manifest, 'Release manifest path');
  const manifest = validateReleaseManifest(
    JSON.parse(await readFile(manifestPath, 'utf8')),
  );
  const outputPath = requireString(values.output, 'Release record output path');
  const baseDirectory = resolve(
    values['base-directory'] ?? dirname(resolve(outputPath)),
  );

  const attachments = {
    releaseManifest: await createAttachment(
      baseDirectory,
      values['release-manifest-attachment'] ?? 'release-manifest.json',
      'Release manifest',
    ),
    releaseImagesEnvironment: await createAttachment(
      baseDirectory,
      values['release-images-environment'] ?? 'release-images.env',
      'Release image environment',
    ),
    releasePlan: await createAttachment(
      baseDirectory,
      values['release-plan'],
      'Release plan',
    ),
    sourceRun: await createAttachment(
      baseDirectory,
      values['source-run'] ?? 'source-run.json',
      'Promotion source run',
    ),
    releaseRun: await createAttachment(
      baseDirectory,
      values['release-run'] ?? 'release-run.json',
      'Release workflow run metadata',
    ),
    promotionRun: await createAttachment(
      baseDirectory,
      values['promotion-run'] ?? 'promotion-run.json',
      'Promotion workflow run metadata',
    ),
    migrationPlan: await createAttachment(
      baseDirectory,
      values['migration-plan'],
      'Migration plan',
    ),
    smokeTestResult: await createAttachment(
      baseDirectory,
      values['smoke-result'],
      'Smoke-test result',
    ),
    smokeTestLog: await createAttachment(
      baseDirectory,
      values['smoke-log'] ?? 'smoke-test.log',
      'Smoke-test log',
    ),
    sboms: {},
    scanReports: {},
  };
  for (const service of RELEASE_SERVICES) {
    attachments.sboms[service] = await createAttachment(
      baseDirectory,
      values[`${service}-sbom`],
      `${service} SBOM`,
    );
    attachments.scanReports[service] = await createAttachment(
      baseDirectory,
      values[`${service}-scan-report`] ??
        `image-supply-chain/${service}.trivy.json`,
      `${service} scan report`,
    );
  }

  const attestations = {};
  for (const service of RELEASE_SERVICES) {
    attestations[service] = {
      subject: manifest.images[service].reference,
      provenancePredicateType,
      sbomPredicateType,
      verification: await createAttachment(
        baseDirectory,
        values[`${service}-attestation`],
        `${service} attestation verification`,
      ),
    };
  }

  const record = validateReleaseRecord(
    {
      schemaVersion: 1,
      version: manifest.version,
      source: {
        repository: manifest.source.repository,
        releaseWorkflowRunId: manifest.source.runId,
        promotionWorkflowRunId: values['promotion-run-id'],
        commitSha: manifest.source.commitSha,
      },
      backup: {
        identifier: values['backup-identifier'],
        capturedAt: values['backup-captured-at'],
      },
      rollback: {
        windowMinutes: values['rollback-window-minutes'],
        schemaCompatibility: values['schema-compatibility'],
        decision: values['schema-decision'],
        decidedBy: values['decision-owner'],
        decidedAt: values['decision-recorded-at'],
      },
      smokeTest: {
        status: 'passed',
        profile: 'release',
        completedAt: values['smoke-completed-at'],
      },
      images: Object.fromEntries(
        RELEASE_SERVICES.map((service) => [
          service,
          {
            reference: manifest.images[service].reference,
            digest: manifest.images[service].digest,
          },
        ]),
      ),
      attachments,
      attestations,
    },
    { manifest },
  );

  await writeFile(outputPath, `${JSON.stringify(record, null, 2)}\n`);
}

async function validateCommand(values) {
  const recordPath = requireString(values.record, 'Release record path');
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  const manifest = values.manifest
    ? JSON.parse(await readFile(values.manifest, 'utf8'))
    : undefined;
  const normalized = validateReleaseRecord(record, { manifest });
  if (values['base-directory']) {
    await verifyReleaseRecordAttachments(values['base-directory'], normalized);
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        valid: true,
        version: normalized.version,
        releaseWorkflowRunId: normalized.source.releaseWorkflowRunId,
        promotionWorkflowRunId: normalized.source.promotionWorkflowRunId,
        schemaCompatibility: normalized.rollback.schemaCompatibility,
        rollbackWindowMinutes: normalized.rollback.windowMinutes,
      },
      null,
      2,
    )}\n`,
  );
}

async function main() {
  const { command, values } = parseArguments(process.argv.slice(2));
  if (command === 'create') {
    await createCommand(values);
    return;
  }
  if (command === 'validate') {
    await validateCommand(values);
    return;
  }
  throw new Error(`Unknown release record command: ${command}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
