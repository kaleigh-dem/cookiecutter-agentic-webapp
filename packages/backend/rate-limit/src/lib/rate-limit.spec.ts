import { describe, expect, it } from 'vitest';

import { createRateLimitRules, InMemoryRateLimitStore } from './rate-limit';

const configuration = {
  anonymousLimit: 2,
  authenticatedLimit: 4,
  routeLimit: 1,
  tenantLimit: 10,
  windowMs: 1_000,
};

describe('rate-limit policies', () => {
  it('creates hashed anonymous and route keys without retaining the address', () => {
    const rules = createRateLimitRules(
      {
        clientIp: '203.0.113.10',
        method: 'GET',
        route: '/api/agent-tasks?nonce=1',
      },
      configuration,
    );

    expect(rules.map((rule) => rule.policy)).toEqual(['anonymous', 'route']);
    expect(rules.every((rule) => !rule.key.includes('203.0.113.10'))).toBe(
      true,
    );
  });

  it('adds authenticated and tenant policies with stable route keys', () => {
    const first = createRateLimitRules(
      {
        clientIp: '203.0.113.10',
        method: 'POST',
        route: '/api/agent-tasks?nonce=1',
        principal: { subject: 'actor-1', tenantId: 'tenant-1' },
      },
      configuration,
    );
    const second = createRateLimitRules(
      {
        clientIp: '198.51.100.4',
        method: 'POST',
        route: '/api/agent-tasks?nonce=2',
        principal: { subject: 'actor-1', tenantId: 'tenant-1' },
      },
      configuration,
    );

    expect(first.map((rule) => rule.policy)).toEqual([
      'authenticated',
      'route',
      'tenant',
    ]);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toContain('actor-1');
    expect(JSON.stringify(first)).not.toContain('tenant-1');
  });

  it('enforces and resets every configured policy', async () => {
    const store = new InMemoryRateLimitStore();
    const rules = createRateLimitRules(
      { clientIp: '203.0.113.10', method: 'GET', route: '/api/tasks' },
      configuration,
    );

    await expect(
      store.consume(rules, new Date(1_000)),
    ).resolves.toBeUndefined();
    await expect(store.consume(rules, new Date(1_001))).resolves.toMatchObject({
      policy: 'route',
      count: 2,
      limit: 1,
    });
    await expect(
      store.consume(rules, new Date(2_000)),
    ).resolves.toBeUndefined();
  });
});
