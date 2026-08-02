# Generated workspace validation

The **Generated workspace** workflow proves that a release-shaped template artifact can produce an independently named repository and complete the same validation and preview lifecycle expected from a downstream application.

Pull requests and pushes to `main` package the current workspace plugin with the release tooling, install that tarball into a clean copy of the template, and invoke its public `preset` generator. The template release workflow repeats the same lifecycle against the tarball downloaded from the draft GitHub Release before making the release public.

## Generated profile

The validation fixture intentionally differs from the upstream repository:

- application slug: `generated-ci`
- display name: `Generated Workspace CI`
- package scope: `@generated-ci`
- repository owner: `generated-ci`
- applications: web, API, and worker
- authentication: development
- worker transport: PostgreSQL
- deployment profile: containers
- telemetry and optional AI capabilities: disabled

Default ports are retained so the generated preview stack exercises the documented first-run path without additional runner-specific configuration.

## Lifecycle contract

`pnpm template:workspace:e2e` performs the following sequence:

1. copies the template into a clean temporary repository without Git history, dependencies, build output, or local environment files;
2. installs the source workspace with the frozen lockfile and replaces the linked plugin with the packaged release artifact;
3. invokes `@agentic-webapp/workspace-plugin:preset` from that artifact;
4. installs the generated repository again with the rewritten frozen lockfile;
5. verifies template provenance, generated identity, selected applications, and removal of template-maintainer workflows and scripts;
6. creates a baseline Git commit and runs `pnpm check` plus the repository-wide identity detector;
7. builds production images, starts PostgreSQL, applies migrations, and starts the API, worker, and web preview services;
8. applies the development seed, verifies migration status, reruns preview smoke tests, and enforces performance budgets;
9. tears the Compose project down twice and confirms that no labeled containers, networks, or volumes remain;
10. fails when validation changes tracked generated content, leaves unintended upstream identity, or modifies the source checkout.

Compose logs are written to `test-output/generated-workspace-compose.log` when the preview lifecycle fails. GitHub Actions uploads that directory as a short-lived diagnostic artifact.

## Local execution

Package the current release candidate and pass its tarball to the lifecycle runner:

```bash
version=$(node -p "require('./package.json').version")
pnpm template:release:pack -- \
  --version "$version" \
  --output dist/template-release
pnpm template:workspace:e2e -- \
  --artifact "dist/template-release/agentic-webapp-workspace-plugin-${version}.tgz" \
  --expected-version "$version"
```

Pass `--workspace <path>` to retain the generated repository after a successful run. Failed runs always retain it and print its location for inspection.
