import {
  InMemoryRateLimitStore,
  type RateLimitPolicyConfiguration,
  type RateLimitStore,
} from '@steadystack/backend-rate-limit';
import {
  createDatabase,
  PostgresRateLimitStore,
  type DatabaseConnection,
} from '@steadystack/database';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';

export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');

export interface RateLimitEnvironment {
  readonly NODE_ENV?: string;
  readonly DATABASE_URL?: string;
  readonly API_RATE_LIMIT_STORE?: string;
  readonly API_RATE_LIMIT_ANONYMOUS_MAX?: string;
  readonly API_RATE_LIMIT_AUTHENTICATED_MAX?: string;
  readonly API_RATE_LIMIT_ROUTE_MAX?: string;
  readonly API_RATE_LIMIT_TENANT_MAX?: string;
  readonly API_RATE_LIMIT_WINDOW_MS?: string;
  readonly API_RATE_LIMIT_MAX_BUCKETS?: string;
  readonly API_TRUSTED_PROXY_HOPS?: string;
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function createRateLimitConfiguration(
  environment: RateLimitEnvironment,
): RateLimitPolicyConfiguration {
  return {
    anonymousLimit: positiveInteger(
      environment.API_RATE_LIMIT_ANONYMOUS_MAX,
      60,
      'API_RATE_LIMIT_ANONYMOUS_MAX',
    ),
    authenticatedLimit: positiveInteger(
      environment.API_RATE_LIMIT_AUTHENTICATED_MAX,
      120,
      'API_RATE_LIMIT_AUTHENTICATED_MAX',
    ),
    routeLimit: positiveInteger(
      environment.API_RATE_LIMIT_ROUTE_MAX,
      60,
      'API_RATE_LIMIT_ROUTE_MAX',
    ),
    tenantLimit: positiveInteger(
      environment.API_RATE_LIMIT_TENANT_MAX,
      1_000,
      'API_RATE_LIMIT_TENANT_MAX',
    ),
    windowMs: positiveInteger(
      environment.API_RATE_LIMIT_WINDOW_MS,
      60_000,
      'API_RATE_LIMIT_WINDOW_MS',
    ),
  };
}

export function parseTrustedProxyHops(
  environment: RateLimitEnvironment,
): number {
  const raw = environment.API_TRUSTED_PROXY_HOPS?.trim() || '0';
  const hops = Number(raw);
  if (!Number.isSafeInteger(hops) || hops < 0 || hops > 10) {
    throw new Error('API_TRUSTED_PROXY_HOPS must be an integer from 0 to 10.');
  }
  return hops;
}

export function resolveClientIp(request: {
  readonly ip?: string | undefined;
  readonly socket: { readonly remoteAddress?: string | undefined };
}): string {
  return (
    request.ip?.trim() || request.socket.remoteAddress?.trim() || 'unknown'
  );
}

export function resolveRateLimitStoreMode(
  environment: RateLimitEnvironment,
): 'memory' | 'postgres' {
  const configured = environment.API_RATE_LIMIT_STORE?.trim();
  const mode =
    configured ||
    (environment.NODE_ENV === 'production' ? 'postgres' : 'memory');
  if (mode !== 'memory' && mode !== 'postgres') {
    throw new Error('API_RATE_LIMIT_STORE must be memory or postgres.');
  }
  if (mode === 'memory' && environment.NODE_ENV === 'production') {
    throw new Error('The in-memory rate-limit store cannot run in production.');
  }
  return mode;
}

@Injectable()
export class EnvironmentRateLimitProvider implements OnModuleDestroy {
  public readonly configuration = createRateLimitConfiguration(process.env);
  public readonly store: RateLimitStore;
  private readonly connection?: DatabaseConnection;

  public constructor() {
    const mode = resolveRateLimitStoreMode(process.env);
    if (mode === 'memory') {
      this.store = new InMemoryRateLimitStore(
        positiveInteger(
          process.env.API_RATE_LIMIT_MAX_BUCKETS,
          10_000,
          'API_RATE_LIMIT_MAX_BUCKETS',
        ),
      );
      return;
    }
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) {
      throw new Error('DATABASE_URL is required for PostgreSQL rate limiting.');
    }
    this.connection = createDatabase({
      connectionString,
      applicationName: 'steadystack-api-rate-limit',
      maxConnections: 5,
    });
    this.store = new PostgresRateLimitStore(this.connection.pool);
  }

  public async onModuleDestroy(): Promise<void> {
    await this.connection?.close();
  }
}
