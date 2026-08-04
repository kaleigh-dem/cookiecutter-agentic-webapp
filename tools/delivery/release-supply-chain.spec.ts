import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

async function repositoryFile(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('release image supply chain', () => {
  it('creates and scans an SBOM for every production image', async () => {
    const workflow = await repositoryFile('.github/workflows/release.yml');

    for (const service of ['api', 'worker', 'web']) {
      expect(workflow).toContain(`${service}.spdx.json`);
      expect(workflow).toContain(`${service}.trivy.json`);
      expect(workflow).toContain(`--report ${service}=`);
    }
    expect(workflow.match(/anchore\/sbom-action@v0\.24\.0/g)).toHaveLength(3);
    expect(
      workflow.match(/aquasecurity\/trivy-action@v0\.36\.0/g),
    ).toHaveLength(3);
    expect(workflow).toContain('tools/security/image-scan-policy.json');
    expect(workflow).toContain('image-supply-chain-${{ inputs.version }}');
  });

  it('signs exact published digests and publishes provenance and SBOM attestations', async () => {
    const workflow = await repositoryFile('.github/workflows/release.yml');

    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('attestations: write');
    expect(workflow).toContain('artifact-metadata: write');
    expect(workflow).toContain('sigstore/cosign-installer@v4.1.2');
    expect(workflow).toContain('cosign sign --yes "$API_REFERENCE"');
    expect(workflow).toContain('cosign sign --yes "$WORKER_REFERENCE"');
    expect(workflow).toContain('cosign sign --yes "$WEB_REFERENCE"');
    expect(workflow.match(/actions\/attest@v4/g)).toHaveLength(6);
    expect(workflow.match(/push-to-registry: true/g)).toHaveLength(6);
    expect(workflow).toContain(
      'subject-digest: ${{ steps.digests.outputs.api-digest }}',
    );
    expect(workflow).toContain(
      'subject-digest: ${{ steps.digests.outputs.worker-digest }}',
    );
    expect(workflow).toContain(
      'subject-digest: ${{ steps.digests.outputs.web-digest }}',
    );
  });

  it('keeps the policy and verification contract in deterministic checks and documentation', async () => {
    const packageJson = JSON.parse(await repositoryFile('package.json')) as {
      scripts: Record<string, string>;
    };
    const documentation = await repositoryFile(
      'docs/delivery/image-supply-chain.md',
    );

    expect(packageJson.scripts['supply-chain:check']).toContain(
      'image-scan-policy.mjs',
    );
    expect(packageJson.scripts['delivery:check']).toContain(
      'supply-chain:check',
    );
    expect(documentation).toContain('cosign verify');
    expect(documentation).toContain('gh attestation verify');
    expect(documentation).toContain('https://spdx.dev/Document/v2.3');
  });
});
