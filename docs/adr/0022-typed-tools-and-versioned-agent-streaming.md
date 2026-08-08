# ADR 0022: Typed tools and versioned agent streaming

- Status: Accepted
- Date: 2026-08-07

## Context

ADR 0020 requires runtime AI capabilities to remain optional, provider-neutral, least-privilege, and fail closed around tool authority. ADR 0021 adds normalized model generation and internal streaming events but explicitly reserves the application-to-browser transport for P14-03. The next reusable boundary must let applications expose typed tools without treating model output as authorization, and it must carry model and tool progress to a browser without coupling the browser to provider wire formats.

Tool calls combine untrusted model-controlled arguments with application side effects. A type signature alone is insufficient because model output is runtime data, and validating input without validating output still lets an implementation violate the application contract. Authorization also cannot be inferred from a tool name or model choice: it must be evaluated for the authenticated application actor immediately before invocation.

Streaming has a related boundary problem. Provider SSE frames are not a stable browser API, and an unversioned internal event shape cannot evolve safely across independently deployed clients and servers. At the same time, traces must be able to correlate model output and tool execution without logging raw prompts, tool arguments, or tool results by default.

## Decision

1. **Add a framework-neutral typed tool invocation boundary.**
   - `packages/backend/agent-tool` defines `ToolDefinition`, structural runtime input/output schemas, authorization decisions, normalized invocation errors, and `invokeTool`.
   - Runtime schemas use a minimal `parse(unknown)` contract so applications may compose Zod or another validator without making the tool boundary depend on a specific schema package.
   - Model-controlled input is validated before policy evaluation or handler execution. Handler output is validated before it crosses the typed boundary.
   - P14-03 does not add automatic retries for tool side effects, persistence, resumable execution, or human approval checkpoints.

2. **Authorize every valid tool invocation against trusted application context.**
   - The application supplies trace, actor, conversation, provider, model, and tool-call identifiers separately from model-provided tool input.
   - The selected server-side tool definition contributes the tool identifier.
   - Authorization is mandatory and completes before the executor runs. A denied authorization never invokes the handler.
   - Model output may request a tool, but it never supplies or overrides the authenticated actor and never decides whether invocation is allowed.
   - Normalized errors retain correlation identifiers and a policy reason code where applicable, but their messages do not include raw tool arguments or results.

3. **Define browser streaming as a strict, versioned NDJSON protocol in shared contracts.**
   - The protocol identifier is `steadystack.agent-stream`, V1 is encoded as newline-delimited JSON, and the media type is `application/x-ndjson; charset=utf-8`.
   - Every event includes protocol version, sequence, emission time, trace identifier, actor identifier, conversation identifier, provider identifier, and model identifier.
   - Tool lifecycle events additionally include tool and tool-call identifiers. V1 includes started, text delta, usage, tool started, tool completed, tool denied, completed, and normalized error events.
   - V1 schemas are strict. Raw prompts, completions, tool arguments, and tool results are not protocol fields and unexpected fields are rejected.
   - Provider-native stream frames remain confined to provider adapters; applications translate normalized application events into this contract instead of forwarding provider frames.

4. **Make the browser consume the shared protocol rather than provider events.**
   - The Agent Tasks web feature exposes a small `AgentStreamConsumer` around the shared incremental decoder.
   - The consumer accepts arbitrary byte chunk boundaries, requires contiguous event sequence numbers, and rejects trace, actor, or conversation identity changes within one response.
   - Provider and model identifiers remain event-level so later explicitly configured fallback can be represented without weakening stream identity or changing V1 framing.

5. **Preserve the optional-profile boundary.**
   - P14-03 does not add an API route, instantiate a model client, register production tools, add provider credentials, or make the current `ai=true` declaration generate runtime code.
   - The default applications gain no model-provider dependency. The web feature consumes only the universal shared contract it already depends on.
   - Prompt/evaluation lifecycle, durable execution, approval checkpoints, provider fallback policy, tool allowlists, and broader input/output safety governance remain P14-04 through P14-06. AI-profile generation and a composed reference workflow remain P14-07.

## Consequences

Applications now have a reusable runtime-validated tool boundary in which authorization cannot be skipped for a valid invocation, and failures retain the identifiers needed for audit correlation without turning normalized errors into payload logs. Tool implementations remain ordinary application code and can use whichever runtime validator fits their project.

Browser streaming now has an explicit compatibility contract independent of provider APIs. Servers can emit strict V1 NDJSON and browsers can incrementally decode it while retaining trace, actor, conversation, model, and tool correlation. Future transport changes require a new protocol version rather than silently changing V1 semantics.

The repository still does not compose an AI workflow into the default applications. That separation is intentional until the optional profile generator and reference workflow are implemented in P14-07.
