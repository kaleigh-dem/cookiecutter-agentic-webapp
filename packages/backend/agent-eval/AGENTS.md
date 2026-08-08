# Agent evaluation boundary guidance

- Treat prompt and tool-instruction content as versioned reviewed artifacts; changing content requires a new semantic version and fresh evaluation evidence.
- Keep fixtures synthetic or redacted by default. Production-derived fixtures require explicit data-review evidence before execution.
- Evaluation results may retain prompt/model/tool identifiers, quality scores, latency, usage, cost estimates, and policy codes, but not raw prompts, model output, tool arguments, or tool results by default.
- Model-graded evaluators are application-supplied callbacks. Do not select a provider, credential, region, or production model in this project.
- Token and cost budgets use normalized usage supplied by the caller; pricing is explicit input and must never be inferred from user or model content.
- Do not add durable execution, provider fallback, safety policy orchestration, or AI-profile generation here; those remain later Phase 14 tasks.
