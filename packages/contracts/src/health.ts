import type { HealthResponse } from './generated/server';

export function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<HealthResponse>;
  return candidate.service === 'api' && candidate.status === 'ok';
}
