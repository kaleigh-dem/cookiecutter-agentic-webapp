export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitterRatio: number;
}

export const defaultRetryPolicy: RetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 60_000,
  jitterRatio: 0.5,
};

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

export function validateRetryPolicy(policy: RetryPolicy): RetryPolicy {
  const maxAttempts = requirePositiveInteger(policy.maxAttempts, 'maxAttempts');
  const baseDelayMs = requirePositiveInteger(policy.baseDelayMs, 'baseDelayMs');
  const maxDelayMs = requirePositiveInteger(policy.maxDelayMs, 'maxDelayMs');
  if (maxDelayMs < baseDelayMs) {
    throw new Error('maxDelayMs must be greater than or equal to baseDelayMs.');
  }
  if (
    !Number.isFinite(policy.jitterRatio) ||
    policy.jitterRatio < 0 ||
    policy.jitterRatio > 1
  ) {
    throw new Error('jitterRatio must be between 0 and 1.');
  }
  return { maxAttempts, baseDelayMs, maxDelayMs, jitterRatio: policy.jitterRatio };
}

export function calculateRetryDelayMs(
  attemptCount: number,
  policy: RetryPolicy,
  random: () => number = Math.random,
): number {
  requirePositiveInteger(attemptCount, 'attemptCount');
  const validated = validateRetryPolicy(policy);
  const exponent = Math.min(attemptCount - 1, 30);
  const exponentialDelay = Math.min(
    validated.maxDelayMs,
    validated.baseDelayMs * 2 ** exponent,
  );
  const randomValue = random();
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue > 1) {
    throw new Error('random must return a number between 0 and 1.');
  }
  const minimumDelay = exponentialDelay * (1 - validated.jitterRatio);
  return Math.max(
    1,
    Math.min(
      validated.maxDelayMs,
      Math.round(
        minimumDelay + (exponentialDelay - minimumDelay) * randomValue,
      ),
    ),
  );
}
