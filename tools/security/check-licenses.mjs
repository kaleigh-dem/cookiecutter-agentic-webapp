import { spawnSync } from 'node:child_process';

const deniedLicenses = new Set(['AGPL-3.0-only', 'GPL-3.0-only', 'SSPL-1.0']);
const result = spawnSync('pnpm', ['licenses', 'list', '--json', '--prod'], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
if (result.status !== 0 || !result.stdout.trim()) {
  process.stderr.write(result.stderr);
  console.error('Unable to produce the production dependency license report.');
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch (error) {
  console.error('Unable to parse the dependency license report.', error);
  process.exit(1);
}

const findings = new Set();
function containsDeniedLicense(value) {
  if (typeof value !== 'string') return false;
  return [...deniedLicenses].some((license) => {
    const escaped = license.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[()\\s])${escaped}(?:$|[()\\s])`).test(value);
  });
}

function visit(value, path = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, [...path, String(index)]));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, nested] of Object.entries(value)) {
    if (deniedLicenses.has(key) && Array.isArray(nested) && nested.length > 0) {
      findings.add(`${key}: ${nested.length} package(s)`);
    }
    if (
      key.toLowerCase().includes('license') &&
      containsDeniedLicense(nested)
    ) {
      findings.add(`${path.join('.') || 'root'}: ${nested}`);
    }
    visit(nested, [...path, key]);
  }
}
visit(report);

if (findings.size > 0) {
  console.error('Denied production dependency licenses detected:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log('Production dependency license policy passed.');
