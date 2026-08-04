# Workspace plugin

The published Nx preset, local generators, and upgrade command encode the repository's approved structure so humans and coding agents create consistent projects and slices.

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
- `domain` creates `packages/backend/<name>` as a tagged, framework-free library with domain and application layers.
- `feature` creates `packages/web/features/<name>` as a browser-only library with a public component and testable view model.
- `job` creates `apps/worker/src/jobs/<name>` and updates the worker jobs barrel.
- `contract` creates `packages/contracts/src/<name>` and updates the contracts barrel.

The initialization contract and compatibility rules are documented in `docs/template-initialization.md`. Template versioning and artifact publication are documented in `docs/template-releases.md`. Downstream file ownership, dry runs, apply behavior, and conflict handling are documented in `docs/template-upgrades.md`. Structural generators refuse to overwrite their primary output path. Run `pnpm format` after composing generators with custom edits.

## Adding a generator

1. Add its entry to `generators.json`.
2. Add `schema.json`, `schema.d.ts`, `generator.ts`, and `generator.spec.ts`.
3. Use `normalizeGeneratorName`, overwrite protection, and `formatGeneratorFiles` from `shared.ts` where the generator creates named structural slices.
4. Assign scope, type, and runtime tags to every generated project.
5. Add the command and output contract to this README.
6. Update `docs/TODO.md` when the generator changes roadmap status, sequencing, scope, or exit criteria.
7. Run `pnpm check`.
