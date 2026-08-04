import { appendFile, readFile, writeFile } from 'node:fs/promises';

export const RELEASE_SERVICES = ['api', 'worker', 'web'];

const semanticVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?$/u;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const workflowPath = '.github/workflows/release.yml';
const sourceEnvironment = 'preview';
const sourceRef = 'refs/heads/main';
const browserProfiles = new Set(['none', 'oidc', 'session']);

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

function validateImageName(value, service) {
  const name = requireString(value, `${service} image name`);
  if (!name.startsWith('ghcr.io/')) {
    throw new Error(`${service} image name must use ghcr.io.`);
  }
  if (name.includes('@') || /:[^/]+$/u.test(name)) {
    throw new Error(`${service} image name must not include a tag or digest.`);
  }
  if (!name.endsWith(`-${service}`)) {
    throw new Error(`${service} image name must end with -${service}.`);
  }
  return name;
}

function validateDigest(value, service) {
  const digest = requireString(value, `${service} image digest`);
  if (!digestPattern.test(digest)) {
    throw new Error(
      `${service} image digest must be a lowercase sha256 digest.`,
    );
  }
  return digest;
}

function validateBuildConfiguration(build) {
  if (!build || typeof build !== 'object' || Array.isArray(build)) {
    throw new Error('Build configuration is required.');
  }

  const apiBaseUrl = requireString(build.apiBaseUrl, 'Build API base URL');
  let parsedApiBaseUrl;
  try {
    parsedApiBaseUrl = new URL(apiBaseUrl);
  } catch {
    throw new Error('Build API base URL must be a valid URL.');
  }
  if (
    parsedApiBaseUrl.protocol !== 'https:' ||
    parsedApiBaseUrl.username ||
    parsedApiBaseUrl.password
  ) {
    throw new Error(
      'Build API base URL must be an HTTPS URL without credentials.',
    );
  }

  const authenticationProfile = requireString(
    build.authenticationProfile,
    'Build authentication profile',
  );
  if (!browserProfiles.has(authenticationProfile)) {
    throw new Error(
      'Build authentication profile must be oidc, session, or none.',
    );
  }

  const authSessionEndpoint = requireString(
    build.authSessionEndpoint,
    'Build authentication session endpoint',
  );
  if (!authSessionEndpoint.startsWith('/')) {
    throw new Error(
      'Build authentication session endpoint must be a same-origin path.',
    );
  }

  return {
    apiBaseUrl,
    authenticationProfile,
    authSessionEndpoint,
  };
}

export function validateReleaseManifest(manifest, expected = {}) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Release manifest must be an object.');
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error('Release manifest schemaVersion must be 1.');
  }

  const version = requireString(manifest.version, 'Release version');
  if (!semanticVersionPattern.test(version)) {
    throw new Error('Release version must be valid semantic versioning.');
  }

  const source = manifest.source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Release source metadata is required.');
  }
  const environment = requireString(
    source.environment,
    'Release source environment',
  );
  if (environment !== sourceEnvironment) {
    throw new Error('Release source environment must be preview.');
  }
  const repository = requireString(source.repository, 'Release repository');
  if (!repositoryPattern.test(repository)) {
    throw new Error('Release repository must be in owner/name form.');
  }
  const workflow = requireString(source.workflow, 'Release workflow');
  if (workflow !== workflowPath) {
    throw new Error(`Release workflow must be ${workflowPath}.`);
  }
  const runId = requireString(source.runId, 'Release workflow run ID');
  if (!/^[1-9]\d*$/u.test(runId)) {
    throw new Error('Release workflow run ID must be a positive integer.');
  }
  const commitSha = requireString(source.commitSha, 'Release commit SHA');
  if (!commitPattern.test(commitSha)) {
    throw new Error('Release commit SHA must be a full lowercase SHA.');
  }
  const ref = requireString(source.ref, 'Release source ref');
  if (ref !== sourceRef) {
    throw new Error(`Release source ref must be ${sourceRef}.`);
  }

  const images = manifest.images;
  if (!images || typeof images !== 'object' || Array.isArray(images)) {
    throw new Error('Release images are required.');
  }
  const normalizedImages = {};
  for (const service of RELEASE_SERVICES) {
    const image = images[service];
    if (!image || typeof image !== 'object' || Array.isArray(image)) {
      throw new Error(`Release manifest is missing the ${service} image.`);
    }
    const name = validateImageName(image.name, service);
    const digest = validateDigest(image.digest, service);
    const reference = requireString(
      image.reference,
      `${service} image reference`,
    );
    if (reference !== `${name}@${digest}`) {
      throw new Error(
        `${service} image reference must equal its name and digest.`,
      );
    }
    normalizedImages[service] = { name, digest, reference };
  }

  const build = validateBuildConfiguration(manifest.build);

  const checks = [
    ['version', version],
    ['repository', repository],
    ['runId', runId],
    ['commitSha', commitSha],
  ];
  for (const [key, actual] of checks) {
    const expectedValue = expected[key];
    if (expectedValue && actual !== expectedValue) {
      throw new Error(
        `Release manifest ${key} ${actual} does not match ${expectedValue}.`,
      );
    }
  }

  return {
    schemaVersion: 1,
    version,
    source: {
      environment,
      repository,
      workflow,
      runId,
      commitSha,
      ref,
    },
    build,
    images: normalizedImages,
  };
}

export function createReleaseManifest(input) {
  const images = Object.fromEntries(
    RELEASE_SERVICES.map((service) => {
      const name = input.images?.[service]?.name;
      const digest = input.images?.[service]?.digest;
      return [service, { name, digest, reference: `${name}@${digest}` }];
    }),
  );

  return validateReleaseManifest({
    schemaVersion: 1,
    version: input.version,
    source: input.source,
    build: input.build,
    images,
  });
}

export function releaseEnvironmentEntries(manifest) {
  const normalized = validateReleaseManifest(manifest);
  return {
    APP_VERSION: normalized.version,
    API_IMAGE: normalized.images.api.reference,
    WORKER_IMAGE: normalized.images.worker.reference,
    WEB_IMAGE: normalized.images.web.reference,
    NEXT_PUBLIC_API_BASE_URL: normalized.build.apiBaseUrl,
    NEXT_PUBLIC_AUTHENTICATION_PROFILE: normalized.build.authenticationProfile,
    NEXT_PUBLIC_AUTH_SESSION_ENDPOINT: normalized.build.authSessionEndpoint,
  };
}

export function imageEnvironmentContent(manifest) {
  const entries = releaseEnvironmentEntries(manifest);
  return `${[
    `APP_VERSION=${entries.APP_VERSION}`,
    `API_IMAGE=${entries.API_IMAGE}`,
    `WORKER_IMAGE=${entries.WORKER_IMAGE}`,
    `WEB_IMAGE=${entries.WEB_IMAGE}`,
  ].join('\n')}\n`;
}

function githubEnvironmentContent(manifest) {
  const entries = releaseEnvironmentEntries(manifest);
  return `${Object.entries(entries)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`;
}

async function loadManifest(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function createCommand(values) {
  const manifest = createReleaseManifest({
    version: values.version,
    source: {
      environment: values['source-environment'],
      repository: values.repository,
      workflow: values.workflow,
      runId: values['run-id'],
      commitSha: values['commit-sha'],
      ref: values.ref,
    },
    build: {
      apiBaseUrl: values['api-base-url'],
      authenticationProfile: values['authentication-profile'],
      authSessionEndpoint: values['auth-session-endpoint'],
    },
    images: Object.fromEntries(
      RELEASE_SERVICES.map((service) => [
        service,
        {
          name: values[`${service}-name`],
          digest: values[`${service}-digest`],
        },
      ]),
    ),
  });
  const output = `${JSON.stringify(manifest, null, 2)}\n`;
  if (values.output) {
    await writeFile(values.output, output);
  } else {
    process.stdout.write(output);
  }
}

async function validateCommand(values) {
  const manifest = validateReleaseManifest(
    await loadManifest(values.manifest),
    {
      version: values['expected-version'],
      repository: values['expected-repository'],
      runId: values['expected-run-id'],
      commitSha: values['expected-commit-sha'],
    },
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        valid: true,
        version: manifest.version,
        sourceRunId: manifest.source.runId,
        images: Object.fromEntries(
          RELEASE_SERVICES.map((service) => [
            service,
            manifest.images[service].reference,
          ]),
        ),
      },
      null,
      2,
    )}\n`,
  );
}

async function exportCommand(values) {
  const manifest = await loadManifest(values.manifest);
  if (values['github-env']) {
    await appendFile(values['github-env'], githubEnvironmentContent(manifest));
  }
  if (values['image-env']) {
    await writeFile(values['image-env'], imageEnvironmentContent(manifest));
  }
  if (!values['github-env'] && !values['image-env']) {
    process.stdout.write(imageEnvironmentContent(manifest));
  }
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
  if (command === 'export-env') {
    await exportCommand(values);
    return;
  }
  throw new Error(`Unknown release manifest command: ${command}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
