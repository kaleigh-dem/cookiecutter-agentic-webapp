# Workspace plugin

The published Nx preset, local generators, and upgrade command are the deterministic structural write API for this agent-compatible repository. They encode approved project locations, tags, references, public barrels, tests, documentation, and local `AGENTS.md` guidance so humans and coding agents do not have to reconstruct architecture by copying examples.

Use a generator whenever one of the supported structures is being created. When a new structure will recur across the product, extend the plugin rather than teaching each agent a manual file-copy procedure.

## Commands

```bash
pnpm initialize:workspace customer-portal \
  --packageScope=@acme \
  --repositoryOwner=acme-platform
pnpm install --frozen-lockfile
pnpm template:identity:check
TARGET_VERSION=0.2.0
pnpm template:upgrade -- --to "$TARGET_VERSION" --dry-run
pnpm generate:domain billing
pnpm generate:feature account-settings
pnpm generate:job refresh-search-index --queue=search
pnpm generate:contract project-created
```

Replace the example target version with the release being evaluated.

The equivalent Nx form is:

```bash
pnpm nx g @agentic-webapp/workspace-plugin:<generator> <name>
```

Use `preset` as the public entry point when consuming a released tarball. The lower-level `init` generator remains available for local compatibility, while `preset` records the originating template version, retains downstream upgrade tooling, and removes template-maintainer release tooling from the generated repository.

The release package also exposes the `agentic-webapp-upgrade` binary. It reads `workspace.template.json`, defaults to a dry run, applies ordered version migrations, reports ownership classes and conflicts, and synchronizes the repository-local upgrade runner after a successful apply.

After initialization, use the configured package scope in the equivalent Nx form. The root generator scripts are rewritten automatically.

## Output contracts

- `preset` invokes initialization, records `upstream.version` and the ownership-policy version, removes template-maintainer release files and commands, retains upgrade tooling, and marks the downstream local plugin private.
- `init` validates workspace identity and profiles, writes the versioned `workspace.template.json`, rewrites repository-wide package, service, image, database, telemetry, ownership, and TypeScript identities, and removes unselected application projects.
- `domain` creates `packages/backend/<name>` as a tagged, framework-free library with domain and application layers, tests, public exports, README, and local agent guidance.
- `feature` creates `packages/web/features/<name>` as a browser-only library with a public component, testable view model, public exports, README, and local agent guidance.
- `job` creates `apps/worker/src/jobs/<name>`, its testable handler and contract, README and agent guidance, then updates the worker jobs barrel.
- `contract` creates `packages/contracts/src/<name>`, its Zod schema and test, README, and the contracts barrel export.

Structural generators refuse to overwrite their primary output path and format by default.

## Agent workflow after generation

The generated output is an architectural starting point, not finished product behavior. The implementing agent must:

1. replace placeholders with product-specific rules;
2. keep reusable logic in the generated library rather than application routes or bootstrap code;
3. add infrastructure adapters in the correct data-access project;
4. update contract and migration sources rather than generated outputs;
5. add focused tests and observable verification;
6. run `pnpm format`, affected validation, and `pnpm check`;
7. review the diff for generated files, tags, references, public exports, and unintended overwrites.

See `docs/agentic-development.md` for the complete repository workflow.

The initialization contract and compatibility rules are documented in `docs/template-initialization.md`. Template versioning and artifact publication are documented in `docs/template-releases.md`. Downstream file ownership, dry runs, apply behavior, and conflict handling are documented in `docs/template-upgrades.md`.

## Adding a generator

1. Add its entry to `generators.json`.
2. Add `schema.json`, `schema.d.ts`, `generator.ts`, and `generator.spec.ts`.
3. Use `normalizeGeneratorName`, overwrite protection, and `formatGeneratorFiles` from `shared.ts` where the generator creates named structural slices.
4. Assign scope, type, and runtime tags to every generated project.
5. Generate a public entry point, focused tests, README, and local `AGENTS.md` when the new structure owns a subsystem boundary.
6. Add the command and output contract to this README.
7. Update `docs/TODO.md` when the generator changes upstream roadmap status, sequencing, scope, or exit criteria.
8. Run `pnpm check`.
