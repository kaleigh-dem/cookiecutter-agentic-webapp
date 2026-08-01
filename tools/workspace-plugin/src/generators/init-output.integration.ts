import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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

async function captureOutputs(
  workspaceRoot: string,
): Promise<Record<string, string>> {
  const paths = [
    'workspace.template.json',
    'package.json',
    '.github/CODEOWNERS',
    '.env.example',
  ];

  return Object.fromEntries(
    await Promise.all(
      paths.map(
        async (relativePath) =>
          [
            relativePath,
            await readFile(path.join(workspaceRoot, relativePath), 'utf-8'),
          ] as const,
      ),
    ),
  );
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
    path.join(os.tmpdir(), 'agentic-webapp-init-'),
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
      'nx',
      'g',
      '@agentic-webapp/workspace-plugin:init',
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
    const first = await captureOutputs(temporaryRoot);
    await run('pnpm', args, temporaryRoot);
    const second = await captureOutputs(temporaryRoot);
    assert.deepEqual(
      second,
      first,
      'Initialization output is not deterministic.',
    );

    assert.match(first['workspace.template.json'] ?? '', /"slug": "smoke-app"/);
    assert.match(first['workspace.template.json'] ?? '', /"ai": true/);
    assert.match(first['package.json'] ?? '', /"name": "@smoke\/smoke-app"/);
    assert.match(
      first['.github/CODEOWNERS'] ?? '',
      /\/apps\/worker\/ @smoke-org\/platform @smoke-org\/security/,
    );
    assert.match(first['.env.example'] ?? '', /WEB_PORT=3100/);
    assert.match(first['.env.example'] ?? '', /localhost:55432\/smoke_app/);

    await run('pnpm', ['nx', 'sync:check'], temporaryRoot);
    console.log(
      'Parameterized workspace initialization is deterministic and valid.',
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
