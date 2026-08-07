import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const auditScript = fileURLToPath(new URL('./check-audit.mjs', import.meta.url));
const baseline = JSON.parse(
  readFileSync(new URL('./audit-baseline.json', import.meta.url), 'utf8'),
);

function runAudit(report) {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'steadystack-audit-'));
  const payload = JSON.stringify(report);

  if (process.platform === 'win32') {
    const payloadPath = join(fixtureDir, 'pnpm-fixture.mjs');
    writeFileSync(
      payloadPath,
      `process.stdout.write(${JSON.stringify(payload)});\n`,
    );
    writeFileSync(
      join(fixtureDir, 'pnpm.cmd'),
      `@echo off\r\n"${process.execPath}" "${payloadPath}" %*\r\n`,
    );
  } else {
    const executable = join(fixtureDir, 'pnpm');
    writeFileSync(
      executable,
      `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(payload)});\n`,
    );
    chmodSync(executable, 0o755);
  }

  try {
    return spawnSync(process.execPath, [auditScript], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fixtureDir}${delimiter}${process.env.PATH ?? ''}`,
      },
    });
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

test('rejects unexpected nested GHSA advisories', () => {
  const advisoryId = 'GHSA-zzzz-yyyy-xxxx';
  const result = runAudit({
    vulnerabilities: {
      'demo-package': {
        name: 'demo-package',
        severity: 'high',
        via: [{ url: `https://github.com/advisories/${advisoryId}` }],
      },
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Unexpected high or critical dependency advisories:/,
  );
  assert.match(result.stderr, new RegExp(advisoryId));
});

test('accepts nested GHSA advisories present in the expiring baseline', () => {
  const advisoryId = baseline.advisories[0]?.id;
  assert.ok(advisoryId, 'audit baseline must contain at least one advisory');

  const result = runAudit({
    vulnerabilities: {
      'baseline-package': {
        name: 'baseline-package',
        severity: 'high',
        via: [{ url: `https://github.com/advisories/${advisoryId}` }],
      },
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, new RegExp(advisoryId));
  assert.match(
    result.stdout,
    /Dependency audit passed with 1 documented high\/critical advisories/,
  );
});

test('rejects unidentified nested high or critical findings', () => {
  const result = runAudit({
    vulnerabilities: {
      'demo-package': {
        name: 'demo-package',
        severity: 'critical',
        findings: [{ title: 'missing advisory identifier' }],
      },
    },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unidentified \(demo-package, critical\)/);
});
