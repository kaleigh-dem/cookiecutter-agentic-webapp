import { readFile, writeFile } from 'node:fs/promises';

import {
  RELEASE_SERVICES,
  validateReleaseManifest,
} from './release-manifest.mjs';

function parseArguments(arguments_) {
  const values = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!argument?.startsWith('--')) continue;
    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${argument} requires a value.`);
    }
    values[argument.slice(2)] = value;
    index += 1;
  }
  return values;
}

export function isSemanticVersion(value) {
  const [core, prerelease] = value.split('-', 2);
  const parts = core?.split('.') ?? [];
  if (
    parts.length !== 3 ||
    !parts.every(
      (part) =>
        part.length > 0 &&
        [...part].every((character) => character >= '0' && character <= '9') &&
        (part === '0' || !part.startsWith('0')),
    )
  ) {
    return false;
  }

  return prerelease === undefined || prerelease.length > 0;
}

function legacyRelease({ imagePrefix, version }) {
  if (!isSemanticVersion(version)) {
    throw new Error('Release version must be valid semantic versioning.');
  }
  if (!imagePrefix?.trim()) {
    throw new Error('An image prefix is required.');
  }

  return {
    immutable: false,
    version,
    images: Object.fromEntries(
      RELEASE_SERVICES.map((service) => [
        service,
        `${imagePrefix}/${service}:${version}`,
      ]),
    ),
    source: null,
  };
}

function manifestRelease(manifest) {
  const normalized = validateReleaseManifest(manifest);
  return {
    immutable: true,
    version: normalized.version,
    images: Object.fromEntries(
      RELEASE_SERVICES.map((service) => [
        service,
        normalized.images[service].reference,
      ]),
    ),
    source: {
      environment: normalized.source.environment,
      repository: normalized.source.repository,
      workflow: normalized.source.workflow,
      runId: normalized.source.runId,
      commitSha: normalized.source.commitSha,
      ref: normalized.source.ref,
    },
  };
}

export function createReleasePlan({
  environment,
  imagePrefix,
  version,
  manifest,
  imageEnvironmentFile = 'release-images.env',
}) {
  if (!['preview', 'production'].includes(environment)) {
    throw new Error('Release environment must be preview or production.');
  }

  const release = manifest
    ? manifestRelease(manifest)
    : legacyRelease({ imagePrefix, version });
  const environmentFile = `infra/environments/${environment}.env`;
  const composeFile = `infra/deploy/compose.${environment}.yaml`;
  const validationCommand =
    environment === 'production'
      ? `pnpm production:check -- ${environmentFile}`
      : `node tools/delivery/validate-environment.mjs ${environmentFile}`;
  const deployCommand = release.immutable
    ? `set -a && . ${environmentFile} && . ${imageEnvironmentFile} && set +a && docker compose --env-file ${environmentFile} -f ${composeFile} up -d --wait`
    : `docker compose --env-file ${environmentFile} -f ${composeFile} up -d --wait`;

  return {
    schemaVersion: release.immutable ? 2 : 1,
    environment,
    version: release.version,
    immutableImages: release.immutable,
    images: release.images,
    source: release.source,
    rollbackStrategy: release.immutable
      ? 'Select a previously approved release manifest and its exact digest references.'
      : undefined,
    rollbackTag: release.immutable
      ? undefined
      : `${imagePrefix}/{service}:previous`,
    orderedSteps: [
      ...(release.immutable
        ? [
            {
              id: 'verify-release-manifest',
              command: `node tools/delivery/release-manifest.mjs validate --manifest release-manifest.json --expected-version ${release.version}`,
            },
          ]
        : []),
      {
        id: 'validate-configuration',
        command: validationCommand,
      },
      {
        id: 'capture-backup',
        command:
          'The BACKUP_OWNER runs the provider-specific database snapshot command and records its identifier.',
      },
      {
        id: 'inspect-migrations',
        command: `set -a && . ${environmentFile} && set +a && pnpm db:status`,
      },
      {
        id: 'apply-migrations',
        command: `set -a && . ${environmentFile} && set +a && pnpm db:migrate`,
      },
      {
        id: 'deploy-services',
        command: deployCommand,
      },
      {
        id: 'smoke-test',
        command: `set -a && . ${environmentFile} && set +a && node tools/delivery/smoke-test.mjs --profile release`,
      },
      {
        id: 'observe',
        command:
          'Observe release SLIs for at least one complete rollback window.',
      },
    ],
  };
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  const manifest = arguments_.manifest
    ? JSON.parse(await readFile(arguments_.manifest, 'utf8'))
    : undefined;
  const plan = createReleasePlan({
    environment: arguments_.environment,
    imagePrefix: arguments_['image-prefix'],
    version: arguments_.version,
    manifest,
    imageEnvironmentFile:
      arguments_['image-environment-file'] ?? 'release-images.env',
  });
  const output = `${JSON.stringify(plan, null, 2)}\n`;

  if (arguments_.output) {
    await writeFile(arguments_.output, output);
  } else {
    process.stdout.write(output);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
