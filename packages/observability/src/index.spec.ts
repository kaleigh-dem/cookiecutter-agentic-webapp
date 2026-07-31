import { describe, expect, it } from 'vitest';

import {
  MetricsRegistry,
  checkDependencies,
  createCorrelationContext,
  createStructuredLogger,
  getCorrelationContext,
  runWithCorrelationContext,
} from './index';

describe('observability primitives', () => {
  it('redacts sensitive values and attaches correlation context', () => {
    const records: unknown[] = [];
    const logger = createStructuredLogger('test', (record) =>
      records.push(record),
    );
    const context = createCorrelationContext({
      requestId: 'request-1',
      traceId: 'trace-1',
    });

    runWithCorrelationContext(context, () => {
      expect(getCorrelationContext()).toEqual(context);
      logger.info('agent_task.created', {
        prompt: 'private prompt',
        nested: { authorization: 'Bearer secret', safe: 'value' },
      });
    });

    expect(records).toEqual([
      expect.objectContaining({
        event: 'agent_task.created',
        context,
        attributes: {
          prompt: '[REDACTED]',
          nested: { authorization: '[REDACTED]', safe: 'value' },
        },
      }),
    ]);
  });

  it('redacts sensitive values embedded in error messages', () => {
    const records: unknown[] = [];
    const logger = createStructuredLogger('test', (record) =>
      records.push(record),
    );

    logger.error(
      'agent_task.failed',
      new Error('request failed token=super-secret cookie=session-value'),
    );

    expect(records).toEqual([
      expect.objectContaining({
        error: {
          name: 'Error',
          message:
            'request failed token=[REDACTED] cookie=[REDACTED]',
        },
      }),
    ]);
  });

  it('records bounded aggregate counters and durations', () => {
    const metrics = new MetricsRegistry();
    metrics.increment('http_requests_total');
    metrics.observe('http_request_duration_ms', 10);
    metrics.observe('http_request_duration_ms', 30);

    expect(metrics.snapshot()).toEqual({
      counters: { http_requests_total: 1 },
      durations: {
        http_request_duration_ms: {
          count: 2,
          sumMs: 40,
          maxMs: 30,
          averageMs: 20,
        },
      },
    });
  });

  it('keeps duration storage bounded under sustained traffic', () => {
    const metrics = new MetricsRegistry();

    for (let index = 0; index < 100_000; index += 1) {
      metrics.observe('http_request_duration_ms', index % 100);
    }

    expect(metrics.snapshot()).toEqual({
      counters: {},
      durations: {
        http_request_duration_ms: {
          count: 100_000,
          sumMs: 4_950_000,
          maxMs: 99,
          averageMs: 49.5,
        },
      },
    });
  });

  it('reports degraded dependencies without throwing', async () => {
    await expect(
      checkDependencies([
        { name: 'database', check: async () => undefined },
        {
          name: 'queue',
          check: async () => {
            throw new Error('unavailable');
          },
        },
      ]),
    ).resolves.toEqual({
      status: 'degraded',
      checks: {
        database: { status: 'ok' },
        queue: { status: 'failed', message: 'unavailable' },
      },
    });
  });
});
