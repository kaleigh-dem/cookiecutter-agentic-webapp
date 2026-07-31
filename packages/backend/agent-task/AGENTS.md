# AgentTask domain guidance

- Keep domain and application code framework-free.
- Expose cross-project behavior through src/index.ts only.
- Add infrastructure adapters in a separate data-access project when persistence is introduced.
- Test invariants and use cases without network or database dependencies.
