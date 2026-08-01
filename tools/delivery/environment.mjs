import { readFile } from 'node:fs/promises';

const deploymentEnvironments = new Set([
  'development',
  'preview',
  'production',
]);
const placeholderHostnames = new Set(['example.com', 'example.test']);

export function parseEnvironmentFile(content) {
  const values = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separator = line.indexOf('=');
    if (separator < 1) {
      throw new Error(`Invalid environment line: ${rawLine}`);
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

function isPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0;
}

function isSemanticVersion(value) {
  const [core] = value.split('-', 1);
  const parts = core?.split('.') ?? [];
  return (
    parts.length === 3 &&
    parts.every(
      (part) =>
        part.length > 0 &&
        [...part].every((character) => character >= '0' && character <= '9') &&
        (part === '0' || !part.startsWith('0')),
    )
  );
}

function validateUrl(value, protocols) {
  try {
    const parsed = new URL(value);
    return protocols.has(parsed.protocol);
  } catch {
    return false;
  }
}

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/\.$/u, '');
}

function hasPlaceholderHostname(value) {
  const normalized = value.trim().toLowerCase();
  if (placeholderHostnames.has(normalized)) return true;

  try {
    return placeholderHostnames.has(normalizeHostname(new URL(value).hostname));
  } catch {
    return false;
  }
}

function containsPlaceholder(value) {
  const normalized = value.toLowerCase();
  return (
    normalized.includes('changeme') ||
    normalized.includes('replace-me') ||
    hasPlaceholderHostname(value) ||
    value.includes('<') ||
    value.includes('>')
  );
}

export function validateDeploymentEnvironment(
  values,
  { allowLocal = false, allowPlaceholders = false } = {},
) {
  const issues = [];
  const required = [
    'DEPLOYMENT_ENVIRONMENT',
    'APP_VERSION',
    'NODE_ENV',
    'API_PORT',
    'DATABASE_URL',
    'REDIS_URL',
    'WEB_ORIGIN',
    'NEXT_PUBLIC_API_BASE_URL',
    'API_RATE_LIMIT_MAX',
    'API_RATE_LIMIT_WINDOW_MS',
  ];

  for (const key of required) {
    if (!values[key]) issues.push(`${key} is required.`);
  }

  const deploymentEnvironment = values.DEPLOYMENT_ENVIRONMENT;
  if (
    deploymentEnvironment &&
    !deploymentEnvironments.has(deploymentEnvironment)
  ) {
    issues.push(
      'DEPLOYMENT_ENVIRONMENT must be development, preview, or production.',
    );
  }

  if (values.APP_VERSION && !isSemanticVersion(values.APP_VERSION)) {
    issues.push('APP_VERSION must be a semantic version such as 1.2.3.');
  }

  if (
    deploymentEnvironment &&
    deploymentEnvironment !== 'development' &&
    values.NODE_ENV !== 'production'
  ) {
    issues.push(
      'Preview and production deployments require NODE_ENV=production.',
    );
  }

  if (values.API_PORT && !isPositiveInteger(values.API_PORT)) {
    issues.push('API_PORT must be a positive integer.');
  }
  if (
    values.API_RATE_LIMIT_MAX &&
    !isPositiveInteger(values.API_RATE_LIMIT_MAX)
  ) {
    issues.push('API_RATE_LIMIT_MAX must be a positive integer.');
  }
  if (
    values.API_RATE_LIMIT_WINDOW_MS &&
    !isPositiveInteger(values.API_RATE_LIMIT_WINDOW_MS)
  ) {
    issues.push('API_RATE_LIMIT_WINDOW_MS must be a positive integer.');
  }

  if (
    values.DATABASE_URL &&
    !validateUrl(values.DATABASE_URL, new Set(['postgres:', 'postgresql:']))
  ) {
    issues.push('DATABASE_URL must use the postgres protocol.');
  }
  if (
    values.REDIS_URL &&
    !validateUrl(values.REDIS_URL, new Set(['redis:', 'rediss:']))
  ) {
    issues.push('REDIS_URL must use the redis or rediss protocol.');
  }

  for (const key of ['WEB_ORIGIN', 'NEXT_PUBLIC_API_BASE_URL']) {
    const value = values[key];
    if (!value || !validateUrl(value, new Set(['http:', 'https:']))) continue;

    const parsed = new URL(value);
    const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
    if (
      deploymentEnvironment !== 'development' &&
      parsed.protocol !== 'https:' &&
      !(allowLocal && local)
    ) {
      issues.push(`${key} must use HTTPS outside local development.`);
    }
  }

  if (
    values.OTEL_EXPORTER_OTLP_ENDPOINT &&
    !validateUrl(
      values.OTEL_EXPORTER_OTLP_ENDPOINT,
      new Set(['http:', 'https:']),
    )
  ) {
    issues.push('OTEL_EXPORTER_OTLP_ENDPOINT must be an HTTP(S) URL.');
  }

  if (deploymentEnvironment === 'production' && values.AUTH_DEVELOPMENT_TOKEN) {
    issues.push('AUTH_DEVELOPMENT_TOKEN must not be configured in production.');
  }

  if (!allowPlaceholders) {
    for (const [key, value] of Object.entries(values)) {
      if (containsPlaceholder(value)) {
        issues.push(`${key} contains an example placeholder.`);
      }
    }
  }

  return issues;
}

export async function readAndValidateEnvironmentFile(filePath, options) {
  const values = parseEnvironmentFile(await readFile(filePath, 'utf8'));
  const issues = validateDeploymentEnvironment(values, options);
  return { issues, values };
}
