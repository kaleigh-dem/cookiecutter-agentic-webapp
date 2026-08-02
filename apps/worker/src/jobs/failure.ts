export type JobFailureDisposition = 'retryable' | 'permanent';

export interface ClassifiedJobFailure {
  readonly disposition: JobFailureDisposition;
  readonly errorCode: string;
  readonly errorMessage: string;
}

const ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]{0,99}$/u;
const RETRYABLE_SYSTEM_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'ENETDOWN',
  'ENETUNREACH',
  'ETIMEDOUT',
  '57P01',
  '53300',
]);

function requireFailureCode(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!ERROR_CODE_PATTERN.test(normalized)) {
    throw new Error(
      'Job failure codes must use lower-case letters, numbers, and underscores.',
    );
  }
  return normalized;
}

abstract class ClassifiedJobError extends Error {
  public readonly code: string;

  protected constructor(name: string, code: string, message: string) {
    super(message);
    this.name = name;
    this.code = requireFailureCode(code);
  }
}

export class RetryableJobError extends ClassifiedJobError {
  public constructor(code: string, message = 'A retryable dependency failed.') {
    super('RetryableJobError', code, message);
  }
}

export class PermanentJobError extends ClassifiedJobError {
  public constructor(code: string, message = 'The job cannot be completed.') {
    super('PermanentJobError', code, message);
  }
}

function systemErrorCode(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code.toUpperCase();
  }
  return undefined;
}

export function classifyJobFailure(error: unknown): ClassifiedJobFailure {
  if (error instanceof PermanentJobError) {
    return {
      disposition: 'permanent',
      errorCode: error.code,
      errorMessage: 'Agent Task execution failed permanently.',
    };
  }
  if (error instanceof RetryableJobError) {
    return {
      disposition: 'retryable',
      errorCode: error.code,
      errorMessage: 'Agent Task execution failed temporarily.',
    };
  }

  const code = systemErrorCode(error);
  if (code && RETRYABLE_SYSTEM_CODES.has(code)) {
    return {
      disposition: 'retryable',
      errorCode: 'dependency_unavailable',
      errorMessage: 'Agent Task execution failed temporarily.',
    };
  }

  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return {
        disposition: 'retryable',
        errorCode: 'dependency_timeout',
        errorMessage: 'Agent Task execution failed temporarily.',
      };
    }
    if (
      error.name === 'RangeError' ||
      error.name === 'SyntaxError' ||
      error.name === 'TypeError'
    ) {
      return {
        disposition: 'permanent',
        errorCode: 'execution_contract_error',
        errorMessage: 'Agent Task execution failed permanently.',
      };
    }
  }

  return {
    disposition: 'retryable',
    errorCode: 'execution_failed',
    errorMessage: 'Agent Task execution failed temporarily.',
  };
}
