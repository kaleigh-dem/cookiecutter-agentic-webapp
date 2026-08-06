import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

async function repositoryFile(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('immutable release promotion', () => {
  it('reserves each semantic version while allowing exact-run recovery', async () => {
    const workflow = await repositoryFile('.github/workflows/release.yml');

    const apiProject = await repositoryFile('apps/api/project.json');
    const workerProject = await repositoryFile('apps/worker/project.json');
    const webProject = await repositoryFile('apps/web/project.json');
    const nodeDockerfile = await repositoryFile(
      'infra/docker/Dockerfile.node-service',
    );
    const webDockerfile = await repositoryFile('infra/docker/Dockerfile.web');

    expect(workflow).toContain('environment:\n      name: preview');
    expect(workflow).toContain(
      'concurrency:\n  group: release-images-${{ inputs.version }}\n  cancel-in-progress: false',
    );
    expect(workflow.indexOf('concurrency:')).toBeLessThan(
      workflow.indexOf('jobs:'),
    );
    expect(workflow).toContain('refs/heads/main');
    expect(workflow).toContain('Inspect release image state');
    expect(workflow).toContain('docker manifest inspect');

    expect(workflow).toContain('release-image-recovery.mjs fingerprint');
    expect(workflow).toContain('assert-manifest-absent');
    expect(workflow).toContain('verify-labels');
    expect(workflow).toContain('--run-id "$GITHUB_RUN_ID"');
    expect(workflow).toContain(
      '--build-inputs-sha256 "$RELEASE_BUILD_INPUTS_SHA256"',
    );
    expect(workflow).toContain('2>"$inspect_error"');
    expect(workflow).not.toContain('>/dev/null 2>&1');
    for (const project of [apiProject, workerProject, webProject]) {
      expect(project).toContain('RELEASE_RUN_ID=${GITHUB_RUN_ID:-local}');
      expect(project).toContain(
        'RELEASE_BUILD_INPUTS_SHA256=${RELEASE_BUILD_INPUTS_SHA256:-local}',
      );
    }
    for (const dockerfile of [nodeDockerfile, webDockerfile]) {
      expect(dockerfile).toContain('io.steadystack.release.run-id');
      expect(dockerfile).toContain(
        'io.steadystack.release.build-inputs-sha256',
      );
    }
    expect(workflow).toContain('if [ "$GITHUB_RUN_ATTEMPT" = \'1\' ]; then');
    expect(workflow).toContain(
      'Rerun the original failed Release images workflow to resume a partial publication.',
    );
    expect(nodeDockerfile).toContain('org.opencontainers.image.version');
    expect(nodeDockerfile).toContain('org.opencontainers.image.revision');
    expect(workflow).toContain('Push unpublished versioned images');
    expect(workflow).toContain(
      'if [ "$API_PUBLISHED" != \'true\' ]; then docker push "$API_IMAGE"; fi',
    );
    expect(workflow).toContain('overwrite: true');
    expect(workflow).not.toContain('push_images:');
    expect(workflow).not.toContain(
      'environment:\n        description: Release environment',
    );
    expect(workflow).toContain('release-manifest.mjs create');
    expect(workflow).toContain('--auth-session-refresh-skew-seconds');
    expect(workflow).toContain('release-plan.preview.json');
    expect(workflow).toContain('release-images-${{ inputs.version }}');
    expect(workflow).toContain(
      'API_DIGEST: ${{ steps.digests.outputs.api_digest }}',
    );
    expect(workflow).toContain(
      'WORKER_DIGEST: ${{ steps.digests.outputs.worker_digest }}',
    );
    expect(workflow).toContain(
      'WEB_DIGEST: ${{ steps.digests.outputs.web_digest }}',
    );
  });

  it('promotes only a successful main-branch release manifest', async () => {
    const workflow = await repositoryFile('.github/workflows/promote.yml');

    expect(workflow).toContain('  authorize:\n');
    expect(workflow).toContain(
      'if [ "$GITHUB_REF" != \'refs/heads/main\' ]; then',
    );
    expect(workflow).toContain('needs: authorize');
    expect(workflow).toContain("if: github.ref == 'refs/heads/main'");
    expect(workflow.indexOf('Require the default branch')).toBeLessThan(
      workflow.indexOf(
        'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
      ),
    );
    expect(workflow.indexOf('Require the default branch')).toBeLessThan(
      workflow.indexOf('environment:\n      name: production'),
    );
    expect(workflow).toContain('environment:\n      name: production');
    expect(workflow).toContain('actions: read');
    expect(workflow).toContain('attestations: read');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('packages: read');
    expect(workflow).not.toContain('packages: write');
    expect(workflow).not.toContain('id-token: write');
    expect(workflow).not.toContain('attestations: write');
    expect(workflow).toContain(
      'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c # v8',
    );
    expect(workflow).toContain('run-id: ${{ inputs.source_run_id }}');
    expect(workflow).toContain("workflowName: 'Release images'");
    expect(workflow).toContain("headBranch: 'main'");
    expect(workflow).toContain("event: 'workflow_dispatch'");
    expect(workflow).toContain("conclusion: 'success'");
    expect(workflow).toContain('--expected-run-id "$SOURCE_RUN_ID"');
    expect(workflow).toContain('--expected-commit-sha "$SOURCE_HEAD_SHA"');
  });

  it('verifies and plans the same digests without rebuilding or republishing', async () => {
    const workflow = await repositoryFile('.github/workflows/promote.yml');

    expect(workflow).not.toContain('containers:build');
    expect(workflow).not.toContain('docker push');
    expect(workflow).not.toContain('docker build');
    expect(workflow).toContain('production:check');
    expect(workflow).toContain('--compare-release-environment');
    expect(workflow).toContain('cosign verify "$reference"');
    expect(workflow.match(/gh attestation verify/g)).toHaveLength(2);
    expect(workflow).toContain('release-plan.production.json');
    expect(workflow).toContain(
      'No image was rebuilt, retagged, or pushed by this workflow.',
    );
  });

  it('keeps manifest validation in the deterministic delivery contract', async () => {
    const packageJson = JSON.parse(await repositoryFile('package.json')) as {
      scripts: Record<string, string>;
    };
    const documentation = await repositoryFile(
      'docs/delivery/releases-and-previews.md',
    );

    const wikiRelease = await repositoryFile('wiki/Releases-and-Upgrades.md');
    const wikiSupplyChain = await repositoryFile('wiki/Image-Supply-Chain.md');

    expect(packageJson.scripts['release:manifest:check']).toContain(
      'release-manifest.mjs validate',
    );
    expect(packageJson.scripts['delivery:check']).toContain(
      'release:manifest:check',
    );
    expect(documentation).toContain('required reviewers');
    expect(documentation).toContain('source workflow run ID');
    expect(documentation).toContain('does not build, retag, or push');
    expect(documentation).toContain(
      'serializes dispatches for the same semantic version',
    );
    expect(documentation).toContain(
      'Before checkout or production Environment access',
    );

    expect(documentation).toContain('same workflow run ID');
    expect(documentation).toContain('fail closed');
    expect(wikiRelease).toContain('same workflow run ID');
    expect(wikiSupplyChain).toContain('build-input fingerprint');
  });
});
