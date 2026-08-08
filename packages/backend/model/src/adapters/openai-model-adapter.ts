import {
  ModelError,
  executeModelOperation,
  normalizeModelRequestPolicy,
  type ModelClient,
  type ModelCompletedEvent,
  type ModelEmbeddingRequest,
  type ModelEmbeddingResult,
  type ModelErrorCode,
  type ModelExecutionHooks,
  type ModelFinishReason,
  type ModelGenerationRequest,
  type ModelGenerationResult,
  type ModelRequestOptions,
  type ModelSleep,
  type ModelStreamEvent,
  type ModelStructuredOutputRequest,
  type ModelStructuredOutputResult,
  type ModelUsage,
} from '../lib/model';

export interface OpenAIModelAdapterOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly organization?: string;
  readonly project?: string;
  readonly fetch?: typeof fetch;
  readonly sleep?: ModelSleep;
}

interface StreamAbortContext {
  readonly controller: AbortController;
  readonly timedOut: () => boolean;
  readonly cleanup: () => void;
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function invalidResponse(message: string, cause?: unknown): ModelError {
  return new ModelError(message, {
    code: 'invalid_response',
    retryable: false,
    provider: 'openai',
    cause,
  });
}

function readTokenCount(
  record: JsonRecord | undefined,
  key: string,
  fallback?: number,
): number {
  const value = record?.[key];
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidResponse(
      `OpenAI usage.${key} must be a non-negative integer.`,
    );
  }
  return value;
}

function readUsage(value: unknown, outputFallback?: number): ModelUsage {
  const usage = asRecord(value);
  if (!usage) throw invalidResponse('OpenAI response did not include usage.');
  const inputTokens = readTokenCount(usage, 'prompt_tokens');
  const outputTokens = readTokenCount(
    usage,
    'completion_tokens',
    outputFallback,
  );
  const totalTokens = readTokenCount(
    usage,
    'total_tokens',
    inputTokens + outputTokens,
  );
  const details = asRecord(usage.prompt_tokens_details);
  const cached = details?.cached_tokens;
  if (cached === undefined) return { inputTokens, outputTokens, totalTokens };
  if (
    typeof cached !== 'number' ||
    !Number.isSafeInteger(cached) ||
    cached < 0
  ) {
    throw invalidResponse(
      'OpenAI usage.prompt_tokens_details.cached_tokens must be a non-negative integer.',
    );
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cachedInputTokens: cached,
  };
}

function normalizeFinishReason(value: unknown): ModelFinishReason {
  if (value === 'stop') return 'stop';
  if (value === 'length') return 'length';
  if (value === 'content_filter') return 'content_filter';
  return 'unknown';
}

function readChatChoice(value: unknown): JsonRecord {
  const response = asRecord(value);
  const choices = response?.choices;
  if (!Array.isArray(choices) || choices.length < 1) {
    throw invalidResponse('OpenAI response did not include a chat choice.');
  }
  const choice = asRecord(choices[0]);
  if (!choice) throw invalidResponse('OpenAI chat choice was invalid.');
  return choice;
}

function readChatText(value: unknown): {
  readonly text: string;
  readonly finishReason: ModelFinishReason;
} {
  const choice = readChatChoice(value);
  const message = asRecord(choice.message);
  if (typeof message?.content !== 'string') {
    throw invalidResponse('OpenAI chat response did not include text content.');
  }
  return {
    text: message.content,
    finishReason: normalizeFinishReason(choice.finish_reason),
  };
}

function readResponseModel(value: unknown, fallback: string): string {
  const model = asRecord(value)?.model;
  return typeof model === 'string' && model.trim() ? model : fallback;
}

function retryAfterMilliseconds(response: Response): number | undefined {
  const raw = response.headers.get('retry-after')?.trim();
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.max(0, timestamp - Date.now());
}

function errorForResponse(response: Response): ModelError {
  const status = response.status;
  const retryAfterMs = retryAfterMilliseconds(response);
  let code: ModelErrorCode = 'provider_error';
  let retryable = false;
  if (status === 400 || status === 404 || status === 422) {
    code = 'invalid_request';
  } else if (status === 401) {
    code = 'authentication';
  } else if (status === 403) {
    code = 'permission';
  } else if (status === 408) {
    code = 'timeout';
    retryable = true;
  } else if (status === 429) {
    code = 'rate_limited';
    retryable = true;
  } else if (status >= 500) {
    code = 'unavailable';
    retryable = true;
  }

  return new ModelError(`OpenAI request failed with HTTP ${status}.`, {
    code,
    retryable,
    provider: 'openai',
    status,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
}

function assertRequest(request: ModelGenerationRequest): void {
  if (!request.model.trim()) {
    throw new ModelError('model must not be empty.', {
      code: 'invalid_request',
      retryable: false,
      provider: 'openai',
    });
  }
  if (request.messages.length < 1) {
    throw new ModelError('messages must contain at least one entry.', {
      code: 'invalid_request',
      retryable: false,
      provider: 'openai',
    });
  }
  if (
    request.maxOutputTokens !== undefined &&
    (!Number.isSafeInteger(request.maxOutputTokens) ||
      request.maxOutputTokens < 1)
  ) {
    throw new ModelError('maxOutputTokens must be a positive integer.', {
      code: 'invalid_request',
      retryable: false,
      provider: 'openai',
    });
  }
  if (
    request.temperature !== undefined &&
    (!Number.isFinite(request.temperature) ||
      request.temperature < 0 ||
      request.temperature > 2)
  ) {
    throw new ModelError('temperature must be between 0 and 2.', {
      code: 'invalid_request',
      retryable: false,
      provider: 'openai',
    });
  }
}

function chatBody(request: ModelGenerationRequest): JsonRecord {
  const body: JsonRecord = {
    model: request.model,
    messages: request.messages.map(({ role, content }) => ({ role, content })),
  };
  if (request.temperature !== undefined) body.temperature = request.temperature;
  if (request.maxOutputTokens !== undefined) {
    body.max_completion_tokens = request.maxOutputTokens;
  }
  return body;
}

function createStreamAbortContext(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number,
): StreamAbortContext {
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
    controller.abort(new Error('Model stream timed out.'));
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

async function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) throw signal.reason;
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason ?? new Error('Model stream aborted.'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([reader.read(), aborted]);
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
  }
}

async function* sseData(
  response: Response,
  signal: AbortSignal,
): AsyncIterable<string> {
  if (!response.body) throw invalidResponse('OpenAI stream body was empty.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const drain = function* (): Iterable<string> {
    buffer = buffer.replaceAll('\r\n', '\n');
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) yield data;
      boundary = buffer.indexOf('\n\n');
    }
  };

  try {
    while (true) {
      const chunk = await readStreamChunk(reader, signal);
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      yield* drain();
    }
    buffer += decoder.decode();
    yield* drain();
    const trailing = buffer.trim();
    if (trailing) {
      const data = trailing
        .split(/\r?\n/u)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (data) yield data;
    }
  } finally {
    reader.releaseLock();
  }
}

export class OpenAIModelAdapter implements ModelClient {
  public readonly provider = 'openai';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly organization: string | undefined;
  private readonly project: string | undefined;
  private readonly fetchImplementation: typeof fetch;
  private readonly sleep: ModelSleep | undefined;

  public constructor(options: OpenAIModelAdapterOptions) {
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) {
      throw new ModelError('OpenAI apiKey must not be empty.', {
        code: 'authentication',
        retryable: false,
        provider: this.provider,
      });
    }
    this.baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(
      /\/+$/u,
      '',
    );
    this.organization = options.organization?.trim() || undefined;
    this.project = options.project?.trim() || undefined;
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep;
  }

  private executionHooks(): ModelExecutionHooks {
    return this.sleep === undefined ? {} : { sleep: this.sleep };
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      'content-type': 'application/json',
    };
    if (this.organization) headers['openai-organization'] = this.organization;
    if (this.project) headers['openai-project'] = this.project;
    return headers;
  }

  private async post(
    path: string,
    body: JsonRecord,
    signal: AbortSignal,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await this.fetchImplementation(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new ModelError(
        'OpenAI request failed before receiving a response.',
        {
          code: 'unavailable',
          retryable: true,
          provider: this.provider,
          cause: error,
        },
      );
    }
    if (!response.ok) throw errorForResponse(response);
    return response;
  }

  private async postJson(
    path: string,
    body: JsonRecord,
    signal: AbortSignal,
  ): Promise<unknown> {
    const response = await this.post(path, body, signal);
    try {
      return await response.json();
    } catch (error) {
      throw invalidResponse('OpenAI response was not valid JSON.', error);
    }
  }

  public async generate(
    request: ModelGenerationRequest,
  ): Promise<ModelGenerationResult> {
    assertRequest(request);
    return executeModelOperation(
      request,
      async ({ signal }) => {
        const response = await this.postJson(
          '/chat/completions',
          chatBody(request),
          signal,
        );
        const content = readChatText(response);
        return {
          provider: this.provider,
          model: readResponseModel(response, request.model),
          text: content.text,
          finishReason: content.finishReason,
          usage: readUsage(asRecord(response)?.usage),
        };
      },
      this.executionHooks(),
    );
  }

  public async generateStructured<T>(
    request: ModelStructuredOutputRequest<T>,
  ): Promise<ModelStructuredOutputResult<T>> {
    assertRequest(request);
    if (!request.schemaName.trim()) {
      throw new ModelError('schemaName must not be empty.', {
        code: 'invalid_request',
        retryable: false,
        provider: this.provider,
      });
    }
    return executeModelOperation(
      request,
      async ({ signal }) => {
        const body = chatBody(request);
        body.response_format = {
          type: 'json_schema',
          json_schema: {
            name: request.schemaName,
            strict: true,
            schema: request.schema,
          },
        };
        const response = await this.postJson('/chat/completions', body, signal);
        const content = readChatText(response);
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(content.text);
        } catch (error) {
          throw invalidResponse(
            'OpenAI structured response was not valid JSON.',
            error,
          );
        }
        let value: T;
        try {
          value = request.parse(parsedJson);
        } catch (error) {
          throw invalidResponse(
            'OpenAI structured response failed application validation.',
            error,
          );
        }
        return {
          provider: this.provider,
          model: readResponseModel(response, request.model),
          value,
          rawText: content.text,
          finishReason: content.finishReason,
          usage: readUsage(asRecord(response)?.usage),
        };
      },
      this.executionHooks(),
    );
  }

  public async embed(
    request: ModelEmbeddingRequest,
  ): Promise<ModelEmbeddingResult> {
    if (!request.model.trim()) {
      throw new ModelError('model must not be empty.', {
        code: 'invalid_request',
        retryable: false,
        provider: this.provider,
      });
    }
    if (request.inputs.length < 1) {
      throw new ModelError('inputs must contain at least one entry.', {
        code: 'invalid_request',
        retryable: false,
        provider: this.provider,
      });
    }
    if (
      request.dimensions !== undefined &&
      (!Number.isSafeInteger(request.dimensions) || request.dimensions < 1)
    ) {
      throw new ModelError('dimensions must be a positive integer.', {
        code: 'invalid_request',
        retryable: false,
        provider: this.provider,
      });
    }

    return executeModelOperation(
      request,
      async ({ signal }) => {
        const body: JsonRecord = {
          model: request.model,
          input: request.inputs,
        };
        if (request.dimensions !== undefined)
          body.dimensions = request.dimensions;
        const response = await this.postJson('/embeddings', body, signal);
        const record = asRecord(response);
        const data = record?.data;
        if (!Array.isArray(data)) {
          throw invalidResponse(
            'OpenAI embedding response did not include data.',
          );
        }
        const entries = data.map((entry) => {
          const embeddingRecord = asRecord(entry);
          const index = embeddingRecord?.index;
          const embedding = embeddingRecord?.embedding;
          if (
            typeof index !== 'number' ||
            !Number.isSafeInteger(index) ||
            !Array.isArray(embedding) ||
            !embedding.every(
              (value) => typeof value === 'number' && Number.isFinite(value),
            )
          ) {
            throw invalidResponse('OpenAI embedding entry was invalid.');
          }
          return { index, embedding: embedding as number[] };
        });
        entries.sort((left, right) => left.index - right.index);
        if (entries.length !== request.inputs.length) {
          throw invalidResponse(
            'OpenAI embedding count did not match request inputs.',
          );
        }
        return {
          provider: this.provider,
          model: readResponseModel(response, request.model),
          embeddings: entries.map((entry) => entry.embedding),
          usage: readUsage(record?.usage, 0),
        };
      },
      this.executionHooks(),
    );
  }

  public async *stream(
    request: ModelGenerationRequest,
  ): AsyncIterable<ModelStreamEvent> {
    assertRequest(request);
    const policy = normalizeModelRequestPolicy(request);
    const streamAbort = createStreamAbortContext(
      request.signal,
      policy.timeoutMs,
    );
    const operationOptions: ModelRequestOptions = {
      timeoutMs: policy.timeoutMs,
      signal: streamAbort.controller.signal,
      ...(request.retry === undefined ? {} : { retry: request.retry }),
    };
    let usage: ModelUsage | undefined;
    let finishReason: ModelFinishReason = 'unknown';
    let responseModel = request.model;

    try {
      const body = chatBody(request);
      body.stream = true;
      body.stream_options = { include_usage: true };
      const response = await executeModelOperation(
        operationOptions,
        () =>
          this.post('/chat/completions', body, streamAbort.controller.signal),
        this.executionHooks(),
      );
      for await (const data of sseData(
        response,
        streamAbort.controller.signal,
      )) {
        if (data === '[DONE]') break;
        let chunk: unknown;
        try {
          chunk = JSON.parse(data);
        } catch (error) {
          throw invalidResponse(
            'OpenAI stream event was not valid JSON.',
            error,
          );
        }
        responseModel = readResponseModel(chunk, responseModel);
        const record = asRecord(chunk);
        if (record?.usage !== null && record?.usage !== undefined) {
          usage = readUsage(record.usage);
          yield {
            type: 'usage',
            provider: this.provider,
            model: responseModel,
            usage,
          };
        }
        const choices = record?.choices;
        if (!Array.isArray(choices)) continue;
        for (const rawChoice of choices) {
          const choice = asRecord(rawChoice);
          const delta = asRecord(choice?.delta);
          if (typeof delta?.content === 'string' && delta.content.length > 0) {
            yield {
              type: 'text_delta',
              provider: this.provider,
              model: responseModel,
              text: delta.content,
            };
          }
          if (
            choice?.finish_reason !== null &&
            choice?.finish_reason !== undefined
          ) {
            finishReason = normalizeFinishReason(choice.finish_reason);
          }
        }
      }
      if (!usage) {
        throw invalidResponse('OpenAI stream completed without usage.');
      }
      const completed: ModelCompletedEvent = {
        type: 'completed',
        provider: this.provider,
        model: responseModel,
        finishReason,
        usage,
      };
      yield completed;
    } catch (error) {
      if (request.signal?.aborted) {
        throw new ModelError('Model request was aborted.', {
          code: 'aborted',
          retryable: false,
          provider: this.provider,
          cause: request.signal.reason,
        });
      }
      if (streamAbort.timedOut()) {
        throw new ModelError('Model stream timed out.', {
          code: 'timeout',
          retryable: true,
          provider: this.provider,
          cause: error,
        });
      }
      throw error;
    } finally {
      streamAbort.cleanup();
    }
  }
}
