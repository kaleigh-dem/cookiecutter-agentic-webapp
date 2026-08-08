# ADR 0023: Reviewed prompt artifacts and evaluation evidence

- Status: Accepted
- Date: 2026-08-08

## Context

ADR 0020 requires optional AI runtime behavior to remain provider-neutral, data-classification aware, and free of implicit prompt persistence. ADR 0021 adds normalized model identity and usage accounting, while ADR 0022 adds typed tools and versioned browser streaming without composing an AI workflow into the default applications. P14-04 must make prompt and tool-instruction changes reviewable and make quality, latency, usage, and cost regressions visible before later tasks add durable execution, safety orchestration, or generated AI-profile composition.

Prompt text and tool instructions are executable application behavior even when represented as strings. Editing them without version identity or evaluation evidence makes a code review unable to distinguish an intentional behavior change from an incidental rewrite. Model and tool runtime changes can also alter output quality, latency, token use, or cost without changing a public TypeScript signature.

Evaluation data has the same classification concerns as runtime model traffic. Raw production prompts, completions, tool arguments, or tool results must not become a convenient fixture corpus merely because an evaluation runner exists.

## Decision

1. **Store prompt and tool instructions as strict reviewed artifacts.**
   - `packages/backend/agent-eval` defines schema version 1 for `prompt` and `tool_instruction` artifacts.
   - Each artifact has a stable identifier, semantic version, content, declared variables, and approval metadata. Tool instructions additionally bind to a server-owned tool identifier.
   - The runtime parser rejects unsupported fields, unstable versions, unapproved review state, empty content, duplicate variables, and malformed tool instructions.
   - A SHA-256 fingerprint covers behavior-bearing content but not reviewer metadata. Content changes therefore require a new version and produce a new fingerprint, while a re-review of unchanged content does not create a false behavior revision.
   - The committed P14-04 artifacts are synthetic examples used to exercise the lifecycle; they are not production prompts and are not composed into an application.

2. **Make deterministic evaluation the default reusable boundary.**
   - Evaluation fixtures declare whether their data is `synthetic`, `redacted`, or `production-derived`.
   - Synthetic and redacted fixtures are the default. Production-derived fixtures fail closed unless explicit data-review evidence is present before the subject is invoked.
   - Evaluators are typed callbacks identified as either `rule` or `model_grader`. Rule evaluators are deterministic and are preferred whenever the expected property can be checked directly.
   - A model grader is an application-supplied callback. This project does not select a provider, credential, region, or production model and does not send evaluation data to a model by itself.
   - Evaluation summaries retain fixture identifiers, evaluator identifiers, safe result codes, quality scores, timing, provider/model identifiers when supplied, normalized usage, cost estimates, and budget outcomes. Raw fixture input, subject output, prompts, and tool payloads are intentionally absent from returned evidence summaries.

3. **Treat quality, latency, token use, and estimated cost as explicit budgets.**
   - Quality is the mean normalized evaluator score for a case and can have a minimum threshold.
   - Latency can have a maximum threshold and uses an injectable clock so deterministic fixtures do not depend on wall-clock timing.
   - Token budgets use input, output, total, and optional cached-input counts compatible with the normalized model usage boundary from ADR 0021.
   - Estimated cost is calculated only from explicit pricing supplied by the application or evaluation harness. Cached input is priced separately when a cached-input rate is provided; pricing is never inferred from user or model content.
   - If a configured token or cost budget lacks the usage or pricing evidence needed to evaluate it, the budget fails closed rather than silently passing.

4. **Require changed evaluation evidence for governed prompt, model, and tool changes.**
   - Versioned evidence manifests live under `docs/evaluations/evidence` and bind reviewed prompt fingerprints, governed changed paths, deterministic commands, budgets, and payload-safe result summaries.
   - `pnpm agent-eval:check` validates every evidence manifest. When `NX_BASE` and `NX_HEAD` are supplied by CI, it also computes the changed file set and requires a changed evidence manifest to cover every governed change.
   - Governed changes are reviewed prompt/tool-instruction JSON artifacts, non-test model runtime source under `packages/backend/model/src`, and non-test typed-tool runtime source under `packages/backend/agent-tool/src`.
   - Tests alone do not satisfy the evidence requirement; the changed evidence manifest must enumerate the behavior-bearing path. Conversely, test-only edits do not create a false requirement for new model or tool evaluation evidence.
   - CI runs the evidence check before affected build/test validation, and the root `check` command includes it for full repository validation.

5. **Preserve the optional-profile and future-task boundaries.**
   - P14-04 does not add a model-backed API route, runtime prompt registry in an application, provider credentials, production tool registration, prompt persistence, conversation persistence, or an evaluation SaaS dependency.
   - Durable checkpoints and human approval remain P14-05. Input/output policy, tool allowlists, fallback rules, and broader safety governance remain P14-06. Installing and composing an AI-enabled generated profile remains P14-07.
   - The default non-AI applications remain free of model-provider runtime dependencies and do not instantiate this evaluation library.

## Consequences

Prompt and tool-instruction behavior now has reviewable version identity and cryptographic content binding. Applications can run deterministic rules or supply a model-backed grader without changing the provider-neutral lifecycle, and evaluation output can be retained as metrics and identifiers without turning CI evidence into a transcript store.

Quality, latency, token, and cost regressions can fail a deterministic budget. CI also has an explicit repository-level requirement tying prompt, model, and tool runtime changes to changed evaluation evidence rather than relying on reviewer memory.

The evidence check deliberately governs the current reusable prompt, model, and tool boundaries rather than guessing future application-specific prompt or tool locations. P14-07 may extend generated-profile conventions once concrete AI-enabled application files exist.
