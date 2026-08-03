import { validateDeploymentEnvironment } from './environment.mjs';

const productionBrowserProfiles = new Set(['none', 'oidc', 'session']);
const loopbackHostnames = new Set([
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  'host.docker.internal',
  'localhost',
]);
const releaseEnvironmentKeys = [
  'APP_VERSION',
  'NEXT_PUBLIC_API_BASE_URL',
  'NEXT_PUBLIC_AUTHENTICATION_PROFILE',
  'NEXT_PUBLIC_AUTH_SESSION_ENDPOINT',
];

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/\.$/u, '');
}

function isLocalHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  return loopbackHostnames.has(normalized) || normalized.endsWith('.local');
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isPlaceholderOwner(value) {
  const normalized = value.trim().toLowerCase();
  const usesExampleDomain =
    normalized === 'example.com' ||
    /^[^@\s]+@example\.com$/u.test(normalized);
  return (
    normalized.length === 0 ||
    normalized.includes('changeme') ||
    normalized.includes('replace-me') ||
    usesExampleDomain ||
    normalized.includes('<') ||
    normalized.includes('>')
  );
}

function nodeMajor(version) {
  const match = /^v?(\d+)(?:\.|$)/u.exec(version?.trim() ?? '');
  return match?.[1] ? Number(match[1]) : null;
}

function supportedNodeMajorRange(engine) {
  const match = /^>=\s*(\d+)\s+<\s*(\d+)$/u.exec(engine?.trim() ?? '');
  if (!match?.[1] || !match[2]) return null;
  return { minimum: Number(match[1]), maximumExclusive: Number(match[2]) };
}

function requireProductionHttpsUrl(
  values,
  key,
  issues,
  { originOnly = false } = {},
) {
  const value = values[key];
  if (!value) return;

  const parsed = parseUrl(value);
  if (!parsed || parsed.protocol !== 'https:') {
    issues.push(`${key} must be a valid HTTPS URL for production.`);
    return;
  }
  if (parsed.username || parsed.password) {
    issues.push(`${key} must not contain URL credentials.`);
  }
  if (isLocalHostname(parsed.hostname)) {
    issues.push(`${key} must not use a local hostname in production.`);
  }
  if (originOnly && (parsed.pathname !== '/' || parsed.search || parsed.hash)) {
    issues.push(`${key} must be an origin without a path, query, or fragment.`);
  }
}

function validateDatabase(values, issues) {
  const value = values.DATABASE_URL;
  if (!value) return;

  const parsed = parseUrl(value);
  if (!parsed) return;
  if (isLocalHostname(parsed.hostname)) {
    issues.push('DATABASE_URL must not use a local hostname in production.');
  }
  if (!parsed.username || !parsed.password) {
    issues.push('DATABASE_URL must include non-empty production credentials.');
  }
  const sslMode = parsed.searchParams.get('sslmode');
  if (!['require', 'verify-ca', 'verify-full'].includes(sslMode ?? '')) {
    issues.push(
      'DATABASE_URL must require TLS with sslmode=require, verify-ca, or verify-full.',
    );
  }
}

export function validateReleaseEnvironmentMatches(values, releaseEnvironment) {
  const issues = [];
  for (const key of releaseEnvironmentKeys) {
    const expected = releaseEnvironment[key]?.trim();
    if (expected && values[key] !== expected) {
      issues.push(
        `${key} does not match the release image build configuration.`,
      );
    }
  }
  return issues;
}

export function validateProductionReadiness(
  values,
  { nodeEngine = '>=24 <25', nodeVersion = process.version } = {},
) {
  const issues = [...validateDeploymentEnvironment(values)];

  if (values.DEPLOYMENT_ENVIRONMENT !== 'production') {
    issues.push(
      'Production readiness requires DEPLOYMENT_ENVIRONMENT=production.',
    );
  }
  if (values.AUTH_ACCESS_TOKEN_VERIFIER !== 'oidc') {
    issues.push('Production requires AUTH_ACCESS_TOKEN_VERIFIER=oidc.');
  }

  const browserProfile = values.NEXT_PUBLIC_AUTHENTICATION_PROFILE;
  if (!browserProfile || !productionBrowserProfiles.has(browserProfile)) {
    issues.push(
      'NEXT_PUBLIC_AUTHENTICATION_PROFILE must be oidc, session, or none in production.',
    );
  }
  if (browserProfile === 'development') {
    issues.push(
      'The development browser authentication profile is not production-safe.',
    );
  }

  for (const key of [
    'AUTH_OIDC_ISSUER',
    'BACKUP_OWNER',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    'OTEL_SERVICE_VERSION',
  ]) {
    if (!values[key])
      issues.push(`${key} is required for production readiness.`);
  }

  if (values.BACKUP_OWNER && isPlaceholderOwner(values.BACKUP_OWNER)) {
    issues.push('BACKUP_OWNER must name a real accountable team or person.');
  }
  if (
    values.APP_VERSION &&
    values.OTEL_SERVICE_VERSION &&
    values.APP_VERSION !== values.OTEL_SERVICE_VERSION
  ) {
    issues.push('OTEL_SERVICE_VERSION must match APP_VERSION.');
  }

  requireProductionHttpsUrl(values, 'WEB_ORIGIN', issues, {
    originOnly: true,
  });
  requireProductionHttpsUrl(values, 'NEXT_PUBLIC_API_BASE_URL', issues);
  requireProductionHttpsUrl(values, 'AUTH_OIDC_ISSUER', issues);
  requireProductionHttpsUrl(values, 'OTEL_EXPORTER_OTLP_ENDPOINT', issues);
  validateDatabase(values, issues);

  if (values.API_RATE_LIMIT_STORE !== 'postgres') {
    issues.push(
      'Production readiness requires distributed PostgreSQL rate limiting.',
    );
  }

  const runtimeMajor = nodeMajor(nodeVersion);
  const supportedRange = supportedNodeMajorRange(nodeEngine);
  if (!supportedRange) {
    issues.push(`Unsupported Node engine declaration: ${nodeEngine}.`);
  } else if (
    runtimeMajor === null ||
    runtimeMajor < supportedRange.minimum ||
    runtimeMajor >= supportedRange.maximumExclusive
  ) {
    issues.push(
      `Node ${nodeVersion} does not satisfy the production engine ${nodeEngine}.`,
    );
  }

  return [...new Set(issues)];
}
