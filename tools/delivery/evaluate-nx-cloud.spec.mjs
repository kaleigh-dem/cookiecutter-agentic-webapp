import { describe, expect, it } from 'vitest';

import { evaluateNxCloud } from './evaluate-nx-cloud.mjs';

const baseline = {
  source: { workflow: 'CI', runNumber: 235 },
  samples: [{ totalSeconds: 144 }],
  peakConcurrentPullRequests: 1,
  decisionThresholds: {
    medianTotalSeconds: 600,
    p95TotalSeconds: 900,
    peakConcurrentPullRequests: 3,
  },
};

describe('Nx Cloud evaluation', () => {
  it('defers adoption below measured thresholds', () => {
    expect(evaluateNxCloud(baseline).decision).toBe('defer');
  });

  it('recommends a trial when concurrency reaches the threshold', () => {
    expect(
      evaluateNxCloud({
        ...baseline,
        peakConcurrentPullRequests: 3,
      }).decision,
    ).toBe('evaluate-trial');
  });
});
