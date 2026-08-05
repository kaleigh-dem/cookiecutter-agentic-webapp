import { isIP } from 'node:net';

import { validateDeploymentEnvironment } from './environment.mjs';

const productionBrowserProfiles = new Set(['none', 'oidc', 'session']);
const localHostnames = new Set(['host.docker.internal', 'localhost']);
const releaseEnvironmentKeys = [
  'APP_VERSION',
  'NEXT_PUBLIC_API_BASE_URL',
  'NEXT_PUBLIC_AUTHENTICATION_PROFILE',
  'NEXT_PUBLIC_AUTH_SESSION_ENDPOINT',
  'NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS',
];
const telemetryEndpointKeys = [
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
  'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT',
  'OTEL_EXPORTER_OTLP_LOGS_ENDPOINT',
];

function normalizeHostname(hostname) {
  const normalized = hostname.toLowerCase().replace(/\.$/u, '');
  return normalized.startsWith('[') && normalized.endsWith(']')
    ? normalized.slice(1, -1)
    : normalized;
}

function parseIpv4Address(hostname) {
  if (isIP(hostname) !== 4) return null;
  return hostname.split('.').map(Number);
}

function expandIpv6Address(hostname) {
  if (isIP(hostname) !== 6) return null;

  const [leftPart = '', rightPart = ''] = hostname.split('::');
  const left = leftPart ? leftPart.split(':') : [];
  const right = rightPart ? rightPart.split(':') : [];
  const omittedGroups = 8 - left.length - right.length;
  const groups = hostname.includes('::')
    ? [...left, ...Array.from({ length: omittedGroups }, () => '0'), ...right]
    : left;

  if (omittedGroups < 0 || groups.length !== 8) return null;
  return groups.map((group) => Number.parseInt(group, 16));
}

function isLocalIpAddress(hostname) {
  const ipv4 = parseIpv4Address(hostname);
  if (ipv4) {
    return ipv4[0] === 127 || ipv4.every((octet) => octet === 0);
  }

  const ipv6 = expandIpv6Address(hostname);
  if (!ipv6) return false;

  const isUnspecified = ipv6.every((group) => group === 0);
  const isLoopback =
    ipv6.slice(0, 7).every((group) => group === 0) && ipv6[7] === 1;
  if (isUnspecified || isLoopback) return true;

  const isIpv4Mapped =
    ipv6.slice(0, 5).every((group) => group === 0) && ipv6[5] === 0xffff;
  if (!isIpv4Mapped) return false;

  const mappedIpv4 = [
    ipv6[6] >> 8,
    ipv6[6] & 0xff,
    ipv6[7] >> 8,
    ipv6[7] & 0xff,
  ];
  return mappedIpv4[0] === 127 || mappedIpv4.every((octet) => octet === 0);
}

function isLocalHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  return (
    localHostnames.has(normalized) ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    isLocalIpAddress(normalized)
  );
}

function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function decodeUrlCredential(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isPlaceholderOwner(value) {
  const normalized = value.trim().toLowerCase();
  const usesExampleDomain =
    normalized === 'example.com' || /^[^@\s]+@example\.com$/u.test(normalized);
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
  if (
    parsed.username &&
    parsed.password &&
    [parsed.username, parsed.password].some((credential) =>
      isPlaceholderOwner(decodeUrlCredential(credential)),
    )
  ) {
    issues.push('DATABASE_URL contains an example placeholder.');
  }
  const sslModes = parsed.searchParams.getAll('sslmode');
  if (
    sslModes.length !== 1 ||
    !['require', 'verify-ca', 'verify-full'].includes(sslModes[0] ?? '')
  ) {
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
    'AUTH_OIDC_AUDIENCE',
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
  if (values.OTEL_SDK_DISABLED?.trim().toLowerCase() === 'true') {
    issues.push('OTEL_SDK_DISABLED must not disable telemetry in production.');
  }

  requireProductionHttpsUrl(values, 'WEB_ORIGIN', issues, {
    originOnly: true,
  });
  requireProductionHttpsUrl(values, 'NEXT_PUBLIC_API_BASE_URL', issues);
  requireProductionHttpsUrl(values, 'AUTH_OIDC_ISSUER', issues);
  for (const key of telemetryEndpointKeys) {
    requireProductionHttpsUrl(values, key, issues);
  }
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
