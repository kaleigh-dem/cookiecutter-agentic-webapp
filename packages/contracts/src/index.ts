export interface HealthResponse {
  readonly service: 'api';
  readonly status: 'ok';
}

export function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<HealthResponse>;
  return candidate.service === 'api' && candidate.status === 'ok';
}
