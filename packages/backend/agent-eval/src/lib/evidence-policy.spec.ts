import { describe, expect, it } from 'vitest';

import { parseEvaluationEvidence } from './evidence';
import { assertPassingEvaluationEvidence } from './evidence-policy';

const passingEvidence = parseEvaluationEvidence({
  schemaVersion: 1,
  evidenceId: 'policy-fixture',
  taskId: 'P14-04',
  recordedAt: '2026-08-08T00:00:00.000Z',
  promptArtifacts: [],
  coveredChanges: [
    { kind: 'model', path: 'packages/backend/model/src/lib/model.ts' },
  ],
  checks: ['pnpm nx run backend-agent-eval:test'],
  budget: { minQualityScore: 1 },
  results: [
    {
      fixtureId: 'synthetic-policy',
      passed: true,
      qualityScore: 1,
      latencyMs: 1,
      budgetPassed: true,
    },
  ],
});

describe('evaluation evidence policy', () => {
  it('accepts evidence only when every result and budget passes', () => {
    expect(() =>
      assertPassingEvaluationEvidence(passingEvidence),
    ).not.toThrow();

    const failedCase = {
      ...passingEvidence,
      results: [{ ...passingEvidence.results[0]!, passed: false }],
    };
    expect(() => assertPassingEvaluationEvidence(failedCase)).toThrowError(
      /only passing results/,
    );

    const failedBudget = {
      ...passingEvidence,
      results: [{ ...passingEvidence.results[0]!, budgetPassed: false }],
    };
    expect(() => assertPassingEvaluationEvidence(failedBudget)).toThrowError(
      /only passing results/,
    );
  });
});
