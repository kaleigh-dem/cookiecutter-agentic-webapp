# SteadyStack Identity Migration

SteadyStack is the canonical public identity for this Nx platform. The rebrand changes repository-owned names and defaults; it does not change the agentic-development model, architectural boundaries, or the identity chosen by an adopting application.

## Canonical SteadyStack identity

Use these values for current repository and template operations:

- repository: `kaleigh-dem/steady-stack`
- display name: `SteadyStack`
- package scope: `@steadystack`
- root package: `@steadystack/source`
- Nx plugin: `@steadystack/workspace-plugin`
- upgrade executable: `steadystack-upgrade`
- release artifact: `steadystack-workspace-plugin-<VERSION>.tgz`
- default technical prefix: `steadystack`

New documentation, generated instructions, package manifests, release automation, and repository links use the canonical identity.

## What did not change

The migration preserves:

- the repository's agentic-development purpose and terminology;
- Nx project boundaries, generators, validation, and delivery controls;
- the application slug, display name, package scope, services, database, and images selected by an existing generated workspace;
- repository-local `pnpm template:upgrade` behavior;
- a temporary deprecated upgrade-command alias for compatibility with previously released consumers.

Updating upstream SteadyStack provenance must not rename an adopter's product.

## Create a new workspace

Use the renamed repository:

```bash
npx create-nx-workspace@23.1.1 <WORKSPACE_NAME> \
  --template kaleigh-dem/steady-stack
```

Then initialize the product's own identity and profiles:

```bash
cd <WORKSPACE_NAME>
pnpm install --frozen-lockfile
pnpm initialize:workspace <WORKSPACE_NAME> \
  --displayName="<DISPLAY_NAME>" \
  --packageScope=<PACKAGE_SCOPE> \
  --repositoryOwner=<GITHUB_ORGANIZATION>
pnpm install --frozen-lockfile
pnpm template:identity:check
```

## Upgrade an existing generated workspace

Prepare a dedicated branch and install the target SteadyStack artifact:

```bash
git status --short
git switch -c chore/steadystack-upgrade-<TARGET_VERSION>

TARGET_VERSION=<TARGET_VERSION>
pnpm add --save-dev \
  "./steadystack-workspace-plugin-${TARGET_VERSION}.tgz"
```

Review the migration before applying it:

```bash
pnpm exec steadystack-upgrade \
  --to "$TARGET_VERSION" \
  --dry-run
```

Resolve reported ownership conflicts deliberately. Application-owned files are never silently replaced, and customized generated-once files may require a structured merge.

Apply and validate:

```bash
pnpm exec steadystack-upgrade \
  --to "$TARGET_VERSION" \
  --apply
pnpm install --frozen-lockfile
pnpm template:identity:check
pnpm check
git status --short
git diff
```

Keep the template migration separate from product feature work.

## Update external integrations

After adopting the SteadyStack identity, verify systems that are outside the repository tree:

- local Git remotes and trusted checkout paths;
- the rendered wiki remote at `steady-stack.wiki.git`;
- package publishing permissions for `@steadystack`;
- artifact discovery for `steadystack-workspace-plugin-<VERSION>.tgz`;
- container registry, release, deployment, and provenance integrations;
- badges, webhooks, issue references, security tooling, and external CI;
- reviewer and automation configuration that stores a repository identifier.

GitHub redirects help with ordinary links after a repository rename, but they do not replace explicit integration verification.

## Compatibility guidance

The release package retains a deprecated pre-SteadyStack upgrade alias only to support previously released consumers. Treat it as a transition mechanism, not a current command. New automation and documentation should invoke `steadystack-upgrade`.

The exact historical name mapping and compatibility inventory are maintained in [`docs/steadystack-migration.md`](https://github.com/kaleigh-dem/steady-stack/blob/main/docs/steadystack-migration.md).

## Related pages

- [Quick Start](Quick-Start)
- [Choosing Workspace Profiles](Choosing-Workspace-Profiles)
- [Releases and Upgrades](Releases-and-Upgrades)
- [Repository and GitHub Setup](Repository-and-GitHub-Setup)
- [Troubleshooting](Troubleshooting)

## Next steps

1. [Quick Start](Quick-Start)
2. [Releases and Upgrades](Releases-and-Upgrades)

[Back to Home](Home)
