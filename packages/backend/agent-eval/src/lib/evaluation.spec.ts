import { describe, expect, it, vi } from 'vitest';

import {
  estimateEvaluationCostUsd,
  evaluateEvaluationBudget,
  EvaluationError,
  runEvaluationCase,
  type EvaluationEvaluator,
} from './evaluation';

describe('evaluation lifecycle', () => {
  it('runs a deterministic rule evaluation and tracks quality, latency, tokens, and cost', async () => {
    const ticks = [1_000, 1_005];
    const clock = () => ticks.shift() ?? 1_005;

    const result = await runEvaluationCase({
      fixture: {
        id: 'synthetic-echo',
        classification: 'synthetic',
        input: 'hello',
        expected: 'echo:hello',
      },
      subject: async (input) => ({
        output: `echo:${input}`,
        providerId: 'deterministic',
        modelId: 'fixture-model',
        usage: {
          inputTokens: 8,
          outputTokens: 4,
          totalTokens: 12,
          cachedInputTokens: 2,
        },
      }),
      evaluators: [
        {
          id: 'exact-output',
          kind: 'rule',
          evaluate: ({ output, expected }) => ({
            score: output === expected ? 1 : 0,
            passed: output === expected,
            code: output === expected ? 'exact_match' : 'mismatch',
          }),
        },
      ],
      budget: {
        minQualityScore: 1,
        maxLatencyMs: 25,
        maxTotalTokens: 20,
        maxEstimatedCostUsd: 0.00002,
      },
      pricing: {
        inputUsdPerMillionTokens: 1,
        outputUsdPerMillionTokens: 2,
        cachedInputUsdPerMillionTokens: 0.5,
      },
      clock,
    });

    expect(result).toMatchObject({
      fixtureId: 'synthetic-echo',
      classification: 'synthetic',
      passed: true,
      qualityScore: 1,
      latencyMs: 5,
      providerId: 'deterministic',
      modelId: 'fixture-model',
      usage: {
        inputTokens: 8,
        outputTokens: 4,
        totalTokens: 12,
        cachedInputTokens: 2,
      },
      budget: { passed: true, violations: [] },
    });
    expect(result.estimatedCostUsd).toBeCloseTo(0.000015, 10);
    expect(result).not.toHaveProperty('output');
    expect(result).not.toHaveProperty('input');
  });

  it('supports an application-supplied model grader without choosing a provider', async () => {
    const grader: EvaluationEvaluator<string, string, string> = {
      id: 'semantic-grader',
      kind: 'model_grader',
      evaluate: async ({ output, expected }) => ({
        score: output.startsWith(expected) ? 0.9 : 0,
        passed: output.startsWith(expected),
        code: 'semantic_fixture_grade',
      }),
    };

    const result = await runEvaluationCase({
      fixture: {
        id: 'synthetic-model-grade',
        classification: 'redacted',
        input: 'request',
        expected: 'accepted',
      },
      subject: () => ({ output: 'accepted with detail' }),
      evaluators: [grader],
      budget: { minQualityScore: 0.8, maxLatencyMs: 10 },
      clock: vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(11),
    });

    expect(result.metrics).toEqual([
      {
        evaluatorId: 'semantic-grader',
        evaluatorKind: 'model_grader',
        score: 0.9,
        passed: true,
        code: 'semantic_fixture_grade',
      },
    ]);
    expect(result.passed).toBe(true);
  });

  it('fails closed on production-derived fixtures without data review', async () => {
    const subject = vi.fn(() => ({ output: 'never' }));

    await expect(
      runEvaluationCase({
        fixture: {
          id: 'production-fixture',
          classification: 'production-derived',
          input: 'sensitive',
          expected: 'never',
        },
        subject,
        evaluators: [
          {
            id: 'rule',
            kind: 'rule',
            evaluate: () => ({ score: 1, passed: true, code: 'pass' }),
          },
        ],
        budget: {},
      }),
    ).rejects.toMatchObject({ code: 'invalid_fixture' });
    expect(subject).not.toHaveBeenCalled();
  });

  it('reports missing usage and cost when configured budgets require them', () => {
    expect(
      evaluateEvaluationBudget(
        { qualityScore: 1, latencyMs: 1 },
        { maxTotalTokens: 100, maxEstimatedCostUsd: 0.01 },
      ),
    ).toEqual({
      passed: false,
      violations: ['usage_missing', 'estimated_cost_missing'],
    });
  });

  it('validates cached token accounting before estimating cost', () => {
    expect(() =>
      estimateEvaluationCostUsd(
        {
          inputTokens: 2,
          outputTokens: 1,
          totalTokens: 3,
          cachedInputTokens: 3,
        },
        { inputUsdPerMillionTokens: 1, outputUsdPerMillionTokens: 2 },
      ),
    ).toThrowError(EvaluationError);
  });
});
