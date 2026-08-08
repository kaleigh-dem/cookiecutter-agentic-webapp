# Typed agent tools

`backend-agent-tool` is the framework-neutral invocation boundary introduced by P14-03. A tool definition supplies runtime input and output schemas, an authorization function, and an executor. `invokeTool` validates model-provided input, authorizes against application-supplied actor context, runs the handler only after authorization succeeds, validates the handler output, and returns the preserved invocation identifiers.

The runtime-schema interface is structural: Zod schemas and other validators with a compatible `parse(unknown)` method can be used without coupling this project to a validation library.

The project does not select tools from model output, persist tool payloads, retry tool side effects, or grant authority. Applications compose the allowed tool definitions and authenticated actor context. Durable execution, approval checkpoints, and broader safety/governance policy remain P14-05 and P14-06 work.
