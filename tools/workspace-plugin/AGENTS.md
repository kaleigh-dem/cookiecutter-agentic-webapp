# Workspace plugin guidance

- Generators are architecture enforcement, not convenience-only scripts.
- Preserve deterministic output and refuse silent overwrites.
- Every generator requires unit tests for paths, tags, and public exports.
- Generated projects must receive scope, type, and runtime tags.
- Keep generated domain and contract code framework-free.
- Update generator schemas, README commands, and `docs/TODO.md` together.
- Run the plugin through Nx and verify the generated project graph before marking work complete.
