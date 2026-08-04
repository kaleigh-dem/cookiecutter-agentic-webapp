# Agent Tasks web feature

Owns the browser-facing Agent Tasks workflow. App Router files compose this package through its public API instead of implementing feature behavior directly.

## Responsibilities

- acquire bearer credentials through the selected browser authentication adapter
- call the generated contracts client rather than handwritten HTTP wrappers
- create and preserve correlation identifiers
- model create, load, empty, error, queued, running, succeeded, and failed states
- keep browser code free of Node-only imports and server secrets
- expose accessible UI behavior for route composition

The route entry point is `apps/web/src/app/agent-tasks/page.tsx`. HTTP types, runtime validators, and the client come from `@agentic-webapp/contracts`; API and domain behavior remain outside this package.

## Validation

```bash
pnpm nx run web-feature-agent-tasks:test
pnpm nx run web-feature-agent-tasks:typecheck
pnpm nx run web-feature-agent-tasks:build
pnpm nx run web-feature-agent-tasks:e2e
```

See `docs/browser-authentication.md` for credential behavior and `docs/reference-feature-agent-tasks.md` for the complete browser-to-worker flow.
