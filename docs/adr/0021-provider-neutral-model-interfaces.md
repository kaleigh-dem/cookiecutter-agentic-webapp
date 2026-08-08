# ADR 0021: Provider-neutral model interfaces

- Status: Accepted
- Date: 2026-08-07

## Context

ADR 0020 separates coding-agent repository support from optional runtime AI capabilities and requires shared model contracts to remain provider-neutral while provider authentication, wire formats, retries, and streaming translation stay behind replaceable adapters. P14-02 must make that boundary executable before typed tools, browser streaming transport, prompt lifecycle, durable execution, or safety orchestration are introduced.

Provider APIs disagree about request shapes, streaming frames, token accounting, finish reasons, error bodies, retry guidance, and cancellation behavior. If those differences leak into application code, provider replacement becomes expensive and policies such as timeout, retry, data handling, and observability become inconsistent.

The default SteadyStack applications still do not execute model calls. This task supplies a reusable backend boundary and adapters without selecting a default provider or adding a model-provider package dependency.

## Decision

1. Add `packages/backend/model` as the provider-neutral backend model project.
   - `ModelClient` defines text generation, JSON-Schema structured output, embeddings, and asynchronous streaming.
   - Requests use ordinary messages, model identifiers, optional generation controls, an `AbortSignal`, timeout settings, and retry settings.
   - Results expose only normalized provider/model identity, finish reason, usage, text or typed values, and embedding vectors.
   - Streaming emits internal `text_delta`, `usage`, and `completed` events. These events are an adapter boundary, not the versioned application-to-browser transport reserved for P14-03.

2. Normalize execution behavior in the shared project.
   - The default timeout is 30 seconds per non-streaming attempt.
   - The default retry policy allows at most three attempts with deterministic bounded exponential delay from 250 ms to 2 seconds.
   - Only `ModelError` values explicitly marked retryable may retry. Provider `Retry-After` guidance is bounded by the configured maximum delay.
   - Caller cancellation is terminal and is surfaced as `aborted`.
   - Timeouts surface as retryable `timeout` errors. Authentication, permission, invalid-request, and invalid-response failures are not retryable.
   - Partial streams are never replayed automatically. Connection establishment may retry before consumption begins, while the configured stream timeout covers the complete stream lifecycle.

3. Normalize provider failures through `ModelError`.
   - The shared codes are `aborted`, `timeout`, `rate_limited`, `authentication`, `permission`, `invalid_request`, `invalid_response`, `unavailable`, and `provider_error`.
   - Provider response bodies are not copied into normalized error messages because they may echo request data.
   - Usage uses input, output, total, and optional cached-input token counts. Adapters must reject malformed usage instead of silently inventing provider data, except where an operation definition has no output-token concept such as embeddings.

4. Add two replaceable adapter implementations without a provider SDK dependency.
   - `DeterministicModelAdapter` is a fixture-driven, no-network adapter for deterministic tests and downstream development.
   - `OpenAIModelAdapter` uses the Node runtime `fetch` API to translate OpenAI Chat Completions, JSON Schema structured output, chat streaming, and Embeddings into the shared contract.
   - The OpenAI adapter receives its API key and optional endpoint metadata from server-side composition. It does not read browser state, select credentials from user input, or become the default application provider.

5. Structured output remains a two-part contract.
   - The provider receives JSON Schema for generation constraints.
   - The application supplies a parser and typed output is returned only after that parser accepts the provider JSON.
   - Provider schema compliance is therefore not treated as a substitute for runtime application validation.

6. Preserve ADR 0020 data and profile boundaries.
   - This project does not persist prompts, completions, embeddings, structured values, or stream events.
   - The adapters do not log raw model traffic or provider error bodies.
   - No API route, browser feature, tool runtime, prompt registry, evaluation system, or durable execution path is added by P14-02.
   - Provider/model allowlisting, classification, retention, residency, and fallback approval remain application-owned server policies.

## Consequences

Application code can target one stable model interface while adapters absorb provider protocol differences. Tests can exercise model-dependent behavior without network calls, and the first concrete provider adapter proves that generation, structured output, embeddings, streaming, usage, cancellation, timeout, error, and retry normalization are implementable without importing a provider SDK.

The repository now contains optional model runtime source, but the default applications still do not depend on or instantiate it and the dependency graph gains no external model-provider package. P14-03 may build typed tools and a versioned streaming transport on this boundary without changing its provider semantics.
