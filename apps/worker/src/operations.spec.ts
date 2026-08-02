import { describe, expect, it } from 'vitest';

import { startWorkerOperationsServer } from './operations';

describe('worker operations server', () => {
  it('separates liveness, dependency-aware readiness, and metrics', async () => {
    let acceptingWork = true;
    let databaseHealthy = true;
    const server = await startWorkerOperationsServer({
      host: '127.0.0.1',
      port: 0,
      isAcceptingWork: () => acceptingWork,
      dependencies: [
        {
          name: 'database',
          check: async () => {
            if (!databaseHealthy) throw new Error('Database unavailable.');
          },
        },
      ],
      metrics: {
        snapshot: () => ({ gauges: { worker_queue_depth: 3 } }),
      },
    });

    try {
      const baseUrl = `http://127.0.0.1:${server.port}`;

      const live = await fetch(`${baseUrl}/health/live`);
      expect(live.status).toBe(200);
      await expect(live.json()).resolves.toEqual({
        status: 'ok',
        service: 'worker',
      });

      const ready = await fetch(`${baseUrl}/health/ready`);
      expect(ready.status).toBe(200);
      await expect(ready.json()).resolves.toEqual({
        status: 'ok',
        checks: {
          lifecycle: { status: 'ok' },
          database: { status: 'ok' },
        },
      });

      const metrics = await fetch(`${baseUrl}/metrics`);
      expect(metrics.status).toBe(200);
      await expect(metrics.json()).resolves.toEqual({
        gauges: { worker_queue_depth: 3 },
      });

      databaseHealthy = false;
      const unavailable = await fetch(`${baseUrl}/health/ready`);
      expect(unavailable.status).toBe(503);
      await expect(unavailable.json()).resolves.toMatchObject({
        status: 'degraded',
        checks: {
          database: {
            status: 'failed',
            message: 'Database unavailable.',
          },
        },
      });

      databaseHealthy = true;
      acceptingWork = false;
      const draining = await fetch(`${baseUrl}/health/ready`);
      expect(draining.status).toBe(503);
      await expect(draining.json()).resolves.toMatchObject({
        status: 'degraded',
        checks: {
          lifecycle: {
            status: 'failed',
            message: 'The worker is draining and not accepting work.',
          },
        },
      });

      const liveWhileDraining = await fetch(`${baseUrl}/health/live`);
      expect(liveWhileDraining.status).toBe(200);
    } finally {
      await server.close();
    }
  });
});
