# Prompt and evaluation lifecycle

P14-04 adds a backend-only lifecycle for reviewed prompt artifacts and deterministic evaluation evidence. It does not compose an AI workflow into the default applications and does not choose a model provider.

## Reviewed prompt artifacts

Prompt and tool-instruction JSON artifacts use schema version 1 and are parsed by `backend-agent-eval` before use. Every artifact declares:

- a stable lowercase identifier
- a stable semantic version such as `1.0.0`
- `kind: prompt` or `kind: tool_instruction`
- non-empty content
- a unique list of template variable names
- approved review metadata with reviewer identity and an ISO-8601 review timestamp
- `toolId` for tool instructions only

The parser is strict and rejects unknown fields. A SHA-256 fingerprint covers the behavior-bearing fields: schema version, artifact id/version, kind, content, variables, and tool id when present. Review metadata is intentionally outside that fingerprint so an unchanged artifact can be re-reviewed without pretending its behavior changed.

Changing prompt or tool-instruction content requires a new semantic version, a new review, and changed evaluation evidence. The committed artifacts under `packages/backend/agent-eval/artifacts/prompts` are synthetic lifecycle examples, not production application prompts.

## Evaluation fixtures and graders

An evaluation fixture declares its data classification as `synthetic`, `redacted`, or `production-derived`. Synthetic and redacted data are the expected defaults. Production-derived fixtures require explicit data-review metadata before the evaluation subject is invoked; without it, the runner fails closed.

An evaluator is either:

- `rule` for deterministic checks such as exact structured values, invariants, required fields, or other mechanically verifiable behavior
- `model_grader` for an application-supplied grading callback when semantic judgment is necessary

`backend-agent-eval` does not instantiate `ModelClient` or choose a provider for model grading. The application or isolated evaluation harness owns that composition and must still satisfy ADR 0020 provider, classification, retention, and residency constraints.

Evaluation case summaries deliberately exclude raw fixture input and subject output. They retain fixture and evaluator identifiers, safe metric codes, scores, latency, optional provider/model identifiers, normalized usage, estimated cost, and budget outcomes.

## Budgets

A case can enforce any combination of:

- minimum quality score
- maximum latency in milliseconds
- maximum input tokens
- maximum output tokens
- maximum total tokens
- maximum estimated USD cost

Quality is the mean score across configured evaluators. The clock is injectable for deterministic tests. Token accounting uses the same input/output/total/cached-input shape as the provider-neutral model boundary.

Cost estimation requires explicit per-million-token input and output prices, with an optional cached-input price. Cached input is subtracted from ordinary input before rates are applied. If a token budget has no usage measurement, or a cost budget has no cost measurement, that budget fails rather than being treated as satisfied.

## Evaluation evidence

Committed evidence lives in `docs/evaluations/evidence`. Version 1 manifests contain:

- an evidence and roadmap-task identifier
- recording time
- reviewed prompt artifact references and fingerprints
- governed changed paths categorized as `prompt`, `model`, or `tool`
- deterministic validation commands
- the budgets used for the evidence
- payload-safe result summaries

The P14-04 manifest records the synthetic prompt/tool-instruction fingerprints and a deterministic evaluation result that exercises quality, latency, token, cached-token, and estimated-cost accounting.

Run:

```bash
pnpm agent-eval:check
```

The command always validates all committed evidence manifests. In CI, Nx supplies `NX_BASE` and `NX_HEAD`; the check then inspects the Git diff and requires changed evidence to cover each governed behavior-bearing change. The current governed paths are:

- JSON prompt and tool-instruction artifacts under `packages/backend/agent-eval/artifacts/prompts`
- non-test source under `packages/backend/model/src`
- non-test source under `packages/backend/agent-tool/src`

This means a future prompt, model-runtime, or tool-runtime behavior change cannot pass the main CI lane with only code or tests; its PR must also update evaluation evidence. Test-only changes do not create a false evidence requirement.

## Focused validation

For changes to this lifecycle, run:

```bash
pnpm nx run backend-agent-eval:test
pnpm nx run backend-agent-eval:typecheck
pnpm nx run backend-agent-eval:lint
pnpm nx run backend-agent-eval:build
pnpm agent-eval:check
pnpm docs:check
pnpm format:check
```

P14-05 will add optional durable execution. Safety policy orchestration, tool allowlists, fallback policy, and generated AI-profile composition remain later Phase 14 work.
