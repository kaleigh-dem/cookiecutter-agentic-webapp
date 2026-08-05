from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    if old not in text:
        raise SystemExit(f'{label} marker not found in {path}')
    file_path.write_text(text.replace(old, new, 1))


Path('.github/workflows/ci.yml').write_text(r'''name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  actions: read
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  affected:
    runs-on: ubuntu-latest
    env:
      CI_DIAGNOSTICS_DIR: ${{ runner.temp }}/ci-diagnostics
    steps:
      - uses: actions/checkout@v7
        with:
          filter: tree:0
          fetch-depth: 0

      - uses: pnpm/action-setup@v6.0.9
        with:
          version: 10.13.1

      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - uses: nrwl/nx-set-shas@v5

      - run: pnpm telemetry:check
      - run: pnpm contracts:check
      - run: pnpm contracts:compat
      - run: pnpm nx sync:check
      - run: pnpm format:check
      - run: pnpm delivery:check
      - name: Verify release tooling
        run: |
          mkdir -p "$CI_DIAGNOSTICS_DIR"
          node tools/delivery/release-plan.mjs \
            --environment preview \
            --image-prefix "ghcr.io/${{ github.repository_owner }}/agentic-webapp" \
            --version 0.0.0-ci \
            --output "$CI_DIAGNOSTICS_DIR/release-plan.json"
      - run: pnpm typecheck
      - name: Build workspace
        run: pnpm build
        env:
          NEXT_PUBLIC_AUTHENTICATION_PROFILE: none
      - name: Verify template release artifact
        run: |
          version=$(node -p "require('./package.json').version")
          release_directory="$RUNNER_TEMP/template-release"
          pnpm template:release:verify -- --version "$version"
          pnpm template:release:pack -- \
            --version "$version" \
            --output "$release_directory"
          pnpm template:release:smoke -- \
            --artifact "$release_directory/agentic-webapp-workspace-plugin-${version}.tgz" \
            --expected-version "$version"
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm nx affected -t e2e --parallel=1
      - name: Verify generated output and project graph
        run: pnpm nx run workspace-plugin:generated-output-smoke
      - name: Verify generated workspace identity
        run: pnpm nx run workspace-plugin:initialization-output-smoke
      - name: Verify validation leaves the checkout clean
        run: git diff --exit-code
      - run: pnpm nx affected -t lint test

      - name: Upload CI failure diagnostics
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: ci-failure-${{ github.run_id }}-${{ github.run_attempt }}
          path: ${{ env.CI_DIAGNOSTICS_DIR }}
          if-no-files-found: ignore
          retention-days: 14

  node-current-compatibility:
    name: Node 26 compatibility
    runs-on: ubuntu-latest
    continue-on-error: true
    steps:
      - uses: actions/checkout@v7

      - uses: pnpm/action-setup@v6.0.9
        with:
          version: 10.13.1

      - uses: actions/setup-node@v7
        with:
          node-version: 26
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm contracts:check
      - run: pnpm nx sync:check
      - run: pnpm typecheck
      - run: pnpm test
      - name: Build workspace
        run: pnpm build
        env:
          NEXT_PUBLIC_AUTHENTICATION_PROFILE: none
''')

Path('.github/workflows/delivery.yml').write_text(r'''name: Delivery

on:
  pull_request:
    paths:
      - '.github/workflows/delivery.yml'
      - 'apps/**'
      - 'infra/deploy/**'
      - 'infra/docker/**'
      - 'infra/environments/**'
      - 'packages/**'
      - 'performance/**'
      - 'tools/delivery/**'
      - 'package.json'
      - 'pnpm-lock.yaml'
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  preview:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      BUILDKIT_CACHE_DIR: ${{ github.workspace }}/.cache/buildkit
      CI_DIAGNOSTICS_DIR: ${{ runner.temp }}/delivery-diagnostics
      PERFORMANCE_REPORT_PATH: ${{ runner.temp }}/delivery-diagnostics/performance-report.json
    steps:
      - uses: actions/checkout@v7

      - uses: pnpm/action-setup@v6.0.9
        with:
          version: 10.13.1

      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm

      - name: Restore BuildKit cache
        continue-on-error: true
        uses: actions/cache@v5
        with:
          path: .cache/buildkit
          key: buildkit-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml', 'infra/docker/**', 'apps/api/project.json', 'apps/worker/project.json', 'apps/web/project.json') }}
          restore-keys: |
            buildkit-${{ runner.os }}-

      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm delivery:check
      - name: Build and start preview
        run: pnpm preview:up
      - name: Verify browser authentication in the preview image
        env:
          PLAYWRIGHT_USE_PREVIEW_IMAGE: 'true'
        run: pnpm nx run web-feature-agent-tasks:e2e
      - name: Enforce preview performance budgets
        env:
          API_BASE_URL: http://127.0.0.1:4000
          WEB_BASE_URL: http://127.0.0.1:3000
          WORKER_BASE_URL: http://127.0.0.1:4001
        run: pnpm performance:load
      - name: Capture service logs after failure
        if: failure()
        run: |
          mkdir -p "$CI_DIAGNOSTICS_DIR"
          docker compose --env-file infra/environments/preview.local.env -f infra/deploy/compose.preview.yaml logs --no-color > "$CI_DIAGNOSTICS_DIR/service-logs.txt" 2>&1 || true
          cat "$CI_DIAGNOSTICS_DIR/service-logs.txt"
      - name: Upload delivery failure diagnostics
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: delivery-failure-${{ github.run_id }}-${{ github.run_attempt }}
          path: ${{ env.CI_DIAGNOSTICS_DIR }}
          if-no-files-found: warn
          retention-days: 14
      - name: Tear down preview
        if: always()
        run: pnpm preview:down
''')

Path('.github/workflows/generated-workspace.yml').write_text(r'''name: Generated workspace

on:
  pull_request:
    paths:
      - '.github/workflows/generated-workspace.yml'
      - '.github/workflows/template-release.yml'
      - 'apps/**'
      - 'infra/**'
      - 'packages/**'
      - 'performance/**'
      - 'tools/delivery/**'
      - 'tools/security/**'
      - 'tools/template/**'
      - 'tools/workspace-plugin/**'
      - '.dockerignore'
      - '.gitignore'
      - '.node-version'
      - 'eslint.config.mjs'
      - 'nx.json'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'pnpm-workspace.yaml'
      - 'tsconfig*.json'
  push:
    branches: [main]
    paths:
      - '.github/workflows/generated-workspace.yml'
      - '.github/workflows/template-release.yml'
      - 'apps/**'
      - 'infra/**'
      - 'packages/**'
      - 'performance/**'
      - 'tools/delivery/**'
      - 'tools/security/**'
      - 'tools/template/**'
      - 'tools/workspace-plugin/**'
      - '.dockerignore'
      - '.gitignore'
      - '.node-version'
      - 'eslint.config.mjs'
      - 'nx.json'
      - 'package.json'
      - 'pnpm-lock.yaml'
      - 'pnpm-workspace.yaml'
      - 'tsconfig*.json'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  end-to-end:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    env:
      BUILDKIT_CACHE_DIR: ${{ github.workspace }}/.cache/buildkit
      CI_DIAGNOSTICS_DIR: ${{ runner.temp }}/generated-workspace/test-output
      PERFORMANCE_REPORT_PATH: ${{ runner.temp }}/generated-workspace/test-output/performance-report.json
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0

      - uses: pnpm/action-setup@v6.0.9
        with:
          version: 10.13.1

      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm

      - name: Restore BuildKit cache
        continue-on-error: true
        uses: actions/cache@v5
        with:
          path: .cache/buildkit
          key: generated-buildkit-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml', 'infra/docker/**', 'apps/api/project.json', 'apps/worker/project.json', 'apps/web/project.json') }}
          restore-keys: |
            generated-buildkit-${{ runner.os }}-

      - run: pnpm install --frozen-lockfile

      - name: Pack release candidate
        id: artifact
        run: |
          version=$(node -p "require('./package.json').version")
          release_directory="$RUNNER_TEMP/template-release"
          pnpm template:release:verify -- --version "$version"
          pnpm template:release:pack -- \
            --version "$version" \
            --output "$release_directory"
          echo "version=$version" >> "$GITHUB_OUTPUT"
          echo "path=$release_directory/agentic-webapp-workspace-plugin-${version}.tgz" >> "$GITHUB_OUTPUT"

      - name: Validate generated workspace lifecycle
        run: |
          pnpm template:workspace:e2e -- \
            --artifact "${{ steps.artifact.outputs.path }}" \
            --expected-version "${{ steps.artifact.outputs.version }}" \
            --workspace "$RUNNER_TEMP/generated-workspace"

      - name: Upload generated-workspace diagnostics
        if: failure()
        uses: actions/upload-artifact@v7
        with:
          name: generated-workspace-diagnostics-${{ github.run_id }}-${{ github.run_attempt }}
          path: ${{ runner.temp }}/generated-workspace/test-output
          if-no-files-found: ignore
          retention-days: 14
''')

Path('.github/workflows/security.yml').write_text(r'''name: Security

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: '17 6 * * 1'

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  package-policy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6.0.9
        with:
          version: 10.13.1
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Audit dependency vulnerabilities
        run: pnpm security:audit
      - name: Enforce production dependency licenses
        run: pnpm security:licenses

  secret-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - name: Scan tracked files for credential patterns
        run: node tools/security/check-secrets.mjs

  codeql:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v7
      - name: Initialize CodeQL
        uses: github/codeql-action/init@v4.37.4
        with:
          languages: javascript-typescript
          queries: security-extended
      - name: Analyze with CodeQL
        uses: github/codeql-action/analyze@v4.37.4
''')

Path('tools/delivery/build-container.mjs').write_text(r'''import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';

function required(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized || /[\r\n]/u.test(normalized)) {
    throw new Error(`${label} is required and must be one line.`);
  }
  return normalized;
}

export function parseBuildContainerArguments(arguments_) {
  const values = { buildArguments: [], context: '.' };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!argument?.startsWith('--')) {
      throw new Error(`Unknown build-container argument: ${argument}.`);
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${argument} requires a value.`);
    }
    index += 1;
    switch (argument) {
      case '--scope':
        values.scope = value;
        break;
      case '--file':
        values.file = value;
        break;
      case '--tag':
        values.tag = value;
        break;
      case '--target':
        values.target = value;
        break;
      case '--build-arg':
        values.buildArguments.push(value);
        break;
      case '--context':
        values.context = value;
        break;
      default:
        throw new Error(`Unknown build-container argument: ${argument}.`);
    }
  }
  return values;
}

export function createBuildxCommand(input, options = {}) {
  const scope = required(input.scope, 'Cache scope');
  const file = required(input.file, 'Dockerfile');
  const tag = required(input.tag, 'Image tag');
  const context = required(input.context ?? '.', 'Build context');
  const cacheRoot = resolve(
    options.cacheRoot ?? process.env.BUILDKIT_CACHE_DIR ?? '.cache/buildkit',
  );
  const currentCache = resolve(cacheRoot, scope);
  const nextCache = `${currentCache}.next`;
  const cacheExists = options.cacheExists ?? existsSync(currentCache);
  const arguments_ = [
    'buildx',
    'build',
    '--load',
    '--file',
    file,
    '--tag',
    tag,
  ];

  if (input.target) arguments_.push('--target', required(input.target, 'Target'));
  for (const buildArgument of input.buildArguments ?? []) {
    arguments_.push('--build-arg', required(buildArgument, 'Build argument'));
  }
  if (cacheExists) {
    arguments_.push('--cache-from', `type=local,src=${currentCache}`);
  }
  arguments_.push(
    '--cache-to',
    `type=local,dest=${nextCache},mode=max`,
    context,
  );

  return { arguments_, currentCache, nextCache };
}

export function runContainerBuild(input) {
  const command = createBuildxCommand(input);
  rmSync(command.nextCache, { recursive: true, force: true });
  mkdirSync(dirname(command.nextCache), { recursive: true });

  const result = spawnSync('docker', command.arguments_, {
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    rmSync(command.nextCache, { recursive: true, force: true });
    throw new Error(
      `docker ${command.arguments_.join(' ')} failed with status ${result.status ?? 'unknown'}.`,
    );
  }

  if (existsSync(command.nextCache)) {
    rmSync(command.currentCache, { recursive: true, force: true });
    renameSync(command.nextCache, command.currentCache);
  }
}

async function main() {
  runContainerBuild(parseBuildContainerArguments(process.argv.slice(2)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
''')

Path('tools/delivery/build-container.spec.mjs').write_text(r'''import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createBuildxCommand,
  parseBuildContainerArguments,
} from './build-container.mjs';

describe('BuildKit container builds', () => {
  it('uses an empty deterministic local cache when no restored cache exists', () => {
    const command = createBuildxCommand(
      {
        scope: 'api',
        file: 'infra/docker/Dockerfile.node-service',
        tag: 'example/api:test',
        buildArguments: ['SERVICE=api', 'APP_VERSION=1.2.3'],
        context: '.',
      },
      { cacheRoot: '.cache/example', cacheExists: false },
    );

    expect(command.arguments_).toEqual([
      'buildx',
      'build',
      '--load',
      '--file',
      'infra/docker/Dockerfile.node-service',
      '--tag',
      'example/api:test',
      '--build-arg',
      'SERVICE=api',
      '--build-arg',
      'APP_VERSION=1.2.3',
      '--cache-to',
      `type=local,dest=${resolve('.cache/example/api')}.next,mode=max`,
      '.',
    ]);
  });

  it('reuses a restored cache and writes a separate next cache', () => {
    const command = createBuildxCommand(
      {
        scope: 'web-runtime',
        file: 'infra/docker/Dockerfile.web',
        tag: 'example/web:test',
        target: 'runtime',
        buildArguments: [],
      },
      { cacheRoot: '.cache/example', cacheExists: true },
    );

    expect(command.arguments_).toContain('--cache-from');
    expect(command.arguments_).toContain(
      `type=local,src=${resolve('.cache/example/web-runtime')}`,
    );
    expect(command.arguments_).toContain('--target');
    expect(command.currentCache).not.toBe(command.nextCache);
  });

  it('parses repeated build arguments without depending on GitHub Actions', () => {
    expect(
      parseBuildContainerArguments([
        '--scope',
        'worker',
        '--file',
        'Dockerfile',
        '--tag',
        'worker:local',
        '--build-arg',
        'SERVICE=worker',
        '--build-arg',
        'APP_VERSION=development',
      ]),
    ).toEqual({
      scope: 'worker',
      file: 'Dockerfile',
      tag: 'worker:local',
      buildArguments: ['SERVICE=worker', 'APP_VERSION=development'],
      context: '.',
    });
  });
});
''')

Path('tools/delivery/ci-reliability.spec.ts').write_text(r'''import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

async function repositoryFile(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

const pullRequestConcurrency =
  "group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}\n  cancel-in-progress: ${{ github.event_name == 'pull_request' }}";

describe('CI cancellation, caching, and diagnostics', () => {
  it('cancels only superseded pull-request runs in required workflows', async () => {
    for (const path of [
      '.github/workflows/ci.yml',
      '.github/workflows/delivery.yml',
      '.github/workflows/security.yml',
      '.github/workflows/generated-workspace.yml',
    ]) {
      expect(await repositoryFile(path)).toContain(pullRequestConcurrency);
    }
  });

  it('persists optional BuildKit caches while retaining local fallback', async () => {
    const delivery = await repositoryFile('.github/workflows/delivery.yml');
    const generated = await repositoryFile(
      '.github/workflows/generated-workspace.yml',
    );
    const buildTool = await repositoryFile(
      'tools/delivery/build-container.mjs',
    );

    for (const workflow of [delivery, generated]) {
      expect(workflow).toContain('uses: actions/cache@v5');
      expect(workflow).toContain('continue-on-error: true');
      expect(workflow).toContain('path: .cache/buildkit');
    }
    expect(buildTool).toContain('type=local,src=');
    expect(buildTool).toContain('type=local,dest=');
    expect(buildTool).toContain('.cache/buildkit');
    expect(buildTool).not.toContain('ACTIONS_RUNTIME_TOKEN');

    for (const path of [
      'apps/api/project.json',
      'apps/worker/project.json',
      'apps/web/project.json',
    ]) {
      expect(await repositoryFile(path)).toContain(
        'tools/delivery/build-container.mjs',
      );
    }
  });

  it('retains actionable failure evidence', async () => {
    const ci = await repositoryFile('.github/workflows/ci.yml');
    const delivery = await repositoryFile('.github/workflows/delivery.yml');
    const generated = await repositoryFile(
      '.github/workflows/generated-workspace.yml',
    );
    const playwright = await repositoryFile(
      'packages/web/features/agent-tasks/playwright.config.ts',
    );
    const performance = await repositoryFile('tools/delivery/load-test.mjs');

    expect(ci).toContain('release-plan.json');
    expect(ci).toContain('Upload CI failure diagnostics');
    expect(delivery).toContain('service-logs.txt');
    expect(delivery).toContain('performance-report.json');
    expect(delivery).toContain('Upload delivery failure diagnostics');
    expect(generated).toContain('generated-workspace-diagnostics-');
    expect(playwright).toContain("trace: 'retain-on-failure'");
    expect(playwright).toContain("screenshot: 'only-on-failure'");
    expect(performance).toContain('PERFORMANCE_REPORT_PATH');
  });

  it('documents and records only P13-03 completion', async () => {
    const roadmap = await repositoryFile('docs/TODO.md');
    const adr = await repositoryFile(
      'docs/adr/0015-ci-cancellation-caching-and-diagnostics.md',
    );
    const documentation = await repositoryFile(
      'docs/delivery/containers-and-configuration.md',
    );

    expect(roadmap).toContain(
      '- [x] **P13-03 Improve CI cancellation, caching, and diagnostics.**',
    );
    expect(roadmap).toContain('- [ ] **P13-04 Audit Nx cache inputs');
    expect(adr).toContain('cancel superseded pull-request runs');
    expect(documentation).toContain('BuildKit cache');
    expect(documentation).toContain('deterministic local fallback');
  });
});
''')

Path('packages/web/features/agent-tasks/playwright.config.ts').write_text(r'''import { defineConfig } from '@playwright/test';

const usePreviewImage = process.env.PLAYWRIGHT_USE_PREVIEW_IMAGE === 'true';
const diagnosticsDirectory =
  process.env.CI_DIAGNOSTICS_DIR ?? 'test-output/ci-diagnostics';

export default defineConfig({
  testDir: './e2e',
  outputDir: `${diagnosticsDirectory}/playwright-results`,
  reporter: [
    ['list'],
    [
      'html',
      {
        open: 'never',
        outputFolder: `${diagnosticsDirectory}/playwright-report`,
      },
    ],
  ],
  use: {
    baseURL: usePreviewImage
      ? 'http://localhost:3000'
      : 'http://127.0.0.1:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: usePreviewImage
    ? undefined
    : {
        command:
          'pnpm exec next dev ../../../../apps/web --hostname 127.0.0.1 --port 3000',
        url: 'http://127.0.0.1:3000/agent-tasks',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
''')

Path('tools/delivery/load-test.mjs').write_text(r'''import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';

export function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}

export function evaluateScenario(scenario, measurements) {
  const errors = measurements.filter((measurement) => !measurement.ok).length;
  const errorRate = errors / Math.max(1, measurements.length);
  const p95Ms = percentile(
    measurements.map((measurement) => measurement.durationMs),
    0.95,
  );

  return {
    name: scenario.name,
    requests: measurements.length,
    errors,
    errorRate,
    p95Ms,
    maximumErrorRate: scenario.maximumErrorRate,
    maximumP95Ms: scenario.maximumP95Ms,
    passed:
      errorRate <= scenario.maximumErrorRate && p95Ms <= scenario.maximumP95Ms,
  };
}

export function validateBudgets(budgets) {
  const issues = [];
  if (budgets.schemaVersion !== 1) issues.push('schemaVersion must be 1.');
  if (
    !Number.isInteger(budgets.defaults?.requests) ||
    budgets.defaults.requests < 1
  ) {
    issues.push('defaults.requests must be a positive integer.');
  }
  if (
    !Number.isInteger(budgets.defaults?.concurrency) ||
    budgets.defaults.concurrency < 1
  ) {
    issues.push('defaults.concurrency must be a positive integer.');
  }
  if (!Array.isArray(budgets.scenarios) || budgets.scenarios.length === 0) {
    issues.push('At least one performance scenario is required.');
  }

  for (const scenario of budgets.scenarios ?? []) {
    if (!scenario.name) issues.push('Every scenario requires a name.');
    if (!scenario.baseUrlEnvironment) {
      issues.push(
        `${scenario.name ?? 'Scenario'} requires baseUrlEnvironment.`,
      );
    }
    if (!scenario.path?.startsWith('/')) {
      issues.push(`${scenario.name ?? 'Scenario'} path must start with '/'.`);
    }
    if (!(scenario.maximumP95Ms > 0)) {
      issues.push(
        `${scenario.name ?? 'Scenario'} maximumP95Ms must be positive.`,
      );
    }
    if (!(scenario.maximumErrorRate >= 0 && scenario.maximumErrorRate <= 1)) {
      issues.push(
        `${scenario.name ?? 'Scenario'} maximumErrorRate must be between 0 and 1.`,
      );
    }
  }
  return issues;
}

export function parseLoadTestArguments(arguments_, environment = process.env) {
  let filePath = 'performance/budgets.json';
  let filePathSet = false;
  let outputPath = environment.PERFORMANCE_REPORT_PATH?.trim() || undefined;
  let validateOnly = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--' || argument === '') continue;
    if (argument === '--validate-only') {
      validateOnly = true;
      continue;
    }
    if (argument === '--output') {
      const value = arguments_[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--output requires a path.');
      }
      outputPath = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--')) {
      throw new Error(`Unknown load-test option: ${argument}.`);
    }
    if (filePathSet) {
      throw new Error(`Unexpected load-test argument: ${argument}.`);
    }
    filePath = argument;
    filePathSet = true;
  }

  return { filePath, outputPath, validateOnly };
}

async function measureRequest(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    await response.arrayBuffer();
    return { durationMs: performance.now() - startedAt, ok: response.ok };
  } catch {
    return { durationMs: performance.now() - startedAt, ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function runScenario(scenario, defaults) {
  const baseUrl = process.env[scenario.baseUrlEnvironment];
  if (!baseUrl) {
    throw new Error(`${scenario.baseUrlEnvironment} is required.`);
  }

  const measurements = [];
  let nextRequest = 0;
  const workers = Array.from(
    { length: Math.min(defaults.concurrency, defaults.requests) },
    async () => {
      while (nextRequest < defaults.requests) {
        nextRequest += 1;
        measurements.push(
          await measureRequest(
            new URL(scenario.path, baseUrl).toString(),
            defaults.timeoutMs,
          ),
        );
      }
    },
  );
  await Promise.all(workers);
  return evaluateScenario(scenario, measurements);
}

async function writeReport(outputPath, report) {
  if (!outputPath) return;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
}

async function main() {
  const { filePath, outputPath, validateOnly } = parseLoadTestArguments(
    process.argv.slice(2),
  );
  const budgets = JSON.parse(await readFile(filePath, 'utf8'));
  const issues = validateBudgets(budgets);

  if (issues.length > 0) {
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }
  if (validateOnly) {
    console.log(`${filePath} contains valid performance budgets.`);
    return;
  }

  const results = [];
  for (const scenario of budgets.scenarios) {
    results.push(await runScenario(scenario, budgets.defaults));
  }
  const report = { results };
  await writeReport(outputPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
''')

Path('tools/delivery/load-test.spec.mjs').write_text(r'''import { describe, expect, it } from 'vitest';

import {
  evaluateScenario,
  parseLoadTestArguments,
  percentile,
  validateBudgets,
} from './load-test.mjs';

describe('performance budgets', () => {
  it('calculates nearest-rank percentiles', () => {
    expect(percentile([10, 20, 30, 40, 50], 0.95)).toBe(50);
  });

  it('fails scenarios that exceed latency or error budgets', () => {
    expect(
      evaluateScenario(
        {
          name: 'api',
          maximumP95Ms: 100,
          maximumErrorRate: 0,
        },
        [
          { durationMs: 20, ok: true },
          { durationMs: 150, ok: false },
        ],
      ).passed,
    ).toBe(false);
  });

  it('validates required budget fields', () => {
    expect(
      validateBudgets({
        schemaVersion: 1,
        defaults: { requests: 10, concurrency: 2 },
        scenarios: [
          {
            name: 'web',
            baseUrlEnvironment: 'WEB_BASE_URL',
            path: '/',
            maximumP95Ms: 500,
            maximumErrorRate: 0.01,
          },
        ],
      }),
    ).toEqual([]);
  });

  it('resolves a deterministic performance report path from CI or CLI', () => {
    expect(
      parseLoadTestArguments([], {
        PERFORMANCE_REPORT_PATH: '/tmp/performance.json',
      }),
    ).toEqual({
      filePath: 'performance/budgets.json',
      outputPath: '/tmp/performance.json',
      validateOnly: false,
    });
    expect(
      parseLoadTestArguments([
        'performance/custom.json',
        '--output',
        'test-output/report.json',
      ]),
    ).toEqual({
      filePath: 'performance/custom.json',
      outputPath: 'test-output/report.json',
      validateOnly: false,
    });
  });
});
''')

replace_once(
    'apps/api/project.json',
    'docker build --build-arg SERVICE=api --build-arg APP_VERSION=${APP_VERSION:-development} --build-arg VCS_REF=${GITHUB_SHA:-local} --build-arg RELEASE_RUN_ID=${GITHUB_RUN_ID:-local} --build-arg RELEASE_BUILD_INPUTS_SHA256=${RELEASE_BUILD_INPUTS_SHA256:-local} -f infra/docker/Dockerfile.node-service -t ${API_IMAGE:-agentic-webapp-api:local} .',
    'node tools/delivery/build-container.mjs --scope api --file infra/docker/Dockerfile.node-service --tag ${API_IMAGE:-agentic-webapp-api:local} --build-arg SERVICE=api --build-arg APP_VERSION=${APP_VERSION:-development} --build-arg VCS_REF=${GITHUB_SHA:-local} --build-arg RELEASE_RUN_ID=${GITHUB_RUN_ID:-local} --build-arg RELEASE_BUILD_INPUTS_SHA256=${RELEASE_BUILD_INPUTS_SHA256:-local}',
    'API BuildKit command',
)
replace_once(
    'apps/worker/project.json',
    'docker build --build-arg SERVICE=worker --build-arg APP_VERSION=${APP_VERSION:-development} --build-arg VCS_REF=${GITHUB_SHA:-local} --build-arg RELEASE_RUN_ID=${GITHUB_RUN_ID:-local} --build-arg RELEASE_BUILD_INPUTS_SHA256=${RELEASE_BUILD_INPUTS_SHA256:-local} -f infra/docker/Dockerfile.node-service -t ${WORKER_IMAGE:-agentic-webapp-worker:local} .',
    'node tools/delivery/build-container.mjs --scope worker --file infra/docker/Dockerfile.node-service --tag ${WORKER_IMAGE:-agentic-webapp-worker:local} --build-arg SERVICE=worker --build-arg APP_VERSION=${APP_VERSION:-development} --build-arg VCS_REF=${GITHUB_SHA:-local} --build-arg RELEASE_RUN_ID=${GITHUB_RUN_ID:-local} --build-arg RELEASE_BUILD_INPUTS_SHA256=${RELEASE_BUILD_INPUTS_SHA256:-local}',
    'worker BuildKit command',
)
replace_once(
    'apps/web/project.json',
    'docker build --target ${WEB_IMAGE_TARGET:-runtime} --build-arg APP_VERSION=${APP_VERSION:-development} --build-arg VCS_REF=${GITHUB_SHA:-local} --build-arg RELEASE_RUN_ID=${GITHUB_RUN_ID:-local} --build-arg RELEASE_BUILD_INPUTS_SHA256=${RELEASE_BUILD_INPUTS_SHA256:-local} --build-arg NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL:-http://localhost:4000} --build-arg NEXT_PUBLIC_AUTHENTICATION_PROFILE=${NEXT_PUBLIC_AUTHENTICATION_PROFILE:?NEXT_PUBLIC_AUTHENTICATION_PROFILE is required for web container builds} --build-arg NEXT_PUBLIC_AUTH_SESSION_ENDPOINT=${NEXT_PUBLIC_AUTH_SESSION_ENDPOINT:-} --build-arg NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS=${NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS:-30} -f infra/docker/Dockerfile.web -t ${WEB_IMAGE:-agentic-webapp-web:local} .',
    'node tools/delivery/build-container.mjs --scope web-${WEB_IMAGE_TARGET:-runtime} --file infra/docker/Dockerfile.web --tag ${WEB_IMAGE:-agentic-webapp-web:local} --target ${WEB_IMAGE_TARGET:-runtime} --build-arg APP_VERSION=${APP_VERSION:-development} --build-arg VCS_REF=${GITHUB_SHA:-local} --build-arg RELEASE_RUN_ID=${GITHUB_RUN_ID:-local} --build-arg RELEASE_BUILD_INPUTS_SHA256=${RELEASE_BUILD_INPUTS_SHA256:-local} --build-arg NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL:-http://localhost:4000} --build-arg NEXT_PUBLIC_AUTHENTICATION_PROFILE=${NEXT_PUBLIC_AUTHENTICATION_PROFILE:?NEXT_PUBLIC_AUTHENTICATION_PROFILE is required for web container builds} --build-arg NEXT_PUBLIC_AUTH_SESSION_ENDPOINT=${NEXT_PUBLIC_AUTH_SESSION_ENDPOINT:-} --build-arg NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS=${NEXT_PUBLIC_AUTH_SESSION_REFRESH_SKEW_SECONDS:-30}',
    'web BuildKit command',
)

replace_once(
    '.gitignore',
    '.nx/\n',
    '.nx/\n.cache/\n',
    'BuildKit cache ignore',
)

Path('docs/adr/0015-ci-cancellation-caching-and-diagnostics.md').write_text(r'''# ADR 0015: CI cancellation, caching, and failure diagnostics

- Status: Accepted
- Date: 2026-08-05

## Context

The required pull-request workflows run independent CI, delivery, security, and generated-workspace validation. Before this decision, most workflows continued after a newer commit superseded them, production image targets invoked uncached `docker build`, and failure evidence was split between console output and ephemeral runner directories. The result was unnecessary runner consumption and failures that were harder to reproduce or diagnose.

The repository must remain usable without a hosted cache service. Local and generated workspaces also need the same image-build command as CI, and a cache outage must not change image contents or block validation.

## Decision

1. CI, Delivery, Security, and Generated workspace use a concurrency group keyed by workflow and pull-request number. They cancel superseded pull-request runs, but do not cancel `main`, scheduled, or manually dispatched runs.
2. Production container targets use `docker buildx build --load` through `tools/delivery/build-container.mjs`.
   - Every service uses a separate local BuildKit cache scope.
   - A build imports the current cache only when it exists and exports to a separate next directory before atomically replacing the current cache.
   - The default cache root is `.cache/buildkit`; local execution with an empty directory is the deterministic fallback.
3. Delivery and generated-workspace CI persist `.cache/buildkit` with the official GitHub cache action. Cache restore failures are non-blocking, so an unavailable remote cache produces a normal uncached BuildKit build rather than a different command or a failed workflow.
4. Playwright retains traces, screenshots, video, and an HTML report only when useful for failures.
5. CI failure artifacts use stable diagnostic directories and retain, when produced:
   - Playwright results and reports;
   - preview service logs;
   - JSON performance results;
   - generated-workspace diagnostics;
   - the CI release plan.
6. Diagnostic uploads run only after failure and use bounded retention. They must not expose production secrets; workflows continue to use local preview configuration and release plans containing public metadata only.

## Consequences

- New commits stop obsolete pull-request validation while protected branch and scheduled runs remain complete.
- Warm Docker layers can be reused across CI runs, and the same build command works without GitHub cache access.
- The cache is an optimization only. Deleting `.cache/buildkit` must not change the image produced from the same source and build arguments.
- Failures retain enough evidence for browser, service, performance, generated-workspace, and release-plan investigation.
- Cache-input completeness for all Nx and environment-sensitive tasks remains P13-04; this decision does not introduce Nx Cloud or broaden affected execution.
''')

replace_once(
    'docs/delivery/containers-and-configuration.md',
    '## Validate configuration\n',
    '''## BuildKit cache behavior\n\nContainer targets use `docker buildx build --load` and keep service-scoped BuildKit state under `.cache/buildkit`. The command works with an empty directory, so deleting the cache or running without GitHub Actions always produces the deterministic local fallback. CI may restore and save that directory through `actions/cache`, but cache restore failures are non-blocking and never select a different Dockerfile, target, tag, or build argument.\n\nSet `BUILDKIT_CACHE_DIR` to move the local cache outside the workspace. The cache is ignored by Git and may be removed safely:\n\n```bash\nrm -rf .cache/buildkit\npnpm containers:build\n```\n\nPull-request workflows cancel only superseded runs for the same PR. Failed CI and delivery runs retain bounded diagnostic artifacts containing Playwright traces/screenshots/reports, preview service logs, JSON performance results, generated-workspace output, and the CI release plan when those files were produced.\n\n## Validate configuration\n''',
    'container cache documentation',
)

roadmap = Path('docs/TODO.md')
text = roadmap.read_text()
text = text.replace('Last updated: 2026-08-04', 'Last updated: 2026-08-05', 1)
old_progress = 'Phase 13 progress record (2026-08-04): P13-01 is completed in reviewed PR #50 and squash commit `d4766a30d2e39f308a830ce4c6099edfe3ed045c`, after reviewer PASS for exact head `f9c97a3f58dacf654a14df439d7c78344b9612f4` and successful CI #590, Delivery #333, Security #414, and Generated Workspace #269. P13-02 is the only active Phase 13 task.'
new_progress = 'Phase 13 progress record (2026-08-05): P13-01 is completed in reviewed PR #50 and squash commit `d4766a30d2e39f308a830ce4c6099edfe3ed045c`. P13-02 is completed in PR #52 and was hardened in PR #53. P13-03 adds pull-request cancellation, optional persisted BuildKit caches with deterministic local fallback, and retained failure diagnostics. P13-04 is the next planned task.'
if old_progress not in text:
    raise SystemExit('Phase 13 progress marker not found')
text = text.replace(old_progress, new_progress, 1)
text = text.replace(
    '- [-] **P13-02 Promote digests instead of rebuilding releases.**',
    '- [x] **P13-02 Promote digests instead of rebuilding releases.**',
    1,
)
text = text.replace(
    '- [ ] **P13-03 Improve CI cancellation, caching, and diagnostics.**',
    '- [x] **P13-03 Improve CI cancellation, caching, and diagnostics.**',
    1,
)
roadmap.write_text(text)
