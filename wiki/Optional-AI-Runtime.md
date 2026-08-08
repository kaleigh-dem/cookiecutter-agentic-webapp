# Optional AI Runtime

SteadyStack now includes reusable **optional** runtime AI boundaries for provider-neutral model access, typed tool execution, browser streaming, and prompt/evaluation evidence. These capabilities are intentionally separate from the repository's coding-agent operating model and are **not composed into the default generated applications**.

## Prerequisites

- Understand [Choosing Workspace Profiles](Choosing-Workspace-Profiles), especially that `--ai=false` remains the default.
- Treat runtime AI as an application capability with explicit data, provider, authorization, retention, evaluation, and operational ownership.

## Profile boundary and current status

The optional AI profile describes the product being built; it does not control whether coding agents can work in the repository.

- `ai=false` remains the default profile.
- Coding-agent support through `AGENTS.md`, Nx/MCP discovery, generators, validation, delivery controls, and review handoffs remains available regardless of the AI profile.
- `ai=true` currently records product intent and requires the web and API applications, but it still does **not** generate or compose a runnable model-backed application workflow.
- The default workspace must remain free of model-provider runtime dependencies.

Phase 14 status:

- **P14-01 — complete:** profile, data-classification, retention, and provider-selection boundaries.
- **P14-02 — complete:** provider-neutral `ModelClient`, OpenAI native-`fetch` adapter, and deterministic no-network adapter.
- **P14-03 — complete:** typed authorized tools and the V1 browser agent-stream contract.
- **P14-04 — complete:** reviewed prompt/tool-instruction artifacts and CI-enforced evaluation evidence.
- **P14-05 — next:** optional durable execution for checkpoints, resumable runs, human approval, and interruption recovery.

The repository roadmap in `docs/TODO.md` is authoritative for future sequencing.

## Provider-neutral model boundary

`packages/backend/model` exposes a backend-only `ModelClient` interface without choosing a default provider or wiring model calls into the API or web application.

The public operations are:

| Operation | Purpose |
| --- | --- |
| `generate` | Text generation with normalized finish reason, provider/model identity, token usage, cancellation, timeout, and retry behavior. |
| `generateStructured` | JSON-Schema-constrained generation plus application-owned parsing before a typed value crosses the boundary. |
| `embed` | Ordered embedding vectors with normalized provider/model identity and usage. |
| `stream` | Provider-neutral async runtime events for text deltas, usage, and completion. |

Two adapters are available:

- `OpenAIModelAdapter` uses Node's built-in `fetch`; no OpenAI SDK is added to the dependency graph.
- `DeterministicModelAdapter` performs no network access and supplies predictable fixtures for tests and local composition.

The model project is stateless. It does not persist prompts, completions, vectors, structured values, or stream events.

## Data classification, retention, and provider selection

AI data inherits the strictest classification of the source data it contains. Prompts, retrieved context, attachments, structured model input/output, tool arguments, and tool results must be evaluated under the application's data policy.

Fail closed on prohibited data:

- Do not send secrets, access tokens, session credentials, signing material, database credentials, or other authentication material to model providers.
- Sensitive, regulated, tenant-confidential, or residency-constrained data requires an explicit policy allowing that classification for the selected provider and region.
- Provider-side retention, training use, abuse-review storage, and regional processing must be compatible with the application's policy before that provider is allowed.
- Production-derived evaluation fixtures require the same classification and retention review as production model traffic; synthetic or redacted fixtures are preferred.

Provider and model selection is server-side and allowlisted. Browser input, prompt text, user input, or model output must not directly select an unapproved provider, model, region, credential, or tool set. Credentials remain server-side.

Fallback between models or providers is not yet a complete runtime policy. Any application-specific fallback must preserve data handling, residency, retention, safety, tool capability, and output-contract requirements.

## Typed tool authorization

`packages/backend/agent-tool` provides runtime-validated typed tool invocation. A tool definition has:

- an application-owned tool identifier;
- a runtime input schema;
- a runtime output schema;
- an authorization function;
- an execution function.

Invocation is ordered deliberately:

1. validate trusted invocation identifiers;
2. parse model-provided input;
3. authorize the authenticated actor against the selected server-side tool;
4. execute only when authorization allows the call;
5. validate the handler output;
6. return typed output with correlation identifiers preserved.

Model output is never an authorization decision. Actor identity, tenant identity, scopes, credentials, provider/model choice, and tool allowlists are trusted application context, not model-controlled arguments.

P14-03 does not automatically retry side-effecting tool execution. Checkpoints, approval workflows, resumable execution, and recovery belong to P14-05.

## V1 browser agent stream

The shared browser-safe stream contract is:

```text
protocol: steadystack.agent-stream
version: 1
content type: application/x-ndjson; charset=utf-8
```

Each NDJSON line is one strict event. Every V1 event carries sequence and correlation identity, including trace, actor, conversation, provider, and model identifiers. Tool lifecycle events additionally carry tool and tool-call identifiers.

V1 event types are:

- `started`
- `text_delta`
- `usage`
- `tool_started`
- `tool_completed`
- `tool_denied`
- `completed`
- `error`

The protocol intentionally has no raw prompt, completion, tool-input, or tool-result field. The Agent Tasks web feature consumes the shared decoder, requires contiguous sequence numbers and stable actor/conversation identity, and preserves validated provider/model/tool identifiers.

This is a transport boundary only. The default API does not expose a model-backed streaming endpoint.

## Prompt and evaluation lifecycle

`packages/backend/agent-eval` adds reviewed, versioned prompt and tool-instruction artifacts plus deterministic evaluation evidence.

Prompt artifacts record a stable identifier and semantic version, kind, content, template variables, review metadata, and `toolId` for tool instructions. Behavior-bearing fields are fingerprinted with SHA-256. Changing prompt or tool-instruction behavior requires a new version, a new review, and updated evaluation evidence.

Evaluation fixtures declare `synthetic`, `redacted`, or `production-derived` classification. Evaluators can be deterministic rules or application-supplied model graders. Evidence can enforce quality, latency, input/output/total token, and estimated cost budgets.

Run the focused evidence gate with:

```bash
pnpm agent-eval:check
```

The root `pnpm check` runs this immediately after `pnpm docs:check`. In CI, the evidence checker inspects the diff and requires changed evidence to cover governed prompt artifacts and non-test model/tool runtime behavior changes. A governed prompt, model, or tool behavior change must therefore include reviewed evaluation evidence rather than only code and tests.

Useful focused checks include:

```bash
pnpm nx run backend-model:test
pnpm nx run backend-model:typecheck
pnpm nx run backend-agent-tool:test
pnpm nx run backend-agent-tool:typecheck
pnpm nx run backend-agent-eval:test
pnpm nx run backend-agent-eval:typecheck
pnpm agent-eval:check
```

## What is not implemented yet

The current reusable boundaries should not be described as a complete generated AI application profile. Phase 14 still has explicit gaps:

- **Durable execution (P14-05):** no shared checkpointing, resumable run, human-approval, or interruption-recovery adapter is composed yet.
- **Broader safety and governance (P14-06):** no complete input/output policy orchestration, sensitive-data policy runtime, tool allowlist policy, audit-event policy, or provider/model fallback policy is supplied yet.
- **Generated runnable AI profile (P14-07):** `ai=true` does not yet install or wire a reference model-backed workflow into generated applications.
- The repository does not choose a default model provider, orchestration framework, vector database, prompt-management service, or durable-agent framework.

Applications that compose the current primitives must still own provider credentials and allowlisting, data classification and retention decisions, runtime policy, safe tool registration, prompt content, operational budgets, production monitoring, and incident response.

## Related pages

- [Home](Home)
- [Architecture](Architecture)
- [Choosing Workspace Profiles](Choosing-Workspace-Profiles)
- [Validation and Testing](Validation-and-Testing)
- [Agentic Development Model](Agentic-Development-Model)

## Next steps

1. [Choosing Workspace Profiles](Choosing-Workspace-Profiles)
2. [Architecture](Architecture)
3. [Validation and Testing](Validation-and-Testing)

[Back to Home](Home)
