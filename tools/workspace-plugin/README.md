# Workspace plugin

The published Nx preset and local generators encode the repository's approved structure so humans and coding agents create consistent projects and slices.

## Commands

```bash
pnpm initialize:workspace customer-portal \
  --packageScope=@acme \
  --repositoryOwner=acme-platform
pnpm install --frozen-lockfile
pnpm template:identity:check
pnpm generate:domain billing
pnpm generate:feature account-settings
pnpm generate:job refresh-search-index --queue=search
pnpm generate:contract project-created
```

The equivalent Nx form is:

```bash
pnpm nx g @agentic-webapp/workspace-plugin:<generator> <name>
```

Use `preset` as the public entry point when consuming a released tarball. The lower-level `init` generator remains available for local compatibility, while `preset` records the originating template version and removes template-maintainer release tooling from the generated repository.

After initialization, use the configured package scope in the equivalent Nx form. The root generator scripts are rewritten automatically.

## Output contracts

- `preset` invokes initialization, records `upstream.version`, removes template-maintainer release files and commands, and marks the downstream local plugin private.
- `init` validates workspace identity and profiles, writes the versioned `workspace.template.json`, rewrites repository-wide package, service, image, database, telemetry, ownership, and TypeScript identities, and removes unselected application projects.
- `domain` creates `packages/backend/<name>` as a tagged, framework-free library with domain and application layers.
- `feature` creates `packages/web/features/<name>` as a browser-only library with a public component and testable view model.
- `job` creates `apps/worker/src/jobs/<name>` and updates the worker jobs barrel.
- `contract` creates `packages/contracts/src/<name>` and updates the contracts barrel.

The initialization contract, upstream-reference allowlist, and compatibility rules are documented in `docs/template-initialization.md`. Template versioning and artifact publication are documented in `docs/template-releases.md`. Structural generators refuse to overwrite their primary output path. Run `pnpm format` after composing generators with custom edits.

## Adding a generator

1. Add its entry to `generators.json`.
2. Add `schema.json`, `schema.d.ts`, `generator.ts`, and `generator.spec.ts`.
3. Use `normalizeGeneratorName`, overwrite protection, and `formatGeneratorFiles` from `shared.ts` where the generator creates named structural slices.
4. Assign scope, type, and runtime tags to every generated project.
5. Add the command and output contract to this README.
6. Update `docs/TODO.md` and run `pnpm check`.
