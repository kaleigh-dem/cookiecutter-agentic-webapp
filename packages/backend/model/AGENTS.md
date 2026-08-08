# Model boundary guidance

- Keep `ModelClient` request, response, usage, streaming, and error types provider-neutral.
- Keep provider wire formats, authentication headers, status mapping, and streaming translation inside adapter files.
- Do not add provider SDK dependencies merely for convenience; any future dependency must preserve the optional profile boundary from ADR 0020.
- Never log or persist raw prompts, completions, embeddings, structured values, credentials, or provider error bodies from this project.
- Treat caller cancellation as terminal. Retry only normalized retryable failures and never automatically replay a partially consumed stream.
- Structured output must pass the application parser before typed values cross the boundary.
- Do not add tools, browser transport, prompt/evaluation lifecycle, or durable execution while working on the P14-02 model layer.
- Test adapter behavior with injected transports and deterministic fixtures; tests must not call external model services.
