# Provider-neutral model boundary

This project owns the backend runtime contract for optional model capabilities. It is not wired into the default API or web applications. The public surface exposes provider-neutral generation, structured-output, embedding, and streaming interfaces plus normalized usage, cancellation, timeout, retry, and error semantics.

## Contracts

`ModelClient` exposes four operations:

- `generate` returns text, a normalized finish reason, provider/model identity, and token usage.
- `generateStructured` sends a JSON Schema contract and requires an application parser before typed data is returned.
- `embed` preserves input ordering and returns normalized token usage alongside vectors.
- `stream` yields internal provider-neutral `text_delta`, `usage`, and `completed` events. This is not the versioned browser streaming protocol planned by P14-03.

All operations accept an `AbortSignal`, an operation timeout, and retry settings. The default non-streaming policy uses a 30-second timeout, at most three attempts, and bounded exponential delays from 250 ms through 2 seconds. Only errors explicitly marked `retryable` are retried. Provider `Retry-After` delays are honored up to the configured maximum delay. Caller cancellation never retries.

Streaming applies the configured timeout to the complete stream. A provider connection may be retried before stream consumption starts, but an interrupted partial stream is never replayed automatically because doing so could duplicate output.

## Adapters

`DeterministicModelAdapter` is a fixture-driven test adapter. It performs no network access and returns caller-supplied deterministic generation, structured, embedding, streaming, and usage values.

`OpenAIModelAdapter` is a replaceable OpenAI adapter implemented with the Node runtime `fetch` API rather than a provider SDK dependency. It translates the Chat Completions JSON Schema and streaming shapes plus the Embeddings API into the shared contract. API keys remain constructor inputs supplied by server-side composition; this project does not read browser configuration or persist credentials, prompts, responses, or embeddings.

The adapter maps provider failures into `ModelError` codes such as `authentication`, `permission`, `invalid_request`, `rate_limited`, `timeout`, `unavailable`, and `invalid_response`. Provider response bodies are not copied into normalized error messages.

## Boundaries

- Do not import provider SDK request, response, usage, or error classes into the shared contract.
- Do not persist model input/output or emit raw prompt/response content to logs from this project.
- Do not add tool execution, browser streaming transport, prompt lifecycle, evaluation, or durable-agent behavior here as part of P14-02.
- Keep provider and model selection in server-owned allowlisted configuration as required by ADR 0020.

## Validation

```bash
pnpm nx run backend-model:test
pnpm nx run backend-model:typecheck
pnpm nx run backend-model:lint
pnpm nx run backend-model:build
```

See `docs/model-interfaces.md`, ADR 0020, and ADR 0021 for the architecture and operational contract.
