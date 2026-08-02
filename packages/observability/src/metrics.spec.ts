import { describe, expect, it } from 'vitest';

import { MetricsRegistry } from './index';

describe('MetricsRegistry', () => {
  it('tracks counters, duration aggregates, and absolute gauges', () => {
    const metrics = new MetricsRegistry();

    metrics.increment('worker_retries_total');
    metrics.increment('worker_retries_total', 2);
    metrics.observe('worker_message_processing_duration_ms', 25);
    metrics.observe('worker_message_processing_duration_ms', 75);
    metrics.setGauge('worker_queue_depth', 4);
    metrics.setGauge('worker_queue_depth', 2);
    metrics.setGauge('worker_oldest_message_age_ms', 1_500);

    expect(metrics.snapshot()).toEqual({
      counters: { worker_retries_total: 3 },
      durations: {
        worker_message_processing_duration_ms: {
          count: 2,
          sumMs: 100,
          maxMs: 75,
          averageMs: 50,
        },
      },
      gauges: {
        worker_queue_depth: 2,
        worker_oldest_message_age_ms: 1_500,
      },
    });
  });

  it('rejects non-finite gauge values', () => {
    const metrics = new MetricsRegistry();

    expect(() => metrics.setGauge('worker_queue_depth', Number.NaN)).toThrow(
      'must be set to a finite number',
    );
  });
});
