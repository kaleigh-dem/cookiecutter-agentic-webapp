import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const baseline = JSON.parse(
  readFileSync(new URL('./audit-baseline.json', import.meta.url), 'utf8'),
);
const expiresAt = Date.parse(`${baseline.expiresOn}T23:59:59Z`);
if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
  console.error(
    `The security audit baseline expired on ${baseline.expiresOn}.`,
  );
  process.exit(1);
}

const audit = spawnSync('pnpm', ['audit', '--json'], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
if (!audit.stdout.trim()) {
  process.stderr.write(audit.stderr);
  console.error('pnpm audit did not return JSON output.');
  process.exit(1);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch (error) {
  process.stderr.write(audit.stderr);
  console.error('Unable to parse pnpm audit JSON.', error);
  process.exit(1);
}

const highSeverity = new Map();
const ghsaPattern = /GHSA-[0-9A-Za-z-]+/g;

function directGhsaIds(value) {
  const candidates = [
    value.github_advisory_id,
    value.githubAdvisoryId,
    value.id,
    value.url,
  ];

  return candidates.flatMap((candidate) =>
    typeof candidate === 'string'
      ? [...candidate.matchAll(ghsaPattern)].map((match) => match[0])
      : [],
  );
}

function nestedGhsaIds(value) {
  const ids = new Set();

  function visitNested(nested) {
    if (Array.isArray(nested)) {
      nested.forEach(visitNested);
      return;
    }
    if (!nested || typeof nested !== 'object') return;

    for (const id of directGhsaIds(nested)) ids.add(id);
    for (const child of Object.values(nested)) visitNested(child);
  }

  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object') visitNested(nested);
  }

  return [...ids];
}

function visit(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, [...path, String(index)]));
    return;
  }
  if (!value || typeof value !== 'object') return;

  const severity = typeof value.severity === 'string' ? value.severity : '';
  if (severity === 'high' || severity === 'critical') {
    const ids = directGhsaIds(value);
    const packageName =
      value.name ??
      value.module_name ??
      value.package ??
      path.at(-1) ??
      'unknown';
    if (ids.length === 0 && nestedGhsaIds(value).length === 0) {
      highSeverity.set(`unidentified:${path.join('.')}`, {
        id: 'unidentified',
        packageName,
        severity,
      });
    }
    for (const id of ids) {
      highSeverity.set(id, { id, packageName, severity });
    }
  }

  for (const [key, nested] of Object.entries(value)) {
    visit(nested, [...path, key]);
  }
}
visit(report);

const allowed = new Map(
  baseline.advisories.map((advisory) => [advisory.id, advisory]),
);
const unexpected = [...highSeverity.values()].filter(
  (finding) => !allowed.has(finding.id),
);

for (const finding of highSeverity.values()) {
  const accepted = allowed.get(finding.id);
  if (accepted) {
    console.warn(
      `Accepted until ${baseline.expiresOn}: ${finding.id} (${accepted.package}) — ${accepted.reason}`,
    );
  }
}

if (unexpected.length > 0) {
  console.error('Unexpected high or critical dependency advisories:');
  for (const finding of unexpected) {
    console.error(
      `- ${finding.id} (${finding.packageName}, ${finding.severity})`,
    );
  }
  process.exit(1);
}

console.log(
  `Dependency audit passed with ${highSeverity.size} documented high/critical advisories and an expiring baseline.`,
);
