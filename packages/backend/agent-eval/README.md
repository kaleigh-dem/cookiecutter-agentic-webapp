# Backend agent evaluation

`backend-agent-eval` provides the provider-neutral prompt and evaluation lifecycle introduced by P14-04. It is a backend-only reusable library and is not composed into the default API, web, or worker applications.

It provides:

- strict versioned prompt and tool-instruction artifacts with approval metadata and SHA-256 content fingerprints
- deterministic synthetic/redacted evaluation fixtures with explicit review requirements for production-derived data
- rule evaluators and an application-supplied `model_grader` callback boundary without selecting a provider
- quality, latency, token-use, and estimated-cost budgets
- payload-safe evidence summaries that retain identifiers and metrics rather than prompt/model/tool payloads
- a repository evidence check that requires changed evidence for governed prompt artifacts, model runtime code, and tool runtime code

Run the focused checks with:

```bash
pnpm nx run backend-agent-eval:test
pnpm nx run backend-agent-eval:typecheck
pnpm nx run backend-agent-eval:lint
pnpm nx run backend-agent-eval:build
pnpm agent-eval:check
```

See `docs/prompt-evaluation-lifecycle.md` and ADR 0023 for the lifecycle and review requirements.
