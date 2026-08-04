import { describe, expect, it } from 'vitest';

import {
  evaluateImageScanReports,
  normalizeImageScanPolicy,
} from './image-scan-policy.mjs';

const now = new Date('2026-08-03T12:00:00.000Z');

function report(
  vulnerabilities: readonly Readonly<Record<string, unknown>>[],
): Readonly<Record<string, unknown>> {
  return {
    Results: [{ Target: 'image', Vulnerabilities: vulnerabilities }],
  };
}

function reports(
  api: Readonly<Record<string, unknown>> = report([]),
): Readonly<Record<string, Readonly<Record<string, unknown>>>> {
  return { api, worker: report([]), web: report([]) };
}

const policy = {
  schemaVersion: 1,
  failSeverities: ['HIGH', 'CRITICAL'],
  exceptions: [],
} as const;

describe('image scan policy', () => {
  it('accepts the fail-closed baseline policy', () => {
    expect(normalizeImageScanPolicy(policy)).toEqual(policy);
  });

  it('fails high and critical findings while allowing lower severities', () => {
    const result = evaluateImageScanReports({
      policy,
      reports: reports(
        report([
          {
            VulnerabilityID: 'CVE-2026-1000',
            PkgName: 'runtime-one',
            Severity: 'MEDIUM',
          },
          {
            VulnerabilityID: 'CVE-2026-1001',
            PkgName: 'runtime-two',
            Severity: 'HIGH',
            InstalledVersion: '1.0.0',
            FixedVersion: '1.0.1',
          },
        ]),
      ),
      now,
    });

    expect(result.violations).toEqual([
      expect.objectContaining({
        service: 'api',
        vulnerabilityId: 'CVE-2026-1001',
        packageName: 'runtime-two',
        severity: 'HIGH',
      }),
    ]);
  });

  it('allows only an exact, active service and package exception', () => {
    const result = evaluateImageScanReports({
      policy: {
        ...policy,
        exceptions: [
          {
            service: 'api',
            vulnerabilityId: 'CVE-2026-2000',
            packageName: 'runtime',
            owner: 'security@example.test',
            reason: 'Upstream patch is scheduled.',
            expires: '2026-08-10',
          },
        ],
      },
      reports: reports(
        report([
          {
            VulnerabilityID: 'CVE-2026-2000',
            PkgName: 'runtime',
            Severity: 'CRITICAL',
          },
        ]),
      ),
      now,
    });

    expect(result.violations).toEqual([]);
    expect(result.unusedExceptions).toEqual([]);
  });

  it('fails expired and unused exceptions', () => {
    const result = evaluateImageScanReports({
      policy: {
        ...policy,
        exceptions: [
          {
            service: 'api',
            vulnerabilityId: 'CVE-2026-3000',
            packageName: 'expired-runtime',
            owner: 'security@example.test',
            reason: 'Expired test exception.',
            expires: '2026-08-02',
          },
          {
            service: 'web',
            vulnerabilityId: 'CVE-2026-3001',
            packageName: 'unused-runtime',
            owner: 'security@example.test',
            reason: 'Unused test exception.',
            expires: '2026-08-10',
          },
        ],
      },
      reports: reports(),
      now,
    });

    expect(result.expiredExceptions).toHaveLength(1);
    expect(result.unusedExceptions).toHaveLength(1);
  });

  it('rejects duplicate and broad exceptions', () => {
    const duplicate = {
      service: 'api',
      vulnerabilityId: 'CVE-2026-4000',
      packageName: 'runtime',
      owner: 'security@example.test',
      reason: 'Duplicate test exception.',
      expires: '2026-08-10',
    };

    expect(() =>
      normalizeImageScanPolicy({
        ...policy,
        exceptions: [duplicate, duplicate],
      }),
    ).toThrow(/duplicate/);
    expect(() =>
      normalizeImageScanPolicy({
        ...policy,
        exceptions: [{ ...duplicate, service: '*' }],
      }),
    ).toThrow(/Unsupported exception service/);
  });
});
