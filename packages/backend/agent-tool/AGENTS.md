# Agent tool boundary guidance

- Treat tool input as model-controlled and validate it before use.
- Obtain actor, trace, conversation, provider, model, and tool-call identifiers from trusted application context rather than tool arguments.
- Authorization is mandatory for every valid invocation and must complete before the executor runs.
- Model output may request a tool but must never decide whether the authenticated actor is authorized to invoke it.
- Validate tool output before it crosses the typed boundary.
- Normalized errors and default telemetry should retain identifiers and policy outcomes, not raw tool arguments or results.
- Do not add automatic retries, persistence, human-approval checkpoints, or tool-selection policy here; those belong to later Phase 14 tasks.
