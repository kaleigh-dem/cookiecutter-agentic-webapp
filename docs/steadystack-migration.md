# SteadyStack identity migration

SteadyStack is the canonical public identity for this Nx platform. The repository remains a production-minded platform for humans and coding agents; the migration changes public names and identity-owned defaults, not the agentic-development model.

## Canonical names

| Contract                  | Previous                            | SteadyStack                     |
| ------------------------- | ----------------------------------- | ------------------------------- |
| GitHub repository         | `kaleigh-dem/nx-fullstack-platform` | `kaleigh-dem/steady-stack`      |
| Display name              | `Agentic Webapp Nx Template`        | `SteadyStack`                   |
| Package scope             | `@agentic-webapp`                   | `@steadystack`                  |
| Root package              | `@agentic-webapp/source`            | `@steadystack/source`           |
| Nx plugin                 | `@agentic-webapp/workspace-plugin`  | `@steadystack/workspace-plugin` |
| Upgrade executable        | `agentic-webapp-upgrade`            | `steadystack-upgrade`           |
| Release artifact basename | `agentic-webapp-workspace-plugin`   | `steadystack-workspace-plugin`  |

## Package and generator impact

All repository-owned packages and imports move to the `@steadystack` scope. Generator commands use `@steadystack/workspace-plugin`, including the `preset`, `domain`, `feature`, `job`, and `contract` generators. Reinstall dependencies after updating manifests so the workspace lockfile and links agree.

## Upgrade compatibility

The canonical executable is `steadystack-upgrade`. Version 0.2.0 publicly shipped `agentic-webapp-upgrade`, so the release package retains that name as a deprecated alias to the same runner. The release smoke test exercises the alias against the 0.1.0 fixture and applies the migration with the canonical command. Existing repository-local `pnpm template:upgrade` commands continue to work. New documentation and generated instructions use only `steadystack-upgrade`.

The 0.1.0 fixture and its ordered migration intentionally retain former package and template identifiers as legacy input. They are not current defaults.

## Generated workspaces

New workspaces record the SteadyStack upstream repository and package contract while still choosing their own unrelated application slug, display name, package scope, database, services, and image names. Existing generated workspaces keep their downstream identity. Updating upstream provenance does not rename an adopter's application. Consumers should run the upgrade command, review reported conflicts, apply the migration, reinstall dependencies, and run their normal validation contract.

## Release artifacts and repository rename

Current and future tarballs use `steadystack-workspace-plugin-<version>.tgz`. Tracked source links, provenance, badges, wiki publication, and repository metadata point to `kaleigh-dem/steady-stack`, but this pull request does not change the GitHub repository setting. GitHub repository renaming and integration verification happen after merge.

## Consumer checklist

1. Replace repository-owned `@agentic-webapp/*` dependencies and imports with `@steadystack/*`.
2. Replace generator invocations with `@steadystack/workspace-plugin`.
3. Use `steadystack-upgrade` for direct upgrades; treat the former command as temporary compatibility only.
4. Update artifact discovery and download automation to `steadystack-workspace-plugin-<version>.tgz`.
5. Reinstall with the supported pnpm version and run formatting, type checking, tests, builds, template identity checks, release artifact smoke tests, and generated-workspace validation.
6. After the GitHub rename, update local remotes, trusted checkout paths, wiki remotes, package publishing permissions, badges, and external integrations.
