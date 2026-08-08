export const DEFAULT_MODEL_TIMEOUT_MS = 30_000;

export interface ModelRetryPolicy {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
}

export const DEFAULT_MODEL_RETRY_POLICY: ModelRetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 2_000,
};

export type ModelRole = 'system' | 'user' | 'assistant';

export interface ModelMessage {
  readonly role: ModelRole;
  readonly content: string;
}

export interface ModelUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly cachedInputTokens?: number;
}

export type ModelFinishReason =
  | 'stop'
  | 'length'
  | 'content_filter'
  | 'unknown';

export interface ModelRequestOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly retry?: Partial<ModelRetryPolicy>;
}

export interface ModelGenerationRequest extends ModelRequestOptions {
  readonly model: string;
  readonly messages: readonly ModelMessage[];
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
}

export interface ModelGenerationResult {
  readonly provider: string;
  readonly model: string;
  readonly text: string;
  readonly finishReason: ModelFinishReason;
  readonly usage: ModelUsage;
}

export type ModelJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ModelJsonValue[]
  | { readonly [key: string]: ModelJsonValue };

export type ModelJsonSchema = Readonly<Record<string, ModelJsonValue>>;

export interface ModelStructuredOutputRequest<T>
  extends ModelGenerationRequest {
  readonly schemaName: string;
  readonly schema: ModelJsonSchema;
  readonly parse: (value: unknown) => T;
}

export interface ModelStructuredOutputResult<T> {
  readonly provider: string;
  readonly model: string;
  readonly value: T;
  readonly rawText: string;
  readonly finishReason: ModelFinishReason;
  readonly usage: ModelUsage;
}

export interface ModelEmbeddingRequest extends ModelRequestOptions {
  readonly model: string;
  readonly inputs: readonly string[];
  readonly dimensions?: number;
}

export interface ModelEmbeddingResult {
  readonly provider: string;
  readonly model: string;
  readonly embeddings: readonly (readonly number[])[];
  readonly usage: ModelUsage;
}

interface ModelStreamEventBase {
  readonly provider: string;
  readonly model: string;
}

export interface ModelTextDeltaEvent extends ModelStreamEventBase {
  readonly type: 'text_delta';
  readonly text: string;
}

export interface ModelUsageEvent extends ModelStreamEventBase {
  readonly type: 'usage';
  readonly usage: ModelUsage;
}

export interface ModelCompletedEvent extends ModelStreamEventBase {
  readonly type: 'completed';
  readonly finishReason: ModelFinishReason;
  readonly usage: ModelUsage;
}

export type ModelStreamEvent =
  | ModelTextDeltaEvent
  | ModelUsageEvent
  | ModelCompletedEvent;

export interface ModelClient {
  generate(request: ModelGenerationRequest): Promise<ModelGenerationResult>;
  generateStructured<T>(
    request: ModelStructuredOutputRequest<T>,
  ): Promise<ModelStructuredOutputResult<T>>;
  embed(request: ModelEmbeddingRequest): Promise<ModelEmbeddingResult>;
  stream(request: ModelGenerationRequest): AsyncIterable<ModelStreamEvent>;
}

export type ModelErrorCode =
  | 'aborted'
  | 'timeout'
  | 'rate_limited'
  | 'authentication'
  | 'permission'
  | 'invalid_request'
  | 'invalid_response'
  | 'unavailable'
  | 'provider_error';

export interface ModelErrorOptions {
  readonly code: ModelErrorCode;
  readonly retryable: boolean;
  readonly provider?: string;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly cause?: unknown;
}

export class ModelError extends Error {
  public readonly code: ModelErrorCode;
  public readonly retryable: boolean;
  public readonly provider?: string;
  public readonly status?: number;
  public readonly retryAfterMs?: number;

  public constructor(message: string, options: ModelErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'ModelError';
    this.code = options.code;
    this.retryable = options.retryable;
    if (options.provider !== undefined) this.provider = options.provider;
    if (options.status !== undefined) this.status = options.status;
    if (options.retryAfterMs !== undefined) {
      this.retryAfterMs = options.retryAfterMs;
    }
  }
}

export interface ModelOperationContext {
  readonly attempt: number;
  readonly signal: AbortSignal;
}

export type ModelSleep = (
  milliseconds: number,
  signal?: AbortSignal,
) => Promise<void>;

export interface ModelExecutionHooks {
  readonly sleep?: ModelSleep;
}

interface NormalizedRequestPolicy {
  readonly timeoutMs: number;
  readonly retry: ModelRetryPolicy;
}

interface AttemptAbortContext {
  readonly controller: AbortController;
  readonly timedOut: () => boolean;
  readonly cleanup: () => void;
}

function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ModelError(`${label} must be a positive integer.`, {
      code: 'invalid_request',
      retryable: false,
    });
  }
  return value;
}

export function normalizeModelRequestPolicy(
  options: ModelRequestOptions,
): NormalizedRequestPolicy {
  const timeoutMs = requirePositiveInteger(
    options.timeoutMs ?? DEFAULT_MODEL_TIMEOUT_MS,
    'timeoutMs',
  );
  const maxAttempts = requirePositiveInteger(
    options.retry?.maxAttempts ?? DEFAULT_MODEL_RETRY_POLICY.maxAttempts,
    'retry.maxAttempts',
  );
  const baseDelayMs = requirePositiveInteger(
    options.retry?.baseDelayMs ?? DEFAULT_MODEL_RETRY_POLICY.baseDelayMs,
    'retry.baseDelayMs',
  );
  const maxDelayMs = requirePositiveInteger(
    options.retry?.maxDelayMs ?? DEFAULT_MODEL_RETRY_POLICY.maxDelayMs,
    'retry.maxDelayMs',
  );
  if (maxDelayMs < baseDelayMs) {
    throw new ModelError(
      'retry.maxDelayMs must be greater than or equal to retry.baseDelayMs.',
      { code: 'invalid_request', retryable: false },
    );
  }
  return {
    timeoutMs,
    retry: { maxAttempts, baseDelayMs, maxDelayMs },
  };
}

function abortedError(cause?: unknown): ModelError {
  return new ModelError('Model request was aborted.', {
    code: 'aborted',
    retryable: false,
    cause,
  });
}

function createAttemptAbortContext(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): AttemptAbortContext {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new Error('Model request timed out.'));
  }, timeoutMs);

  return {
    controller,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
  };
}

function normalizeOperationError(
  error: unknown,
  parentSignal: AbortSignal | undefined,
  timedOut: boolean,
): ModelError {
  if (parentSignal?.aborted) return abortedError(parentSignal.reason);
  if (timedOut) {
    return new ModelError('Model request timed out.', {
      code: 'timeout',
      retryable: true,
      cause: error,
    });
  }
  if (error instanceof ModelError) return error;
  if (error instanceof Error && error.name === 'AbortError') {
    return abortedError(error);
  }
  return new ModelError('Model provider operation failed.', {
    code: 'provider_error',
    retryable: false,
    cause: error,
  });
}

async function defaultSleep(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) throw abortedError(signal.reason);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(abortedError(signal?.reason));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

function retryDelay(
  error: ModelError,
  attempt: number,
  retry: ModelRetryPolicy,
): number {
  if (error.retryAfterMs !== undefined) {
    return Math.min(error.retryAfterMs, retry.maxDelayMs);
  }
  return Math.min(
    retry.baseDelayMs * 2 ** Math.max(0, attempt - 1),
    retry.maxDelayMs,
  );
}

export async function executeModelOperation<T>(
  options: ModelRequestOptions,
  operation: (context: ModelOperationContext) => Promise<T>,
  hooks: ModelExecutionHooks = {},
): Promise<T> {
  const policy = normalizeModelRequestPolicy(options);
  const sleep = hooks.sleep ?? defaultSleep;

  if (options.signal?.aborted) throw abortedError(options.signal.reason);

  for (let attempt = 1; attempt <= policy.retry.maxAttempts; attempt += 1) {
    const abortContext = createAttemptAbortContext(
      options.signal,
      policy.timeoutMs,
    );
    try {
      return await operation({ attempt, signal: abortContext.controller.signal });
    } catch (error) {
      const normalized = normalizeOperationError(
        error,
        options.signal,
        abortContext.timedOut(),
      );
      if (!normalized.retryable || attempt >= policy.retry.maxAttempts) {
        throw normalized;
      }
      await sleep(retryDelay(normalized, attempt, policy.retry), options.signal);
    } finally {
      abortContext.cleanup();
    }
  }

  throw new ModelError('Model retry policy exhausted unexpectedly.', {
    code: 'provider_error',
    retryable: false,
  });
}
