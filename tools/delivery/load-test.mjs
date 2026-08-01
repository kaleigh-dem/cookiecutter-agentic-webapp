import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

export function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
  return sorted[index] ?? 0;
}

export function evaluateScenario(scenario, measurements) {
  const errors = measurements.filter((measurement) => !measurement.ok).length;
  const errorRate = errors / Math.max(1, measurements.length);
  const p95Ms = percentile(
    measurements.map((measurement) => measurement.durationMs),
    0.95,
  );

  return {
    name: scenario.name,
    requests: measurements.length,
    errors,
    errorRate,
    p95Ms,
    maximumErrorRate: scenario.maximumErrorRate,
    maximumP95Ms: scenario.maximumP95Ms,
    passed:
      errorRate <= scenario.maximumErrorRate && p95Ms <= scenario.maximumP95Ms,
  };
}

export function validateBudgets(budgets) {
  const issues = [];
  if (budgets.schemaVersion !== 1) issues.push('schemaVersion must be 1.');
  if (
    !Number.isInteger(budgets.defaults?.requests) ||
    budgets.defaults.requests < 1
  ) {
    issues.push('defaults.requests must be a positive integer.');
  }
  if (
    !Number.isInteger(budgets.defaults?.concurrency) ||
    budgets.defaults.concurrency < 1
  ) {
    issues.push('defaults.concurrency must be a positive integer.');
  }
  if (!Array.isArray(budgets.scenarios) || budgets.scenarios.length === 0) {
    issues.push('At least one performance scenario is required.');
  }

  for (const scenario of budgets.scenarios ?? []) {
    if (!scenario.name) issues.push('Every scenario requires a name.');
    if (!scenario.baseUrlEnvironment) {
      issues.push(
        `${scenario.name ?? 'Scenario'} requires baseUrlEnvironment.`,
      );
    }
    if (!scenario.path?.startsWith('/')) {
      issues.push(`${scenario.name ?? 'Scenario'} path must start with '/'.`);
    }
    if (!(scenario.maximumP95Ms > 0)) {
      issues.push(
        `${scenario.name ?? 'Scenario'} maximumP95Ms must be positive.`,
      );
    }
    if (!(scenario.maximumErrorRate >= 0 && scenario.maximumErrorRate <= 1)) {
      issues.push(
        `${scenario.name ?? 'Scenario'} maximumErrorRate must be between 0 and 1.`,
      );
    }
  }
  return issues;
}

async function measureRequest(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    await response.arrayBuffer();
    return { durationMs: performance.now() - startedAt, ok: response.ok };
  } catch {
    return { durationMs: performance.now() - startedAt, ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function runScenario(scenario, defaults) {
  const baseUrl = process.env[scenario.baseUrlEnvironment];
  if (!baseUrl) {
    throw new Error(`${scenario.baseUrlEnvironment} is required.`);
  }

  const measurements = [];
  let nextRequest = 0;
  const workers = Array.from(
    { length: Math.min(defaults.concurrency, defaults.requests) },
    async () => {
      while (nextRequest < defaults.requests) {
        nextRequest += 1;
        measurements.push(
          await measureRequest(
            new URL(scenario.path, baseUrl).toString(),
            defaults.timeoutMs,
          ),
        );
      }
    },
  );
  await Promise.all(workers);
  return evaluateScenario(scenario, measurements);
}

async function main() {
  const arguments_ = process.argv.slice(2);
  const validateOnly = arguments_.includes('--validate-only');
  const filePath =
    arguments_.find((argument) => !argument.startsWith('--')) ??
    'performance/budgets.json';
  const budgets = JSON.parse(await readFile(filePath, 'utf8'));
  const issues = validateBudgets(budgets);

  if (issues.length > 0) {
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }
  if (validateOnly) {
    console.log(`${filePath} contains valid performance budgets.`);
    return;
  }

  const results = [];
  for (const scenario of budgets.scenarios) {
    results.push(await runScenario(scenario, budgets.defaults));
  }
  process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
