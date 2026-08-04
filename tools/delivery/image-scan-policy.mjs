import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const supportedServices = new Set(['api', 'worker', 'web']);
const supportedSeverities = new Set([
  'UNKNOWN',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value.trim();
}

function parseDate(value, field) {
  const normalized = requireNonEmptyString(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${field} must use YYYY-MM-DD.`);
  }
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== normalized
  ) {
    throw new Error(`${field} must be a valid calendar date.`);
  }
  return normalized;
}

function exceptionKey(exception) {
  return [
    exception.service,
    exception.vulnerabilityId,
    exception.packageName,
  ].join('|');
}

export function normalizeImageScanPolicy(value) {
  if (!isRecord(value)) throw new Error('Image scan policy must be an object.');
  if (value.schemaVersion !== 1) {
    throw new Error('Image scan policy schemaVersion must be 1.');
  }
  if (
    !Array.isArray(value.failSeverities) ||
    value.failSeverities.length === 0
  ) {
    throw new Error('failSeverities must contain at least one severity.');
  }

  const failSeverities = value.failSeverities.map((severity, index) => {
    const normalized = requireNonEmptyString(
      severity,
      `failSeverities[${index}]`,
    ).toUpperCase();
    if (!supportedSeverities.has(normalized)) {
      throw new Error(`Unsupported fail severity: ${normalized}.`);
    }
    return normalized;
  });
  if (new Set(failSeverities).size !== failSeverities.length) {
    throw new Error('failSeverities must not contain duplicates.');
  }

  if (!Array.isArray(value.exceptions)) {
    throw new Error('exceptions must be an array.');
  }
  const exceptions = value.exceptions.map((exception, index) => {
    if (!isRecord(exception)) {
      throw new Error(`exceptions[${index}] must be an object.`);
    }
    const service = requireNonEmptyString(
      exception.service,
      `exceptions[${index}].service`,
    );
    if (!supportedServices.has(service)) {
      throw new Error(`Unsupported exception service: ${service}.`);
    }
    return {
      service,
      vulnerabilityId: requireNonEmptyString(
        exception.vulnerabilityId,
        `exceptions[${index}].vulnerabilityId`,
      ),
      packageName: requireNonEmptyString(
        exception.packageName,
        `exceptions[${index}].packageName`,
      ),
      owner: requireNonEmptyString(
        exception.owner,
        `exceptions[${index}].owner`,
      ),
      reason: requireNonEmptyString(
        exception.reason,
        `exceptions[${index}].reason`,
      ),
      expires: parseDate(exception.expires, `exceptions[${index}].expires`),
    };
  });
  const keys = exceptions.map(exceptionKey);
  if (new Set(keys).size !== keys.length) {
    throw new Error(
      'exceptions must not contain duplicate service, vulnerability, and package tuples.',
    );
  }

  return { schemaVersion: 1, failSeverities, exceptions };
}

function collectVulnerabilities(report) {
  if (!isRecord(report) || !Array.isArray(report.Results)) return [];
  return report.Results.flatMap((result) => {
    if (!isRecord(result) || !Array.isArray(result.Vulnerabilities)) return [];
    return result.Vulnerabilities.filter(isRecord);
  });
}

export function evaluateImageScanReports({ policy, reports, now = new Date() }) {
  const normalizedPolicy = normalizeImageScanPolicy(policy);
  const today = now.toISOString().slice(0, 10);
  const expiredExceptions = normalizedPolicy.exceptions.filter(
    (exception) => exception.expires < today,
  );
  const activeExceptions = new Map(
    normalizedPolicy.exceptions
      .filter((exception) => exception.expires >= today)
      .map((exception) => [exceptionKey(exception), exception]),
  );
  const usedExceptions = new Set();
  const violations = [];

  for (const [service, report] of Object.entries(reports)) {
    if (!supportedServices.has(service)) {
      throw new Error(`Unsupported report service: ${service}.`);
    }
    for (const vulnerability of collectVulnerabilities(report)) {
      const severity = String(
        vulnerability.Severity ?? 'UNKNOWN',
      ).toUpperCase();
      if (!normalizedPolicy.failSeverities.includes(severity)) continue;
      const vulnerabilityId = requireNonEmptyString(
        vulnerability.VulnerabilityID,
        `${service} vulnerability ID`,
      );
      const packageName = requireNonEmptyString(
        vulnerability.PkgName,
        `${service} package name`,
      );
      const key = [service, vulnerabilityId, packageName].join('|');
      if (activeExceptions.has(key)) {
        usedExceptions.add(key);
        continue;
      }
      violations.push({
        service,
        vulnerabilityId,
        packageName,
        severity,
        installedVersion: String(vulnerability.InstalledVersion ?? ''),
        fixedVersion: String(vulnerability.FixedVersion ?? ''),
      });
    }
  }

  const allServicesScanned = [...supportedServices].every((service) =>
    Object.hasOwn(reports, service),
  );
  const unusedExceptions = allServicesScanned
    ? [...activeExceptions.values()].filter(
        (exception) => !usedExceptions.has(exceptionKey(exception)),
      )
    : [];

  return {
    policy: normalizedPolicy,
    expiredExceptions,
    unusedExceptions,
    violations,
  };
}

function parseArguments(arguments_) {
  const values = { reports: {} };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--validate-policy') {
      values.validatePolicy = true;
      continue;
    }
    if (!argument.startsWith('--')) {
      throw new Error(`Unknown argument: ${argument}.`);
    }
    const value = arguments_[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${argument} requires a value.`);
    }
    index += 1;
    if (argument === '--policy') values.policy = value;
    else if (argument === '--now') values.now = value;
    else if (argument === '--report') {
      const separator = value.indexOf('=');
      if (separator <= 0 || separator === value.length - 1) {
        throw new Error('--report must use service=path.');
      }
      values.reports[value.slice(0, separator)] = value.slice(separator + 1);
    } else throw new Error(`Unknown argument: ${argument}.`);
  }
  return values;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  const arguments_ = parseArguments(process.argv.slice(2));
  if (!arguments_.policy) throw new Error('--policy is required.');
  const policy = await readJson(arguments_.policy);
  const normalizedPolicy = normalizeImageScanPolicy(policy);
  if (arguments_.validatePolicy) {
    process.stdout.write(
      `Image scan policy is valid: ${normalizedPolicy.failSeverities.join(', ')}; ${normalizedPolicy.exceptions.length} exception(s).\n`,
    );
    return;
  }

  const reports = Object.fromEntries(
    await Promise.all(
      Object.entries(arguments_.reports).map(async ([service, path]) => [
        service,
        await readJson(path),
      ]),
    ),
  );
  for (const service of supportedServices) {
    if (!Object.hasOwn(reports, service)) {
      throw new Error(`A ${service} scan report is required.`);
    }
  }
  const now = arguments_.now
    ? new Date(`${parseDate(arguments_.now, '--now')}T00:00:00.000Z`)
    : new Date();
  const result = evaluateImageScanReports({ policy, reports, now });

  for (const exception of result.expiredExceptions) {
    console.error(
      `Expired image scan exception: ${exception.service} ${exception.vulnerabilityId} ${exception.packageName} expired ${exception.expires}.`,
    );
  }
  for (const exception of result.unusedExceptions) {
    console.error(
      `Unused image scan exception: ${exception.service} ${exception.vulnerabilityId} ${exception.packageName}.`,
    );
  }
  for (const violation of result.violations) {
    const fixed = violation.fixedVersion
      ? `; fixed in ${violation.fixedVersion}`
      : '; no fixed version reported';
    console.error(
      `${violation.service}: ${violation.severity} ${violation.vulnerabilityId} in ${violation.packageName}@${violation.installedVersion}${fixed}.`,
    );
  }

  const failures =
    result.expiredExceptions.length +
    result.unusedExceptions.length +
    result.violations.length;
  if (failures > 0) {
    throw new Error(`Image scan policy failed with ${failures} finding(s).`);
  }
  process.stdout.write('Image scan policy passed for api, worker, and web.\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
