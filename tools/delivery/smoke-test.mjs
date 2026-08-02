import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUEST_TIMEOUT_MS = 5_000;
const WORKFLOW_TIMEOUT_MS = 15_000;
const WORKFLOW_POLL_INTERVAL_MS = 250;
const RELEASE_PROFILE = 'release';
const LIVE_AGENT_TASK_PROFILE = 'live-agent-task';

export const releaseChecks = [
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

export const workerChecks = [
  {
    name: 'worker-liveness',
    environment: 'WORKER_BASE_URL',
    path: '/health/live',
    expectedStatus: 200,
  },
  {
    name: 'worker-readiness',
    environment: 'WORKER_BASE_URL',
    path: '/health/ready',
    expectedStatus: 200,
  },
  {
    name: 'worker-metrics',
    environment: 'WORKER_BASE_URL',
    path: '/metrics',
    expectedStatus: 200,
  },
];

function requiredEnvironment(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function smokeProfile(profile) {
  const normalized = profile?.trim() || RELEASE_PROFILE;
  if (![RELEASE_PROFILE, LIVE_AGENT_TASK_PROFILE].includes(normalized)) {
    throw new Error(
      `Smoke profile must be ${RELEASE_PROFILE} or ${LIVE_AGENT_TASK_PROFILE}.`,
    );
  }
  return normalized;
}

function profileArgument(arguments_) {
  const index = arguments_.indexOf('--profile');
  if (index < 0) return undefined;
  const value = arguments_[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error('--profile requires a value.');
  }
  return value;
}

async function requestWithTimeout(
  url,
  init,
  fetchImplementation,
  timeoutMs = REQUEST_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImplementation(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function runCheck(
  check,
  {
    environment = process.env,
    fetchImplementation = fetch,
    timeoutMs = REQUEST_TIMEOUT_MS,
  } = {},
) {
  const baseUrl = requiredEnvironment(environment, check.environment);

  try {
    const response = await requestWithTimeout(
      new URL(check.path, baseUrl),
      { redirect: 'manual' },
      fetchImplementation,
      timeoutMs,
    );
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
      error: errorMessage(error),
      passed: false,
    };
  }
}

export async function runAgentTaskWorkflow({
  environment = process.env,
  fetchImplementation = fetch,
  createId = randomUUID,
  sleep = (milliseconds) =>
    new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
  pollIntervalMs = WORKFLOW_POLL_INTERVAL_MS,
  timeoutMs = WORKFLOW_TIMEOUT_MS,
} = {}) {
  const name = 'agent-task-terminal-workflow';
  const apiBaseUrl = requiredEnvironment(environment, 'API_BASE_URL');
  const accessToken = requiredEnvironment(
    environment,
    'AUTH_DEVELOPMENT_TOKEN',
  );
  const correlationId = `preview-${createId()}`;
  const title = `Preview workflow ${createId()}`;
  const headers = {
    authorization: `Bearer ${accessToken}`,
    'content-type': 'application/json',
    'x-correlation-id': correlationId,
  };

  let createdResponse;
  try {
    createdResponse = await requestWithTimeout(
      new URL('/api/agent-tasks', apiBaseUrl),
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title,
          prompt: 'Prove the deployed transactional outbox worker path.',
        }),
      },
      fetchImplementation,
    );
  } catch (error) {
    return { name, error: errorMessage(error), passed: false };
  }

  const created = await responseJson(createdResponse);
  if (
    createdResponse.status !== 201 ||
    !created ||
    typeof created.id !== 'string'
  ) {
    return {
      name,
      status: createdResponse.status,
      response: created,
      error: 'The API did not create an Agent Task.',
      passed: false,
    };
  }

  const maximumPolls = Math.max(1, Math.ceil(timeoutMs / pollIntervalMs));
  let lastStatus = created.status;

  for (let poll = 0; poll < maximumPolls; poll += 1) {
    if (poll > 0) await sleep(pollIntervalMs);

    let taskResponse;
    try {
      taskResponse = await requestWithTimeout(
        new URL(`/api/agent-tasks/${created.id}`, apiBaseUrl),
        { headers: { authorization: headers.authorization } },
        fetchImplementation,
      );
    } catch (error) {
      return {
        name,
        taskId: created.id,
        error: errorMessage(error),
        passed: false,
      };
    }

    const task = await responseJson(taskResponse);
    if (taskResponse.status !== 200 || !task) {
      return {
        name,
        taskId: created.id,
        status: taskResponse.status,
        response: task,
        error: 'The API did not return the created Agent Task.',
        passed: false,
      };
    }

    lastStatus = task.status;
    if (lastStatus === 'succeeded') {
      return {
        name,
        taskId: created.id,
        correlationId,
        terminalStatus: lastStatus,
        polls: poll + 1,
        passed: true,
      };
    }
    if (lastStatus === 'failed') {
      return {
        name,
        taskId: created.id,
        correlationId,
        terminalStatus: lastStatus,
        error: 'The deployed worker transitioned the Agent Task to failed.',
        passed: false,
      };
    }
  }

  return {
    name,
    taskId: created.id,
    correlationId,
    terminalStatus: lastStatus,
    error: `The Agent Task did not succeed within ${timeoutMs}ms.`,
    passed: false,
  };
}

export async function runSmokeSuite(options = {}) {
  const environment = options.environment ?? process.env;
  const profile = smokeProfile(
    options.profile ?? environment.SMOKE_TEST_PROFILE ?? RELEASE_PROFILE,
  );
  const results = [];

  for (const check of releaseChecks) {
    results.push(await runCheck(check, { ...options, environment }));
  }

  if (profile === LIVE_AGENT_TASK_PROFILE) {
    for (const check of workerChecks) {
      results.push(await runCheck(check, { ...options, environment }));
    }
    results.push(await runAgentTaskWorkflow({ ...options, environment }));
  }

  return results;
}

export async function main(arguments_ = process.argv.slice(2)) {
  const results = await runSmokeSuite({
    profile: profileArgument(arguments_),
  });
  process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
  if (results.some((result) => !result.passed)) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  void main().catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  });
}
