import { readFile } from 'node:fs/promises';

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}

export function evaluateNxCloud(baseline) {
  const totals = baseline.samples.map((sample) => sample.totalSeconds);
  const median = percentile(totals, 0.5);
  const p95 = percentile(totals, 0.95);
  const thresholds = baseline.decisionThresholds;
  const reasons = [];

  if (median >= thresholds.medianTotalSeconds) {
    reasons.push(
      `Median CI duration ${median}s exceeds ${thresholds.medianTotalSeconds}s.`,
    );
  }
  if (p95 >= thresholds.p95TotalSeconds) {
    reasons.push(`P95 CI duration ${p95}s exceeds ${thresholds.p95TotalSeconds}s.`);
  }
  if (
    baseline.peakConcurrentPullRequests >=
    thresholds.peakConcurrentPullRequests
  ) {
    reasons.push(
      `Peak concurrent pull requests ${baseline.peakConcurrentPullRequests} meets ${thresholds.peakConcurrentPullRequests}.`,
    );
  }

  return {
    decision: reasons.length > 0 ? 'evaluate-trial' : 'defer',
    medianTotalSeconds: median,
    p95TotalSeconds: p95,
    peakConcurrentPullRequests: baseline.peakConcurrentPullRequests,
    reasons:
      reasons.length > 0
        ? reasons
        : [
            'Measured CI duration and team concurrency remain below the adoption thresholds.',
          ],
    sampleCount: totals.length,
    source: baseline.source,
    thresholds,
  };
}

async function main() {
  const filePath = process.argv[2] ?? 'infra/ci/baseline.json';
  const baseline = JSON.parse(await readFile(filePath, 'utf8'));
  process.stdout.write(`${JSON.stringify(evaluateNxCloud(baseline), null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
