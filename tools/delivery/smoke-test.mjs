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

class WorkflowDeadlineError extends Error {
  constructor(timeoutMs) {
    super(`The Agent Task did not succeed within ${timeoutMs}ms.`);
    this.name = 'WorkflowDeadlineError';
  }
}

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

async function promiseWithTimeout(
  promise,
  timeoutMs,
  timeoutError,
  onTimeout,
) {
  if (timeoutMs <= 0) throw timeoutError;

  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => {
          try {
            onTimeout?.();
          } finally {
            reject(timeoutError);
          }
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestWithTimeout(
  url,
  init,
  fetchImplementation,
  timeoutMs = REQUEST_TIMEOUT_MS,
  timeoutError = new Error(`Request timed out after ${timeoutMs}ms.`),
) {
  const controller = new AbortController();
  return promiseWithTimeout(
    fetchImplementation(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    }),
    timeoutMs,
    timeoutError,
    () => controller.abort(timeoutError),
  );
}

function remainingWorkflowTime(deadline, now, timeoutMs) {
  const remaining = deadline - now();
  if (remaining <= 0) throw new WorkflowDeadlineError(timeoutMs);
  return remaining;
}

async function requestWithinWorkflowDeadline(
  url,
  init,
  fetchImplementation,
  { deadline, now, timeoutMs },
) {
  const remaining = remainingWorkflowTime(deadline, now, timeoutMs);
  const requestTimeoutMs = Math.min(REQUEST_TIMEOUT_MS, remaining);
  const timeoutError =
    requestTimeoutMs === remaining
      ? new WorkflowDeadlineError(timeoutMs)
      : new Error(`Request timed out after ${requestTimeoutMs}ms.`);

  return requestWithTimeout(
    url,
    init,
    fetchImplementation,
    requestTimeoutMs,
    timeoutError,
  );
}

async function responseJsonWithinWorkflowDeadline(
  response,
  { deadline, now, timeoutMs },
) {
  const remaining = remainingWorkflowTime(deadline, now, timeoutMs);
  const timeoutError = new WorkflowDeadlineError(timeoutMs);

  try {
    return await promiseWithTimeout(
      response.json(),
      remaining,
      timeoutError,
      () => {
        void response.body?.cancel().catch(() => undefined);
      },
    );
  } catch (error) {
    if (error instanceof WorkflowDeadlineError) throw error;
    return undefined;
  }
}

async function sleepWithinWorkflowDeadline(
  sleep,
  delayMs,
  { deadline, now, timeoutMs },
) {
  const remaining = remainingWorkflowTime(deadline, now, timeoutMs);
  const sleepDurationMs = Math.min(delayMs, remaining);
  const timeoutError = new WorkflowDeadlineError(timeoutMs);

  await promiseWithTimeout(
    Promise.resolve(sleep(sleepDurationMs)),
    remaining,
    timeoutError,
  );

  if (sleepDurationMs < delayMs || now() >= deadline) throw timeoutError;
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
  now = Date.now,
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
  const deadlineContext = {
    deadline: now() + timeoutMs,
    now,
    timeoutMs,
  };
  let taskId;
  let lastStatus;

  try {
    const createdResponse = await requestWithinWorkflowDeadline(
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
      deadlineContext,
    );
    const created = await responseJsonWithinWorkflowDeadline(
      createdResponse,
      deadlineContext,
    );

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

    taskId = created.id;
    lastStatus = created.status;
    const maximumPolls = Math.max(
      1,
      Math.ceil(timeoutMs / Math.max(1, pollIntervalMs)),
    );

    for (let poll = 0; poll < maximumPolls; poll += 1) {
      if (poll > 0) {
        await sleepWithinWorkflowDeadline(
          sleep,
          pollIntervalMs,
          deadlineContext,
        );
      }

      const taskResponse = await requestWithinWorkflowDeadline(
        new URL(`/api/agent-tasks/${taskId}`, apiBaseUrl),
        { headers: { authorization: headers.authorization } },
        fetchImplementation,
        deadlineContext,
      );
      const task = await responseJsonWithinWorkflowDeadline(
        taskResponse,
        deadlineContext,
      );

      if (taskResponse.status !== 200 || !task) {
        return {
          name,
          taskId,
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
          taskId,
          correlationId,
          terminalStatus: lastStatus,
          polls: poll + 1,
          passed: true,
        };
      }
      if (lastStatus === 'failed') {
        return {
          name,
          taskId,
          correlationId,
          terminalStatus: lastStatus,
          error: 'The deployed worker transitioned the Agent Task to failed.',
          passed: false,
        };
      }
    }

    throw new WorkflowDeadlineError(timeoutMs);
  } catch (error) {
    return {
      name,
      ...(taskId ? { taskId } : {}),
      correlationId,
      ...(lastStatus ? { terminalStatus: lastStatus } : {}),
      error: errorMessage(error),
      passed: false,
    };
  }
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
