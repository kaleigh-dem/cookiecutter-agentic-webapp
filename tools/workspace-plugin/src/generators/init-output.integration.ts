import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { templateVersion } from '../template-version';

const ignoredCopySegments = new Set([
  '.git',
  '.next',
  '.nx',
  'coverage',
  'dist',
  'node_modules',
  'test-output',
]);

function commandName(name: string): string {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function run(command: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      commandName(command),
      args,
      {
        cwd,
        encoding: 'utf-8',
        env: {
          ...process.env,
          CI: 'true',
          NX_DAEMON: 'false',
        },
        maxBuffer: 20 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              [`${command} ${args.join(' ')} failed.`, stdout, stderr]
                .filter(Boolean)
                .join('\n'),
              { cause: error },
            ),
          );
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function shouldCopy(workspaceRoot: string, source: string): boolean {
  const relativePath = path.relative(workspaceRoot, source);
  if (!relativePath) {
    return true;
  }
  if (relativePath === '.env') {
    return false;
  }
  return !relativePath
    .split(path.sep)
    .some((segment) => ignoredCopySegments.has(segment));
}

function isBinary(content: Buffer): boolean {
  return content.subarray(0, Math.min(content.length, 8192)).includes(0);
}

async function captureWorkspace(
  workspaceRoot: string,
  directory = '',
): Promise<Record<string, string>> {
  const entries = await readdir(path.join(workspaceRoot, directory), {
    withFileTypes: true,
  });
  const captured: Record<string, string> = {};

  for (const entry of entries) {
    const relativePath = directory
      ? path.join(directory, entry.name)
      : entry.name;
    if (
      relativePath
        .split(path.sep)
        .some((segment) => ignoredCopySegments.has(segment))
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      Object.assign(
        captured,
        await captureWorkspace(workspaceRoot, relativePath),
      );
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    const content = await readFile(path.join(workspaceRoot, relativePath));
    if (!isBinary(content)) {
      captured[relativePath.split(path.sep).join('/')] =
        content.toString('utf-8');
    }
  }

  return captured;
}

async function captureGitState(workspaceRoot: string): Promise<string> {
  return run(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    workspaceRoot,
  );
}

async function main(): Promise<void> {
  const workspaceRoot = process.cwd();
  const initialGitState = await captureGitState(workspaceRoot);
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'steadystack-init-'),
  );
  let primaryError: unknown;

  try {
    await cp(workspaceRoot, temporaryRoot, {
      dereference: false,
      filter: (source) => shouldCopy(workspaceRoot, source),
      recursive: true,
    });
    await run(
      'pnpm',
      ['install', '--offline', '--frozen-lockfile', '--ignore-scripts'],
      temporaryRoot,
    );

    const args = [
      'initialize:workspace',
      'smoke-app',
      '--displayName=Smoke Application',
      '--packageScope=@smoke',
      '--repositoryOwner=smoke-org',
      '--codeowners=@smoke-org/platform,@smoke-org/security',
      '--applications=worker,web,api',
      '--webPort=3100',
      '--apiPort=4100',
      '--databasePort=55432',
      '--databaseName=smoke_app',
      '--authentication=oidc',
      '--workerTransport=postgres',
      '--telemetry=true',
      '--deploymentProfile=containers',
      '--ai=true',
    ];

    await run('pnpm', args, temporaryRoot);
    await run(
      'pnpm',
      ['install', '--offline', '--frozen-lockfile', '--ignore-scripts'],
      temporaryRoot,
    );
    const first = await captureWorkspace(temporaryRoot);

    await run('pnpm', args, temporaryRoot);
    const second = await captureWorkspace(temporaryRoot);
    assert.deepEqual(
      second,
      first,
      'Repository-wide initialization output is not deterministic.',
    );

    assert.match(first['workspace.template.json'] ?? '', /"schemaVersion": 2/);
    assert.match(first['workspace.template.json'] ?? '', /"slug": "smoke-app"/);
    assert.match(first['workspace.template.json'] ?? '', /"ai": true/);
    assert.match(
      first['workspace.template.json'] ?? '',
      /"repository": "kaleigh-dem\/steady-stack"/,
    );
    assert.match(
      first['workspace.template.json'] ?? '',
      new RegExp(`"version": "${templateVersion.replaceAll('.', '\\.')}"`),
    );
    assert.match(first['package.json'] ?? '', /"name": "@smoke\/smoke-app"/);
    assert.doesNotMatch(first['package.json'] ?? '', /template:release:/);
    assert.doesNotMatch(first['package.json'] ?? '', /template:workspace:e2e/);
    assert.match(
      first['tools/workspace-plugin/package.json'] ?? '',
      /"name": "@smoke\/workspace-plugin"/,
    );
    assert.match(
      first['tools/workspace-plugin/package.json'] ?? '',
      /"private": true/,
    );
    assert.match(
      first['tsconfig.base.json'] ?? '',
      /"customConditions": \["@smoke\/source"\]/,
    );
    assert.match(
      first['infra/deploy/compose.preview.yaml'] ?? '',
      /name: smoke-app-preview/,
    );
    assert.match(
      first['infra/deploy/compose.preview.yaml'] ?? '',
      /POSTGRES_DB: smoke_app/,
    );
    assert.match(
      first['infra/deploy/compose.production.yaml'] ?? '',
      /app\.smoke-app\/version/,
    );
    assert.match(
      first['packages/database/src/client.ts'] ?? '',
      /smoke-app-database-client/,
    );
    assert.match(
      first['.github/CODEOWNERS'] ?? '',
      /\/apps\/worker\/ @smoke-org\/platform @smoke-org\/security/,
    );
    assert.match(first['.env.example'] ?? '', /WEB_PORT=3100/);
    assert.match(first['.env.example'] ?? '', /localhost:55432\/smoke_app/);
    assert.match(
      first['README.md'] ?? '',
      /kaleigh-dem\/steady-stack/,
    );
    assert.equal(first['.github/workflows/generated-workspace.yml'], undefined);
    assert.equal(first['.github/workflows/template-release.yml'], undefined);
    assert.equal(first['CHANGELOG.md'], undefined);
    assert.equal(first['docs/template-releases.md'], undefined);
    assert.equal(first['docs/template-validation.md'], undefined);
    assert.equal(
      first['tools/template/generated-workspace-e2e.mjs'],
      undefined,
    );
    assert.equal(first['tools/template/release.mjs'], undefined);
    assert.equal(first['tools/template/smoke-release-artifact.mjs'], undefined);

    await run('pnpm', ['template:identity:check'], temporaryRoot);
    await run('pnpm', ['nx', 'sync:check'], temporaryRoot);
    console.log(
      'Generated workspace identity is deterministic, versioned, identity-neutral, and valid.',
    );
  } catch (error) {
    primaryError = error;
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
    const finalGitState = await captureGitState(workspaceRoot);
    assert.equal(
      finalGitState,
      initialGitState,
      'Initialization validation changed the source checkout.',
    );
  }

  if (primaryError) {
    throw primaryError;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
