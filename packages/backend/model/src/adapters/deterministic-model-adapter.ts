import {
  ModelError,
  type ModelClient,
  type ModelEmbeddingRequest,
  type ModelEmbeddingResult,
  type ModelGenerationRequest,
  type ModelGenerationResult,
  type ModelStreamEvent,
  type ModelStructuredOutputRequest,
  type ModelStructuredOutputResult,
  type ModelUsage,
} from '../lib/model';

export interface DeterministicModelFixture {
  readonly generationText: string;
  readonly structuredValue: unknown;
  readonly embeddings: readonly (readonly number[])[];
  readonly streamTextChunks?: readonly string[];
  readonly usage?: Partial<ModelUsage>;
}

function usageFromFixture(usage: Partial<ModelUsage> | undefined): ModelUsage {
  const inputTokens = usage?.inputTokens ?? 1;
  const outputTokens = usage?.outputTokens ?? 1;
  const totalTokens = usage?.totalTokens ?? inputTokens + outputTokens;
  const normalized: ModelUsage = { inputTokens, outputTokens, totalTokens };
  if (usage?.cachedInputTokens !== undefined) {
    return { ...normalized, cachedInputTokens: usage.cachedInputTokens };
  }
  return normalized;
}

function assertActive(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new ModelError('Model request was aborted.', {
      code: 'aborted',
      retryable: false,
      cause: signal.reason,
    });
  }
}

export class DeterministicModelAdapter implements ModelClient {
  public readonly provider = 'deterministic';

  public constructor(private readonly fixture: DeterministicModelFixture) {}

  public async generate(
    request: ModelGenerationRequest,
  ): Promise<ModelGenerationResult> {
    assertActive(request.signal);
    return {
      provider: this.provider,
      model: request.model,
      text: this.fixture.generationText,
      finishReason: 'stop',
      usage: usageFromFixture(this.fixture.usage),
    };
  }

  public async generateStructured<T>(
    request: ModelStructuredOutputRequest<T>,
  ): Promise<ModelStructuredOutputResult<T>> {
    assertActive(request.signal);
    try {
      return {
        provider: this.provider,
        model: request.model,
        value: request.parse(this.fixture.structuredValue),
        rawText: JSON.stringify(this.fixture.structuredValue) ?? 'null',
        finishReason: 'stop',
        usage: usageFromFixture(this.fixture.usage),
      };
    } catch (error) {
      throw new ModelError('Deterministic structured output failed validation.', {
        code: 'invalid_response',
        retryable: false,
        provider: this.provider,
        cause: error,
      });
    }
  }

  public async embed(
    request: ModelEmbeddingRequest,
  ): Promise<ModelEmbeddingResult> {
    assertActive(request.signal);
    if (this.fixture.embeddings.length !== request.inputs.length) {
      throw new ModelError(
        'Deterministic embedding fixture count must match request inputs.',
        {
          code: 'invalid_response',
          retryable: false,
          provider: this.provider,
        },
      );
    }
    return {
      provider: this.provider,
      model: request.model,
      embeddings: this.fixture.embeddings,
      usage: usageFromFixture(this.fixture.usage),
    };
  }

  public async *stream(
    request: ModelGenerationRequest,
  ): AsyncIterable<ModelStreamEvent> {
    const usage = usageFromFixture(this.fixture.usage);
    for (const text of this.fixture.streamTextChunks ?? [
      this.fixture.generationText,
    ]) {
      assertActive(request.signal);
      yield {
        type: 'text_delta',
        provider: this.provider,
        model: request.model,
        text,
      };
    }
    assertActive(request.signal);
    yield {
      type: 'usage',
      provider: this.provider,
      model: request.model,
      usage,
    };
    yield {
      type: 'completed',
      provider: this.provider,
      model: request.model,
      finishReason: 'stop',
      usage,
    };
  }
}
