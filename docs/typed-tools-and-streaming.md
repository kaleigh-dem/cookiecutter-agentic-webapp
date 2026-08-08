# Typed tools and agent streaming

P14-03 adds two reusable runtime boundaries without composing an AI feature into the default applications: typed tool invocation under `packages/backend/agent-tool`, and a browser-safe streaming contract under `packages/contracts/src/agent-stream` consumed by the Agent Tasks web feature.

## Typed tool invocation

A tool definition has four required parts:

- an application-owned tool identifier
- a runtime input schema
- a runtime output schema
- authorization and execution functions

The runtime schema contract is deliberately structural:

```ts
interface ToolRuntimeSchema<T> {
  parse(value: unknown): T;
}
```

Zod schemas satisfy this interface, but the tool boundary does not require callers to use Zod. `invokeTool` performs the invocation in this order:

1. validate trusted invocation identifiers
2. parse model-provided input
3. authorize the authenticated actor against the selected server-side tool
4. execute only when authorization allows the call
5. parse the handler output
6. return the typed output with the same trace, actor, conversation, provider, model, tool, and tool-call identifiers

Malformed input never reaches authorization or the handler. Denied authorization never reaches the handler. Invalid handler output never crosses the typed boundary.

The actor and other trusted identifiers are separate from tool arguments. Do not copy an actor ID, tenant ID, scope, credential, provider, model, or tool allowlist decision out of model output and treat it as authority.

Normalized `ToolInvocationError` values include correlation identifiers and, for a policy denial, a reason code. They do not include raw tool arguments or raw tool results in their messages. Applications should keep the same identifier-only default in logs and traces.

P14-03 does not retry tool execution automatically. Side-effect retry, checkpoints, approval workflows, and recovery belong to the durable execution work in P14-05.

## Versioned browser stream

The universal contract uses:

```text
protocol: steadystack.agent-stream
version: 1
content type: application/x-ndjson; charset=utf-8
```

Each line is one strict JSON event. Every V1 event carries:

- `sequence`
- `emittedAt`
- `traceId`
- `actorId`
- `conversationId`
- `providerId`
- `modelId`

Tool lifecycle events also carry `toolId` and `toolCallId`. V1 event types are `started`, `text_delta`, `usage`, `tool_started`, `tool_completed`, `tool_denied`, `completed`, and `error`.

The V1 schema intentionally has no raw prompt, completion, tool-input, or tool-result field. Applications that need to surface safe business output should define an explicitly reviewed, redacted application event in a future protocol version rather than attaching arbitrary provider or tool payloads to V1.

`serializeAgentStreamEvent` validates and writes one NDJSON line. `AgentStreamDecoder` incrementally parses strings or `Uint8Array` chunks, including chunks split in the middle of a UTF-8 or JSON record boundary. Unsupported versions and unknown fields fail validation.

## Web consumption

`AgentStreamConsumer` in the Agent Tasks web feature wraps the shared decoder. In addition to schema validation it requires contiguous sequence numbers and stable `traceId`, `actorId`, and `conversationId` values for one response. The consumer returns the original validated events, so provider, model, tool, and tool-call identifiers remain available to browser state and observability code.

Provider and model identifiers are event-level rather than fixed as stream identity. This leaves room for the explicit provider/model fallback policy planned for P14-06 without allowing two actors or conversations to be mixed into one response.

## Composition boundary

P14-03 supplies contracts and runtime primitives only. It does not add a model-backed API endpoint, register production tools, persist conversations, add prompt versioning, or make `ai=true` install a runnable AI workflow. Applications that later compose these pieces must still satisfy ADR 0020 data classification, retention, provider allowlisting, and tool authority requirements.

See ADRs 0020–0022 and `docs/model-interfaces.md` for the surrounding boundaries.
