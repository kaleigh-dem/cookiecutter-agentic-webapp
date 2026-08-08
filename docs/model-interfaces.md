# Provider-neutral model interfaces

P14-02 adds a backend-only model boundary under `packages/backend/model`. It provides reusable generation, structured-output, embedding, and streaming contracts without wiring a model into the default applications or selecting a default provider.

## Public model contract

`ModelClient` exposes:

| Operation | Input | Normalized output |
| --- | --- | --- |
| `generate` | model, ordered messages, optional temperature/output limit, cancellation/timeout/retry policy | text, finish reason, provider/model identity, token usage |
| `generateStructured` | generation input plus JSON Schema name/schema and an application parser | parser-validated typed value, raw JSON text, finish reason, identity, usage |
| `embed` | model, ordered text inputs, optional dimensions, cancellation/timeout/retry policy | vectors in input order, identity, usage |
| `stream` | generation input | async `text_delta`, `usage`, and `completed` events |

The stream events are internal provider-neutral runtime events. They do not define an HTTP/SSE/WebSocket contract for the browser; that versioned transport belongs to P14-03.

Messages currently carry `system`, `user`, or `assistant` text. Tool calls, multimodal payloads, prompt versioning, and conversation persistence are intentionally outside P14-02.

## Structured output

Structured generation uses both provider constraints and application validation. The request supplies JSON Schema to the adapter and a `parse(value: unknown)` function. The adapter must parse provider text as JSON and then run the application parser before returning `T`.

A provider claiming schema compliance is not sufficient to cross the typed application boundary. Invalid JSON or a rejected application parse is normalized as `invalid_response` and is not retried automatically.

## Usage and finish reasons

Every completed generation and stream reports normalized usage:

- `inputTokens`
- `outputTokens`
- `totalTokens`
- optional `cachedInputTokens`

Embeddings report zero output tokens because that operation has no generated-token concept. Malformed provider usage is an `invalid_response` rather than silently guessed accounting.

Finish reasons currently normalize to `stop`, `length`, `content_filter`, or `unknown`. Typed tool termination states are deliberately deferred to P14-03.

## Cancellation, timeout, and retry

All requests accept an optional caller `AbortSignal`, timeout, and retry policy. The shared defaults are:

```text
timeout: 30 seconds
maximum attempts: 3
base retry delay: 250 ms
maximum retry delay: 2 seconds
```

The delay is deterministic bounded exponential backoff. Adapters can attach provider `Retry-After` guidance, which is capped by the request's maximum delay. There is no hidden jitter in the shared layer so behavior stays reproducible in tests; applications may choose a different policy when composing requests.

Only normalized errors explicitly marked retryable are retried. Caller cancellation is terminal. Timeouts, rate limits, transient network/service failures, and selected 5xx responses may be retryable; authentication, permission, invalid request, and invalid response failures are not.

For streams, connection establishment can retry before the first provider response is consumed. Once stream consumption begins, an interruption is surfaced instead of replaying the request and risking duplicate output. The stream timeout covers the whole streaming lifecycle.

## Normalized errors

`ModelError` uses these codes:

| Code | Typical meaning | Default retryable |
| --- | --- | --- |
| `aborted` | caller cancellation | no |
| `timeout` | operation or stream exceeded its budget | yes |
| `rate_limited` | provider throttling | yes |
| `authentication` | invalid provider credential | no |
| `permission` | credential lacks provider/model access | no |
| `invalid_request` | rejected local/provider request shape | no |
| `invalid_response` | malformed provider data or failed typed parser | no |
| `unavailable` | network or provider service unavailable | yes |
| `provider_error` | provider failure without a safer classification | adapter-defined, currently no for unknown OpenAI statuses |

Normalized errors may include status and bounded retry guidance but do not copy provider response bodies into their message.

## Deterministic adapter

`DeterministicModelAdapter` takes fixture values for generation text, structured data, embedding vectors, stream chunks, and usage. It performs no network access and is intended for unit/integration tests and downstream development paths that need predictable model behavior.

The deterministic adapter validates fixture shape at the same public boundary. For example, the number of embedding fixture vectors must match the number of requested inputs.

## OpenAI adapter

`OpenAIModelAdapter` is the concrete provider adapter for P14-02. It uses Node's built-in `fetch`, so no OpenAI SDK or other model-provider dependency is added to the workspace dependency graph.

It translates:

- Chat Completions for text generation;
- Chat Completions `json_schema` response formatting for structured output;
- Chat Completions server-sent event frames for model streaming;
- Embeddings for ordered embedding vectors.

The adapter receives its API key through server-side construction. The repository does not define a public browser credential, default provider environment variable, or automatic provider selection. ADR 0020 still requires server-side allowlisting plus application-owned data-classification, residency, retention, and fallback decisions before production use.

## Data handling

The model project is stateless. It does not persist prompts, responses, vectors, structured values, or stream events and does not log raw provider traffic. Applications remain responsible for deciding whether classified data may be sent to an approved provider and whether any output may be stored.

Provider error bodies are intentionally excluded from normalized errors because an upstream service can echo submitted content. Credentials stay in the server-side adapter constructor and must not enter browser bundles or repository files.

## Validation

Run the focused model checks with:

```bash
pnpm nx run backend-model:test
pnpm nx run backend-model:typecheck
pnpm nx run backend-model:lint
pnpm nx run backend-model:build
pnpm docs:check
```

See `docs/adr/0020-optional-ai-profile-boundaries.md` for the profile/data boundary and `docs/adr/0021-provider-neutral-model-interfaces.md` for the model execution decision.
