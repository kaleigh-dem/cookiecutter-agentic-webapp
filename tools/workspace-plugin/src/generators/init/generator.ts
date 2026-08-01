import { readJson, type Tree, writeJson } from '@nx/devkit';

import { formatGeneratorFiles } from '../shared';
import type {
  AuthenticationProfile,
  DeploymentProfile,
  InitGeneratorSchema,
  WorkerTransport,
  WorkspaceApplication,
} from './schema';

const applicationOrder = ['web', 'api', 'worker'] as const;
const authenticationProfiles = [
  'development',
  'none',
  'oidc',
  'session',
] as const;
const workerTransports = ['none', 'postgres', 'redis'] as const;
const deploymentProfiles = ['containers', 'kubernetes', 'local'] as const;

export interface NormalizedInitOptions {
  readonly applicationSlug: string;
  readonly displayName: string;
  readonly packageScope: string;
  readonly repositoryOwner: string;
  readonly codeowners: readonly string[];
  readonly applications: readonly WorkspaceApplication[];
  readonly webPort: number;
  readonly apiPort: number;
  readonly databasePort: number;
  readonly databaseName: string;
  readonly authentication: AuthenticationProfile;
  readonly workerTransport: WorkerTransport;
  readonly telemetry: boolean;
  readonly deploymentProfile: DeploymentProfile;
  readonly ai: boolean;
}

interface RootPackageJson {
  readonly [key: string]: unknown;
  readonly scripts?: Record<string, string>;
}

function parseList(
  value: string | readonly string[] | undefined,
): readonly string[] {
  const values: readonly string[] =
    typeof value === 'string' ? value.split(',') : (value ?? []);

  return [
    ...new Set(values.map((entry) => entry.trim()).filter(Boolean)),
  ].sort();
}

function assertEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  label: string,
): asserts value is T {
  if (!allowed.includes(value as T)) {
    throw new Error(`${label} must be one of: ${allowed.join(', ')}.`);
  }
}

function assertPort(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new Error(`${label} must be an integer between 1 and 65535.`);
  }
}

function defaultDisplayName(applicationSlug: string): string {
  return applicationSlug
    .split('-')
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

export function normalizeInitOptions(
  schema: InitGeneratorSchema,
): NormalizedInitOptions {
  const applicationSlug = schema.applicationSlug.trim();
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(applicationSlug)) {
    throw new Error(
      'applicationSlug must be a lowercase kebab-case identifier beginning with a letter.',
    );
  }

  const displayName = (
    schema.displayName ?? defaultDisplayName(applicationSlug)
  ).trim();
  if (!displayName || displayName.length > 100) {
    throw new Error('displayName must contain between 1 and 100 characters.');
  }

  const packageScope = schema.packageScope.trim();
  if (!/^@[a-z0-9][a-z0-9._-]*$/.test(packageScope)) {
    throw new Error(
      'packageScope must be a lowercase npm scope such as @acme or @acme-platform.',
    );
  }

  const repositoryOwner = schema.repositoryOwner.trim();
  if (
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(
      repositoryOwner,
    )
  ) {
    throw new Error(
      'repositoryOwner must be a valid GitHub user or organization name.',
    );
  }

  const codeowners = parseList(schema.codeowners);
  const normalizedCodeowners =
    codeowners.length > 0 ? codeowners : [`@${repositoryOwner}`];
  for (const owner of normalizedCodeowners) {
    if (
      !/^@[A-Za-z0-9][A-Za-z0-9-]*(?:\/[A-Za-z0-9_.-]+)?$/.test(owner) &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner)
    ) {
      throw new Error(
        `Invalid CODEOWNER ${JSON.stringify(owner)}; use @user, @org/team, or an email address.`,
      );
    }
  }

  const requestedApplications = parseList(
    schema.applications ?? applicationOrder,
  );
  if (requestedApplications.length === 0) {
    throw new Error('At least one application must be selected.');
  }
  for (const application of requestedApplications) {
    assertEnum(application, applicationOrder, 'applications');
  }
  const requestedSet = new Set(requestedApplications);
  const applications = applicationOrder.filter((application) =>
    requestedSet.has(application),
  );

  const webPort = schema.webPort ?? 3000;
  const apiPort = schema.apiPort ?? 4000;
  const databasePort = schema.databasePort ?? 5432;
  assertPort(webPort, 'webPort');
  assertPort(apiPort, 'apiPort');
  assertPort(databasePort, 'databasePort');
  if (new Set([webPort, apiPort, databasePort]).size !== 3) {
    throw new Error('webPort, apiPort, and databasePort must be unique.');
  }

  const databaseName = (
    schema.databaseName ?? applicationSlug.replaceAll('-', '_')
  ).trim();
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(databaseName)) {
    throw new Error(
      'databaseName must begin with a lowercase letter and contain only lowercase letters, numbers, and underscores.',
    );
  }

  const authentication =
    schema.authentication ??
    (applications.includes('api') ? 'development' : 'none');
  assertEnum(authentication, authenticationProfiles, 'authentication');

  const workerTransport =
    schema.workerTransport ??
    (applications.includes('worker') ? 'postgres' : 'none');
  assertEnum(workerTransport, workerTransports, 'workerTransport');

  const deploymentProfile = schema.deploymentProfile ?? 'containers';
  assertEnum(deploymentProfile, deploymentProfiles, 'deploymentProfile');

  if (authentication !== 'none' && !applications.includes('api')) {
    throw new Error('Authentication profiles require the api application.');
  }
  if (authentication === 'session' && !applications.includes('web')) {
    throw new Error('Session authentication requires the web application.');
  }
  if (workerTransport !== 'none' && !applications.includes('worker')) {
    throw new Error('A worker transport requires the worker application.');
  }
  if (applications.includes('worker') && workerTransport === 'none') {
    throw new Error('The worker application requires a worker transport.');
  }
  if (
    schema.ai &&
    !(applications.includes('web') && applications.includes('api'))
  ) {
    throw new Error('AI capabilities require both web and api applications.');
  }

  return {
    applicationSlug,
    displayName,
    packageScope,
    repositoryOwner,
    codeowners: normalizedCodeowners,
    applications,
    webPort,
    apiPort,
    databasePort,
    databaseName,
    authentication,
    workerTransport,
    telemetry: schema.telemetry ?? false,
    deploymentProfile,
    ai: schema.ai ?? false,
  };
}

export function createWorkspaceManifest(options: NormalizedInitOptions) {
  return {
    schemaVersion: 1,
    application: {
      slug: options.applicationSlug,
      displayName: options.displayName,
      packageScope: options.packageScope,
    },
    repository: {
      owner: options.repositoryOwner,
      codeowners: options.codeowners,
    },
    applications: options.applications,
    ports: {
      web: options.webPort,
      api: options.apiPort,
      database: options.databasePort,
    },
    database: {
      name: options.databaseName,
    },
    profiles: {
      authentication: options.authentication,
      workerTransport: options.workerTransport,
      telemetry: options.telemetry,
      deployment: options.deploymentProfile,
      ai: options.ai,
    },
  } as const;
}

function updateEnvironmentValue(
  content: string,
  key: string,
  value: string,
): string {
  const line = `${key}=${value}`;
  const expression = new RegExp(`^${key}=.*$`, 'm');
  if (expression.test(content)) {
    return content.replace(expression, line);
  }

  const prefix =
    content.length === 0 || content.endsWith('\n')
      ? content
      : `${content}\n`;
  return `${prefix}${line}\n`;
}

function writeEnvironmentDefaults(
  tree: Tree,
  options: NormalizedInitOptions,
): void {
  let content = tree.exists('.env.example')
    ? (tree.read('.env.example', 'utf-8') ?? '')
    : '';
  const values: ReadonlyArray<readonly [string, string]> = [
    ['WEB_PORT', String(options.webPort)],
    ['API_PORT', String(options.apiPort)],
    ['WEB_ORIGIN', `http://localhost:${options.webPort}`],
    ['NEXT_PUBLIC_API_BASE_URL', `http://localhost:${options.apiPort}`],
    [
      'DATABASE_URL',
      `postgresql://postgres:postgres@localhost:${options.databasePort}/${options.databaseName}`,
    ],
    [
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      options.telemetry ? 'http://localhost:4318' : '',
    ],
    [
      'NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT',
      options.telemetry ? 'http://localhost:4318' : '',
    ],
  ];

  for (const [key, value] of values) {
    content = updateEnvironmentValue(content, key, value);
  }
  tree.write('.env.example', content);
}

function writeCodeowners(tree: Tree, options: NormalizedInitOptions): void {
  const owners = options.codeowners.join(' ');
  const lines = [
    `* ${owners}`,
    '',
    ...options.applications.map(
      (application) => `/apps/${application}/ ${owners}`,
    ),
    `/packages/ ${owners}`,
    `/tools/ ${owners}`,
    `/docs/architecture/ ${owners}`,
    `/docs/TODO.md ${owners}`,
    `/AGENTS.md ${owners}`,
    '',
  ];
  tree.write('.github/CODEOWNERS', lines.join('\n'));
}

function updateRootPackageJson(
  tree: Tree,
  options: NormalizedInitOptions,
): void {
  if (!tree.exists('package.json')) {
    return;
  }

  const packageJson = readJson<RootPackageJson>(tree, 'package.json');
  const scripts = { ...(packageJson.scripts ?? {}) };
  scripts['containers:build'] =
    `nx run-many -t container --projects=${options.applications.join(',')}` +
    ' --parallel=1';

  writeJson(tree, 'package.json', {
    ...packageJson,
    name: `${options.packageScope}/${options.applicationSlug}`,
    scripts,
  });
}

export default async function initGenerator(
  tree: Tree,
  schema: InitGeneratorSchema,
): Promise<void> {
  const options = normalizeInitOptions(schema);

  writeJson(tree, 'workspace.template.json', createWorkspaceManifest(options));
  updateRootPackageJson(tree, options);
  writeCodeowners(tree, options);
  writeEnvironmentDefaults(tree, options);

  await formatGeneratorFiles(tree, schema.skipFormat);
}
