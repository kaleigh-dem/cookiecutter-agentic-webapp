import { createHash } from 'node:crypto';

export type RateLimitPolicy =
  | 'anonymous'
  | 'authenticated'
  | 'route'
  | 'tenant';

export interface RateLimitRule {
  readonly key: string;
  readonly policy: RateLimitPolicy;
  readonly limit: number;
  readonly windowMs: number;
}

export interface RateLimitExceeded {
  readonly policy: RateLimitPolicy;
  readonly count: number;
  readonly limit: number;
  readonly resetAt: Date;
}

export interface RateLimitStore {
  consume(
    rules: readonly RateLimitRule[],
    now?: Date,
  ): Promise<RateLimitExceeded | undefined>;
}

export interface RateLimitPrincipal {
  readonly subject: string;
  readonly tenantId?: string;
}

export interface RateLimitRequestIdentity {
  readonly clientIp: string;
  readonly method: string;
  readonly route: string;
  readonly principal?: RateLimitPrincipal;
}

export interface RateLimitPolicyConfiguration {
  readonly anonymousLimit: number;
  readonly authenticatedLimit: number;
  readonly routeLimit: number;
  readonly tenantLimit: number;
  readonly windowMs: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: Date;
}

const MAXIMUM_RULES = 4;

function digest(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function normalizeRoute(method: string, route: string): string {
  const normalizedMethod = method.trim().toUpperCase() || 'UNKNOWN';
  const normalizedRoute = (route.split('?')[0] || '/')
    .replace(/\/+/g, '/')
    .slice(0, 500);
  return `${normalizedMethod}:${normalizedRoute}`;
}

export function createRateLimitRules(
  request: RateLimitRequestIdentity,
  configuration: RateLimitPolicyConfiguration,
): readonly RateLimitRule[] {
  const windowMs = requirePositiveInteger(configuration.windowMs, 'windowMs');
  const subject = request.principal?.subject.trim();
  const identity = subject
    ? `subject:${digest(subject)}`
    : `ip:${digest(request.clientIp.trim() || 'unknown')}`;
  const identityPolicy: RateLimitPolicy = subject
    ? 'authenticated'
    : 'anonymous';
  const identityLimit = subject
    ? configuration.authenticatedLimit
    : configuration.anonymousLimit;
  const route = normalizeRoute(request.method, request.route);
  const rules: RateLimitRule[] = [
    {
      key: `${identityPolicy}:${identity}`,
      policy: identityPolicy,
      limit: requirePositiveInteger(identityLimit, `${identityPolicy}Limit`),
      windowMs,
    },
    {
      key: `route:${identity}:${digest(route)}`,
      policy: 'route',
      limit: requirePositiveInteger(configuration.routeLimit, 'routeLimit'),
      windowMs,
    },
  ];

  const tenantId = request.principal?.tenantId?.trim();
  if (tenantId) {
    rules.push({
      key: `tenant:${digest(tenantId)}`,
      policy: 'tenant',
      limit: requirePositiveInteger(configuration.tenantLimit, 'tenantLimit'),
      windowMs,
    });
  }
  return rules;
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, RateLimitBucket>();

  public constructor(private readonly maximumBuckets = 10_000) {
    requirePositiveInteger(maximumBuckets, 'maximumBuckets');
  }

  public get bucketCount(): number {
    return this.buckets.size;
  }

  public async consume(
    rules: readonly RateLimitRule[],
    now = new Date(),
  ): Promise<RateLimitExceeded | undefined> {
    if (rules.length < 1 || rules.length > MAXIMUM_RULES) {
      throw new Error(
        `rules must contain between 1 and ${MAXIMUM_RULES} entries.`,
      );
    }
    let exceeded: RateLimitExceeded | undefined;
    for (const rule of rules) {
      const current = this.buckets.get(rule.key);
      const bucket =
        current && current.resetAt > now
          ? { count: current.count + 1, resetAt: current.resetAt }
          : { count: 1, resetAt: new Date(now.getTime() + rule.windowMs) };
      if (!current) this.reserveBucket(now);
      this.buckets.set(rule.key, bucket);
      if (!exceeded && bucket.count > rule.limit) {
        exceeded = { ...bucket, policy: rule.policy, limit: rule.limit };
      }
    }
    return exceeded;
  }

  private reserveBucket(now: Date): void {
    if (this.buckets.size < this.maximumBuckets) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    if (this.buckets.size < this.maximumBuckets) return;
    const oldestKey = this.buckets.keys().next().value;
    if (typeof oldestKey === 'string') this.buckets.delete(oldestKey);
  }
}
