# Code Generation

This page documents the local generators that act as the approved structural write API for humans and AI agents, and why application teams should use them instead of copying project structures by hand.

## Prerequisites

- Run from the workspace root.
- The workspace must be initialized and the second frozen install completed.
- Inspect help with `pnpm nx g @<SCOPE>/workspace-plugin:<GENERATOR> --help`; the scope is rewritten during initialization.

## Why use local generators

The generators assign Nx tags, package metadata, TypeScript references, public barrels, tests, README files, and nested `AGENTS.md` guidance consistently. They also refuse to overwrite their primary output path. Manual duplication can omit architectural tags, references, tests, public boundaries, or nested agent guidance and may pass a superficial review only to fail later Nx or ESLint checks. In agent-led projects, extend a generator when a structure will be repeated rather than teaching each agent to copy an example directory.

The root command names are rewritten during initialization, so these commands remain stable:

```bash
pnpm generate:domain <NAME>
pnpm generate:feature <NAME>
pnpm generate:job <NAME> --queue=<QUEUE>
pnpm generate:contract <NAME>
```

Names are trimmed and normalized with Nx naming rules. Empty names fail. Existing primary output paths fail rather than being overwritten.

## Agent expectations after generation

A generator creates an architectural starting point, not finished product behavior. The implementing agent must still:

1. replace placeholders with product-specific behavior;
2. keep reusable logic in the generated library rather than the application route or bootstrap;
3. add adapters in the correct infrastructure project;
4. update contracts and migrations at their sources of truth;
5. add focused tests and observable verification;
6. run formatting, affected checks, and the full repository contract.

## Domain generator

### Intended use

Create a framework-free backend domain and application library.

### Syntax

```bash
pnpm generate:domain <DOMAIN_NAME>
```

Example:

```bash
pnpm generate:domain billing
```

### Generated structure

```text
packages/backend/billing/
├── project.json
├── package.json
├── README.md
├── AGENTS.md
├── tsconfig.json
├── tsconfig.lib.json
├── eslint.config.mjs
└── src/
    ├── index.ts
    └── lib/
        ├── domain/billing.ts
        └── application/
            ├── billing-repository.ts
            ├── create-billing.ts
            └── create-billing.spec.ts
```

Tags: `scope:backend`, `type:domain`, `runtime:node`.

### Follow-up work

1. Replace the placeholder entity and use case with product invariants.
2. Keep frameworks and PostgreSQL out of the domain project.
3. Add persistence adapters in a data-access project.
4. Export only supported behavior from `src/index.ts`.
5. Run:

```bash
pnpm nx run backend-billing:test
pnpm nx run backend-billing:typecheck
pnpm nx run backend-billing:build
```

## Feature generator

### Intended use

Create a browser-only feature library that routes can compose.

### Syntax

```bash
pnpm generate:feature <FEATURE_NAME>
```

Example:

```bash
pnpm generate:feature account-settings
```

### Generated structure

```text
packages/web/features/account-settings/
├── project.json
├── package.json
├── README.md
├── AGENTS.md
└── src/
    ├── index.ts
    └── lib/
        ├── account-settings-feature.tsx
        ├── account-settings-model.ts
        └── account-settings-model.spec.ts
```

Tags: `scope:web`, `type:feature`, `runtime:browser`.

### Boundaries and follow-up

- Keep App Router files thin.
- Do not import Node-only projects.
- Put network access behind generated typed clients.
- Add loading, empty, error, and success states.
- Replace placeholder view-model text.
- Compose the feature from the relevant `apps/web/src/app` route.

Verification:

```bash
pnpm nx run web-feature-account-settings:test
pnpm nx run web-feature-account-settings:typecheck
pnpm nx run web-feature-account-settings:build
```

## Job generator

### Intended use

Create a transport-independent worker job slice and register it in the worker jobs barrel.

### Syntax

```bash
pnpm generate:job <JOB_NAME> --queue=<LOGICAL_QUEUE>
```

`--queue` defaults to `default`.

Example:

```bash
pnpm generate:job refresh-search-index --queue=search
```

### Generated files

```text
apps/worker/src/jobs/refresh-search-index/
├── contract.ts
├── handler.ts
├── handler.spec.ts
├── index.ts
├── README.md
└── AGENTS.md
```

The generator also appends an export to `apps/worker/src/jobs/index.ts`.

### Follow-up work

1. Replace the placeholder payload and result with a versioned shared contract where cross-process compatibility matters.
2. Register dispatch behavior in the worker composition root.
3. Define idempotency and retry classification before enabling automatic retries.
4. Preserve correlation and actor identifiers.
5. Keep queue/PostgreSQL clients outside core handler logic.
6. Add timeouts around external side effects.

Verification:

```bash
pnpm nx run worker:test
pnpm nx run worker:typecheck
pnpm nx run worker:build
```

## Contract generator

### Intended use

Create a versionable Zod runtime schema under the shared contract package.

### Syntax

```bash
pnpm generate:contract <CONTRACT_NAME>
```

Example:

```bash
pnpm generate:contract project-created
```

### Generated files

```text
packages/contracts/src/project-created/
├── schema.ts
├── schema.spec.ts
├── index.ts
└── README.md
```

The root contracts barrel is updated automatically.

### Follow-up work

1. Define the real payload and validation constraints.
2. Prefer additive changes.
3. Version breaking event contracts rather than mutating deployed semantics.
4. Add compatibility coverage where the contract crosses releases.
5. Run:

```bash
pnpm nx run contracts:test
pnpm contracts:generate
pnpm contracts:check
pnpm contracts:compat
```

## End-to-end example

Create a billing domain, web feature, asynchronous job, and event contract:

```bash
pnpm generate:domain billing
pnpm generate:feature billing-settings
pnpm generate:contract billing-account-created
pnpm generate:job provision-billing-account --queue=billing
pnpm format
pnpm affected
```

Then:

1. Define billing invariants and repository ports in the domain.
2. Add PostgreSQL schema, migration, and adapters in `packages/database`.
3. Add or update the HTTP OpenAPI source.
4. Generate contracts and use the generated client in the web feature.
5. Write the outbox event in the application transaction.
6. Dispatch the worker job idempotently.
7. Add focused tests at each boundary.
8. Run `pnpm check`.

## Generator options

| Generator  | Options                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `domain`   | positional `name`; internal `--skipFormat`                              |
| `feature`  | positional `name`; internal `--skipFormat`                              |
| `job`      | positional `name`; `--queue` default `default`; internal `--skipFormat` |
| `contract` | positional `name`; internal `--skipFormat`                              |

Do not depend on undocumented options.

## Related pages

- [Agentic Development Model](Agentic-Development-Model)
- [Architecture](Architecture)
- [Everyday Development](Everyday-Development)
- [Validation and Testing](Validation-and-Testing)

## Next steps

1. [Architecture](Architecture)
2. [Validation and Testing](Validation-and-Testing)

[Back to Home](Home)
