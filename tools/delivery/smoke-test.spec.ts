import { describe, expect, it, vi } from 'vitest';

import {
  runAgentTaskWorkflow,
  runCheck,
  runSmokeSuite,
} from './smoke-test.mjs';

function jsonResponse(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('preview smoke test', () => {
  it('keeps generic release smoke independent of worker and development credentials', async () => {
    const fetchImplementation = vi.fn(async (url: URL | RequestInfo) => {
      const path = new URL(url.toString()).pathname;
      return new Response('{}', {
        status: path === '/api/metrics' ? 401 : 200,
      });
    });

    await expect(
      runSmokeSuite({
        environment: {
          API_BASE_URL: 'https://api.example.com',
          WEB_BASE_URL: 'https://app.example.com',
        },
        fetchImplementation,
      }),
    ).resolves.toEqual([
      expect.objectContaining({ name: 'web-home', passed: true }),
      expect.objectContaining({ name: 'api-liveness', passed: true }),
      expect.objectContaining({ name: 'api-readiness', passed: true }),
      expect.objectContaining({
        name: 'metrics-require-authentication',
        passed: true,
      }),
    ]);

    expect(fetchImplementation).toHaveBeenCalledTimes(4);
  });

  it('requires worker configuration only for the live Agent Task profile', async () => {
    await expect(
      runSmokeSuite({
        profile: 'live-agent-task',
        environment: {
          API_BASE_URL: 'https://api.example.com',
          WEB_BASE_URL: 'https://app.example.com',
        },
        fetchImplementation: vi.fn(async () =>
          Promise.resolve(new Response('{}', { status: 200 })),
        ),
      }),
    ).rejects.toThrow('WORKER_BASE_URL is required.');
  });

  it('checks the worker operations endpoint selected by the environment', async () => {
    const fetchImplementation = vi.fn(async () =>
      Promise.resolve(new Response('{}', { status: 200 })),
    );

    await expect(
      runCheck(
        {
          name: 'worker-readiness',
          environment: 'WORKER_BASE_URL',
          path: '/health/ready',
          expectedStatus: 200,
        },
        {
          environment: { WORKER_BASE_URL: 'http://worker.test:4001' },
          fetchImplementation,
        },
      ),
    ).resolves.toEqual({
      name: 'worker-readiness',
      expectedStatus: 200,
      status: 200,
      passed: true,
    });

    expect(fetchImplementation).toHaveBeenCalledWith(
      new URL('http://worker.test:4001/health/ready'),
      expect.objectContaining({ cache: 'no-store', redirect: 'manual' }),
    );
  });

  it('creates an Agent Task and observes deployed worker success', async () => {
    const taskId = '11111111-1111-4111-8111-111111111111';
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            id: taskId,
            title: 'Preview workflow fixed-id',
            prompt: 'Prove the deployed transactional outbox worker path.',
            status: 'queued',
            correlationId: 'preview-fixed-id',
            createdAt: '2026-08-02T20:00:00.000Z',
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: taskId, status: 'running' }, 200),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: taskId, status: 'succeeded' }, 200),
      );
    const sleep = vi.fn(async () => undefined);

    await expect(
      runAgentTaskWorkflow({
        environment: {
          API_BASE_URL: 'http://api.test:4000',
          AUTH_DEVELOPMENT_TOKEN: 'preview-token',
        },
        fetchImplementation,
        createId: () => 'fixed-id',
        sleep,
        pollIntervalMs: 1,
        timeoutMs: 2,
      }),
    ).resolves.toEqual({
      name: 'agent-task-terminal-workflow',
      taskId,
      correlationId: 'preview-fixed-id',
      terminalStatus: 'succeeded',
      polls: 2,
      passed: true,
    });

    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      new URL('http://api.test:4000/api/agent-tasks'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer preview-token',
          'x-correlation-id': 'preview-fixed-id',
        }),
      }),
    );
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('fails the smoke gate when the worker reaches a failed terminal state', async () => {
    const taskId = '22222222-2222-4222-8222-222222222222';
    const fetchImplementation = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ id: taskId, status: 'queued' }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({ id: taskId, status: 'failed' }, 200),
      );

    await expect(
      runAgentTaskWorkflow({
        environment: {
          API_BASE_URL: 'http://api.test:4000',
          AUTH_DEVELOPMENT_TOKEN: 'preview-token',
        },
        fetchImplementation,
        createId: () => 'fixed-id',
        sleep: async () => undefined,
        pollIntervalMs: 1,
        timeoutMs: 1,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        name: 'agent-task-terminal-workflow',
        taskId,
        terminalStatus: 'failed',
        passed: false,
      }),
    );
  });
});
