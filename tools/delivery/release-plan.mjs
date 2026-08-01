import { writeFile } from 'node:fs/promises';

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

export function createReleasePlan({ environment, imagePrefix, version }) {
  if (!['preview', 'production'].includes(environment)) {
    throw new Error('Release environment must be preview or production.');
  }
  if (!isSemanticVersion(version)) {
    throw new Error('Release version must be valid semantic versioning.');
  }
  if (!imagePrefix?.trim()) {
    throw new Error('An image prefix is required.');
  }

  const environmentFile = `infra/environments/${environment}.env`;
  const composeFile = `infra/deploy/compose.${environment}.yaml`;
  const images = Object.fromEntries(
    ['api', 'worker', 'web'].map((service) => [
      service,
      `${imagePrefix}/${service}:${version}`,
    ]),
  );

  return {
    schemaVersion: 1,
    environment,
    version,
    images,
    rollbackTag: `${imagePrefix}/{service}:previous`,
    orderedSteps: [
      {
        id: 'validate-configuration',
        command: `node tools/delivery/validate-environment.mjs ${environmentFile}`,
      },
      {
        id: 'capture-backup',
        command:
          'Run the provider-specific database snapshot command and record its identifier.',
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
        command: `docker compose --env-file ${environmentFile} -f ${composeFile} up -d --wait`,
      },
      {
        id: 'smoke-test',
        command: `set -a && . ${environmentFile} && set +a && node tools/delivery/smoke-test.mjs`,
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
  const plan = createReleasePlan({
    environment: arguments_.environment,
    imagePrefix: arguments_['image-prefix'],
    version: arguments_.version,
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
