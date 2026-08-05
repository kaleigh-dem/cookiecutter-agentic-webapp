import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

function repositoryFileUrl(path: string): URL {
  return new URL(`../../${path}`, import.meta.url);
}

async function repositoryFile(path: string): Promise<string> {
  return readFile(repositoryFileUrl(path), 'utf8');
}

const hasSourceWorkflowContracts = existsSync(
  repositoryFileUrl('.github/workflows/generated-workspace.yml'),
);

// Keep the required PR workflows on one cancellation contract so a new commit supersedes every obsolete run together.
const pullRequestConcurrency =
  "group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}\n  cancel-in-progress: ${{ github.event_name == 'pull_request' }}";

describe('CI cancellation, caching, and diagnostics', () => {
  it('cancels only superseded pull-request runs in required workflows', async () => {
    if (!hasSourceWorkflowContracts) return;

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
    if (!hasSourceWorkflowContracts) return;

    const delivery = await repositoryFile('.github/workflows/delivery.yml');
    const generated = await repositoryFile(
      '.github/workflows/generated-workspace.yml',
    );
    const buildTool = await repositoryFile(
      'tools/delivery/build-container.mjs',
    );

    for (const workflow of [delivery, generated]) {
      expect(workflow).toContain('uses: docker/setup-buildx-action@v3');
      expect(workflow).toContain("BUILDKIT_CACHE_ENABLED: 'true'");
      expect(workflow).toContain('uses: actions/cache@v5');
      expect(workflow).toContain('continue-on-error: true');
    }
    expect(delivery).toContain('path: .cache/buildkit');
    expect(generated).toContain(
      'BUILDKIT_CACHE_DIR: ${{ github.workspace }}/../buildkit-cache',
    );
    expect(generated).toContain('path: ../buildkit-cache');
    expect(buildTool).toContain("BUILDKIT_CACHE_ENABLED === 'true'");
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

  it('retains actionable failure evidence with workflow-valid contexts', async () => {
    if (!hasSourceWorkflowContracts) return;

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
    expect(ci).toContain(
      'CI_DIAGNOSTICS_DIR: ${{ github.workspace }}/test-output/ci-diagnostics',
    );
    expect(delivery).toContain('service-logs.txt');
    expect(delivery).toContain('performance-report.json');
    expect(delivery).toContain('Upload delivery failure diagnostics');
    expect(delivery).toContain(
      'CI_DIAGNOSTICS_DIR: ${{ github.workspace }}/test-output/delivery-diagnostics',
    );
    expect(generated).toContain('generated-workspace-diagnostics-');
    expect(generated).toContain(
      'Validate generated workspace lifecycle\n        env:\n          CI_DIAGNOSTICS_DIR: ${{ runner.temp }}/generated-workspace/test-output',
    );
    for (const workflow of [ci, delivery]) {
      expect(workflow).not.toContain('CI_DIAGNOSTICS_DIR: ${{ runner.temp }}');
    }
    expect(playwright).toContain("trace: 'retain-on-failure'");
    expect(playwright).toContain("screenshot: 'only-on-failure'");
    expect(performance).toContain('PERFORMANCE_REPORT_PATH');
  });

  it('retains P13-03 evidence after later roadmap progress', async () => {
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
    expect(roadmap).toContain('- [x] **P13-04 Audit Nx cache inputs');
    expect(adr).toContain('cancel superseded pull-request runs');
    expect(documentation).toContain('BuildKit cache');
    expect(documentation).toContain('deterministic local fallback');
  });
});
