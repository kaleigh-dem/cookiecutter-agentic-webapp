import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

async function repositoryFile(path) {
  return readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
}

describe('release workflow safety', () => {
  it('resolves runner temporary paths only at step runtime', async () => {
    const [releaseRecord, disasterRecovery] = await Promise.all([
      repositoryFile('.github/workflows/release-record.yml'),
      repositoryFile('.github/workflows/disaster-recovery.yml'),
    ]);

    expect(releaseRecord).not.toContain(
      'RECORD_DIRECTORY: ${{ runner.temp }}/release-record',
    );
    expect(releaseRecord).not.toContain(
      'RELEASE_MANIFEST: ${{ runner.temp }}/release-record/release-manifest.json',
    );
    expect(releaseRecord).toContain(
      'RECORD_DIRECTORY=$RUNNER_TEMP/release-record',
    );
    expect(releaseRecord).toContain(
      'RELEASE_MANIFEST=$RUNNER_TEMP/release-record/release-manifest.json',
    );

    expect(disasterRecovery).not.toContain(
      'RECOVERY_EVIDENCE_DIRECTORY: ${{ runner.temp }}/disaster-recovery-exercise',
    );
    expect(disasterRecovery).toContain(
      'RECOVERY_EVIDENCE_DIRECTORY=$RUNNER_TEMP/disaster-recovery-exercise',
    );
  });

  it('passes dispatch inputs to shell scripts through environment variables', async () => {
    const workflow = await repositoryFile(
      '.github/workflows/release-record.yml',
    );

    expect(workflow).toContain('RELEASE_VERSION: ${{ inputs.version }}');
    expect(workflow).toContain('--expected-version "$RELEASE_VERSION"');
    expect(workflow).not.toContain(
      '--expected-version "${{ inputs.version }}"',
    );

    expect(workflow).toContain(
      'BACKUP_IDENTIFIER: ${{ inputs.backup_identifier }}',
    );
    expect(workflow).toContain('SOURCE_RUN_ID: ${{ inputs.source_run_id }}');
    expect(workflow).toContain(
      'PROMOTION_RUN_ID: ${{ inputs.promotion_run_id }}',
    );
    expect(workflow).toContain(
      'SCHEMA_COMPATIBILITY: ${{ inputs.schema_compatibility }}',
    );
    expect(workflow).toContain(
      'ROLLBACK_WINDOW_MINUTES: ${{ inputs.rollback_window_minutes }}',
    );

    for (const unsafe of [
      '\`${{ inputs.source_run_id }}\`',
      '\`${{ inputs.promotion_run_id }}\`',
      '\`${{ inputs.backup_identifier }}\`',
      '\`${{ inputs.schema_compatibility }}\`',
      '\`${{ inputs.rollback_window_minutes }} minutes\`',
    ]) {
      expect(workflow).not.toContain(unsafe);
    }
  });
});
