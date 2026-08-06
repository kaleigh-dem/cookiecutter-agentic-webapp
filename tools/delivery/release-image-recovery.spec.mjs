import { describe, expect, it } from 'vitest';

import {
  manifestInspectionProvesAbsence,
  releaseBuildInputsFingerprint,
  verifyRecoveryLabels,
} from './release-image-recovery.mjs';

const buildInputs = {
  apiBaseUrl: 'https://api.example.com',
  authenticationProfile: 'oidc',
  authSessionEndpoint: '/auth/session/access-token',
  authSessionRefreshSkewSeconds: '30',
};

describe('release image recovery', () => {
  it('creates a stable fingerprint that changes with every compiled input', () => {
    const fingerprint = releaseBuildInputsFingerprint(buildInputs);
    expect(fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(releaseBuildInputsFingerprint({ ...buildInputs })).toBe(fingerprint);

    for (const [key, value] of Object.entries(buildInputs)) {
      expect(
        releaseBuildInputsFingerprint({
          ...buildInputs,
          [key]: `${value}-different`,
        }),
      ).not.toBe(fingerprint);
    }
  });

  it('accepts only explicit missing-manifest responses', () => {
    expect(
      manifestInspectionProvesAbsence(
        'no such manifest: ghcr.io/example/api:1.2.3',
      ),
    ).toBe(true);
    expect(
      manifestInspectionProvesAbsence('manifest unknown: manifest unknown'),
    ).toBe(true);

    for (const error of [
      '',
      'unauthorized: authentication required',
      'Get "https://ghcr.io/v2/": dial tcp: i/o timeout',
      'error response from daemon: denied',
    ]) {
      expect(manifestInspectionProvesAbsence(error)).toBe(false);
    }
  });

  it('allows recovery only for the original run and exact build inputs', () => {
    const fingerprint = releaseBuildInputsFingerprint(buildInputs);
    const expected = {
      version: '1.2.3',
      revision: '1'.repeat(40),
      runId: '123456789',
      buildInputsSha256: fingerprint,
    };
    const labels = {
      'org.opencontainers.image.version': expected.version,
      'org.opencontainers.image.revision': expected.revision,
      'io.steadystack.release.run-id': expected.runId,
      'io.steadystack.release.build-inputs-sha256': fingerprint,
    };

    expect(verifyRecoveryLabels(labels, expected)).toEqual(labels);
    expect(() =>
      verifyRecoveryLabels(labels, {
        ...expected,
        runId: '987654321',
      }),
    ).toThrow('not recoverable by this workflow run');
    expect(() =>
      verifyRecoveryLabels(labels, {
        ...expected,
        buildInputsSha256: `sha256:${'f'.repeat(64)}`,
      }),
    ).toThrow('not recoverable by this workflow run');
  });
});
