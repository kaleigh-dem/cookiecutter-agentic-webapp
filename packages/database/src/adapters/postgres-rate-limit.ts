import type {
  RateLimitExceeded,
  RateLimitRule,
  RateLimitStore,
} from '@steadystack/backend-rate-limit';
import type { Pool, PoolClient } from 'pg';

interface RateLimitRow {
  readonly request_count: number;
  readonly reset_at: Date;
}

const MAXIMUM_RULES = 4;
const CLEANUP_INTERVAL = 1_000;

async function consumeRule(
  client: PoolClient,
  rule: RateLimitRule,
  now: Date,
): Promise<RateLimitRow> {
  const resetAt = new Date(now.getTime() + rule.windowMs);
  const result = await client.query<RateLimitRow>(
    `insert into app.rate_limit_windows
       (bucket_key, request_count, reset_at, updated_at)
     values ($1, 1, $2, $3)
     on conflict (bucket_key) do update
     set request_count = case
           when app.rate_limit_windows.reset_at <= $3 then 1
           else app.rate_limit_windows.request_count + 1
         end,
         reset_at = case
           when app.rate_limit_windows.reset_at <= $3 then $2
           else app.rate_limit_windows.reset_at
         end,
         updated_at = $3
     returning request_count, reset_at`,
    [rule.key, resetAt, now],
  );
  const row = result.rows[0];
  if (!row) throw new Error('The rate-limit window update returned no row.');
  return row;
}

export class PostgresRateLimitStore implements RateLimitStore {
  private consumptionCount = 0;

  public constructor(private readonly pool: Pool) {}

  public async consume(
    rules: readonly RateLimitRule[],
    now = new Date(),
  ): Promise<RateLimitExceeded | undefined> {
    if (rules.length < 1 || rules.length > MAXIMUM_RULES) {
      throw new Error(
        `rules must contain between 1 and ${MAXIMUM_RULES} entries.`,
      );
    }
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      let exceeded: RateLimitExceeded | undefined;
      for (const rule of rules) {
        const row = await consumeRule(client, rule, now);
        if (!exceeded && row.request_count > rule.limit) {
          exceeded = {
            policy: rule.policy,
            count: row.request_count,
            limit: rule.limit,
            resetAt: row.reset_at,
          };
        }
      }
      await client.query('commit');
      this.consumptionCount += 1;
      if (this.consumptionCount % CLEANUP_INTERVAL === 0) {
        void this.cleanupExpiredWindows(now).catch(() => undefined);
      }
      return exceeded;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async cleanupExpiredWindows(now: Date): Promise<void> {
    await this.pool.query(
      `delete from app.rate_limit_windows
       where bucket_key in (
         select bucket_key
         from app.rate_limit_windows
         where reset_at < $1
         order by reset_at
         limit 1000
       )`,
      [new Date(now.getTime() - 60_000)],
    );
  }
}
