import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

interface ProjectGraphNode {
  readonly data: {
    readonly root: string;
    readonly tags?: string[];
  };
}

interface ProjectGraph {
  readonly dependencies: Record<
    string,
    Array<{
      readonly source: string;
      readonly target: string;
      readonly type: string;
    }>
  >;
  readonly nodes: Record<string, ProjectGraphNode>;
}

interface ExportedProjectGraph {
  readonly graph?: ProjectGraph;
  readonly dependencies?: ProjectGraph['dependencies'];
  readonly nodes?: ProjectGraph['nodes'];
}

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

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf-8')) as T;
}

async function assertFileContains(
  workspaceRoot: string,
  relativePath: string,
  expected: string,
): Promise<void> {
  const content = await readFile(
    path.join(workspaceRoot, relativePath),
    'utf-8',
  );
  assert.ok(
    content.includes(expected),
    `${relativePath} does not contain ${JSON.stringify(expected)}.`,
  );
}

function assertTags(
  graph: ProjectGraph,
  projectName: string,
  expectedTags: string[],
): void {
  const project = graph.nodes[projectName];
  assert.ok(project, `Project graph does not contain ${projectName}.`);

  const actualTags = new Set(project.data.tags ?? []);
  for (const expectedTag of expectedTags) {
    assert.ok(
      actualTags.has(expectedTag),
      `${projectName} is missing expected tag ${expectedTag}.`,
    );
  }
}

function assertAllowedDependencies(
  graph: ProjectGraph,
  projectName: string,
  allowedProjectNames: Set<string>,
): void {
  for (const dependency of graph.dependencies[projectName] ?? []) {
    assert.ok(
      allowedProjectNames.has(dependency.target),
      `${projectName} has unexpected ${dependency.type} dependency on ${dependency.target}.`,
    );
  }
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
    path.join(os.tmpdir(), 'agentic-webapp-generators-'),
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

    const generator = '@agentic-webapp/workspace-plugin';
    await run(
      'pnpm',
      ['nx', 'g', `${generator}:domain`, 'smoke-domain'],
      temporaryRoot,
    );
    await run(
      'pnpm',
      ['nx', 'g', `${generator}:feature`, 'smoke-feature'],
      temporaryRoot,
    );
    await run(
      'pnpm',
      ['nx', 'g', `${generator}:job`, 'smoke-job', '--queue=smoke'],
      temporaryRoot,
    );
    await run(
      'pnpm',
      ['nx', 'g', `${generator}:contract`, 'smoke-contract'],
      temporaryRoot,
    );

    await assertFileContains(
      temporaryRoot,
      'packages/backend/smoke-domain/project.json',
      '"type:domain"',
    );
    await assertFileContains(
      temporaryRoot,
      'packages/web/features/smoke-feature/project.json',
      '"runtime:browser"',
    );
    await assertFileContains(
      temporaryRoot,
      'apps/worker/src/jobs/index.ts',
      "export * from './smoke-job';",
    );
    await assertFileContains(
      temporaryRoot,
      'packages/contracts/src/index.ts',
      "export * from './smoke-contract';",
    );
    await assertFileContains(
      temporaryRoot,
      'tsconfig.json',
      '"./packages/backend/smoke-domain"',
    );
    await assertFileContains(
      temporaryRoot,
      'tsconfig.json',
      '"./packages/web/features/smoke-feature"',
    );

    await run('pnpm', ['nx', 'sync:check'], temporaryRoot);

    const graphFile = path.join(temporaryRoot, 'project-graph.json');
    await run('pnpm', ['nx', 'graph', `--file=${graphFile}`], temporaryRoot);
    const exportedGraph = await readJson<ExportedProjectGraph>(graphFile);
    const graph = exportedGraph.graph ?? {
      dependencies: exportedGraph.dependencies ?? {},
      nodes: exportedGraph.nodes ?? {},
    };

    assertTags(graph, 'backend-smoke-domain', [
      'scope:backend',
      'type:domain',
      'runtime:node',
    ]);
    assertTags(graph, 'web-feature-smoke-feature', [
      'scope:web',
      'type:feature',
      'runtime:browser',
    ]);
    assert.ok(graph.nodes.worker, 'Project graph does not contain worker.');
    assert.ok(
      graph.nodes.contracts,
      'Project graph does not contain contracts.',
    );

    assertAllowedDependencies(
      graph,
      'backend-smoke-domain',
      new Set(['contracts']),
    );
    assertAllowedDependencies(
      graph,
      'web-feature-smoke-feature',
      new Set(['contracts', 'ui']),
    );

    await run(
      'pnpm',
      [
        'nx',
        'run-many',
        '-t',
        'lint',
        'typecheck',
        'test',
        'build',
        '-p',
        'backend-smoke-domain',
        'web-feature-smoke-feature',
        'worker',
        'contracts',
      ],
      temporaryRoot,
    );

    console.log(
      'Generated domain, feature, job, and contract output passed project-graph and target validation.',
    );
  } catch (error) {
    primaryError = error;
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
    const finalGitState = await captureGitState(workspaceRoot);
    assert.equal(
      finalGitState,
      initialGitState,
      'Generated-output validation changed the source checkout.',
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
