const checks = [
  {
    name: 'web-home',
    environment: 'WEB_BASE_URL',
    path: '/',
    expectedStatus: 200,
  },
  {
    name: 'api-liveness',
    environment: 'API_BASE_URL',
    path: '/api/health/live',
    expectedStatus: 200,
  },
  {
    name: 'api-readiness',
    environment: 'API_BASE_URL',
    path: '/api/health/ready',
    expectedStatus: 200,
  },
  {
    name: 'metrics-require-authentication',
    environment: 'API_BASE_URL',
    path: '/api/metrics',
    expectedStatus: 401,
  },
];

async function runCheck(check) {
  const baseUrl = process.env[check.environment];
  if (!baseUrl) throw new Error(`${check.environment} is required.`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(new URL(check.path, baseUrl), {
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
    });
    return {
      name: check.name,
      expectedStatus: check.expectedStatus,
      status: response.status,
      passed: response.status === check.expectedStatus,
    };
  } catch (error) {
    return {
      name: check.name,
      expectedStatus: check.expectedStatus,
      error: error instanceof Error ? error.message : String(error),
      passed: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const results = [];
  for (const check of checks) results.push(await runCheck(check));

  process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
