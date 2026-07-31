<!-- nx configuration start-->
<!-- Leave the start & end comments so Nx can update this block. -->

# Nx workflow

- Explore the workspace with `pnpm nx show projects`, `pnpm nx show project <name>`, and `pnpm nx graph`.
- Run builds, linting, tests, and generators through Nx rather than invoking underlying tools directly.
- Use `pnpm nx affected -t lint typecheck test build` before broad `run-many` commands when working on a focused change.
- Check generator help rather than guessing flags: `pnpm nx g <generator> --help`.
- Use the Nx MCP server configured in `.mcp.json` when the agent supports MCP.

<!-- nx configuration end-->

# Repository architecture

## Before editing

1. Read the closest `AGENTS.md`.
2. Inspect the target project with `pnpm nx show project <name>`.
3. Use the project graph to identify owners and dependents.
4. Read relevant ADRs in `docs/adr`.
5. Prefer a generator for repeated structure.

## Dependency rules

Projects carry tags in `project.json`. ESLint fails when a dependency breaks these rules.

- `scope:web` may depend on `scope:web` or `scope:shared`.
- `scope:backend` may depend on `scope:backend` or `scope:shared`.
- `scope:shared` may only depend on `scope:shared`.
- Browser projects may not depend on Node-only projects.
- Applications may depend on libraries, never other applications.
- Contracts remain framework-free.
- UI packages may depend only on UI, contracts, and utilities.
- Environment variables are accessed through explicit configuration projects.

## Definition of done

- Formatting, lint, type checking, tests, and build pass through Nx.
- New projects have scope, runtime, and type tags.
- New public behavior has tests at the lowest effective layer.
- Boundaries are changed only with an ADR or an explicit architectural rationale.
- Sensitive values are neither logged nor committed.
