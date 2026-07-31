import { z } from 'zod';

const schema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REDIS_URL: z.string().url(),
});

export type ServerEnvironment = z.infer<typeof schema>;

export function parseServerEnvironment(
  values: NodeJS.ProcessEnv = process.env,
): ServerEnvironment {
  return schema.parse(values);
}
