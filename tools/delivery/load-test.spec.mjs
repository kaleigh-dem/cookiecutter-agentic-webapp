import { describe, expect, it } from 'vitest';

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
