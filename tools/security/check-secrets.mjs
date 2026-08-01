import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const allowMarker = 'security: allow-secret-pattern';
const excludedFiles = new Set([
  'pnpm-lock.yaml',
  'tools/security/check-secrets.mjs',
]);
const patterns = [
  {
    name: 'private key',
    expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  { name: 'AWS access key', expression: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub token', expression: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { name: 'Slack token', expression: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'Stripe live secret', expression: /\bsk_live_[A-Za-z0-9]{16,}\b/ },
];

const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean)
  .filter((file) => !excludedFiles.has(file));
const findings = [];

for (const file of trackedFiles) {
  const content = readFileSync(file);
  if (content.includes(0)) continue;

  const lines = content.toString('utf8').split('\n');
  for (const [index, line] of lines.entries()) {
    if (line.includes(allowMarker)) continue;
    for (const pattern of patterns) {
      if (pattern.expression.test(line)) {
        findings.push(`${file}:${index + 1}: ${pattern.name}`);
      }
      pattern.expression.lastIndex = 0;
    }
  }
}

if (findings.length > 0) {
  console.error('Potential committed secrets detected:');
  for (const finding of findings) console.error(`- ${finding}`);
  console.error(`Use "${allowMarker}" only for reviewed false positives.`);
  process.exitCode = 1;
} else {
  console.log(`Secret scan passed for ${trackedFiles.length} tracked files.`);
}
