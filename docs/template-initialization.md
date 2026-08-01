# Template initialization

The `init` Nx generator captures the choices that distinguish one generated application repository from another. Run it after creating or cloning a workspace. Repeating the command with the same options produces byte-for-byte identical repository content.

```bash
pnpm initialize:workspace customer-portal \
  --displayName="Customer Portal" \
  --packageScope=@acme \
  --repositoryOwner=acme-platform \
  --codeowners=@acme/platform,@acme/security \
  --applications=web,api,worker \
  --webPort=3100 \
  --apiPort=4100 \
  --databasePort=55432 \
  --databaseName=customer_portal \
  --authentication=oidc \
  --workerTransport=postgres \
  --telemetry=true \
  --deploymentProfile=containers \
  --ai=true
```

Initialization changes the local plugin package scope, so refresh workspace links before invoking another generator:

```bash
pnpm install --frozen-lockfile
pnpm template:identity:check
```

## Generated initialization contract

The generator writes `workspace.template.json` as the canonical, versioned record of initialization choices. Identity-neutral workspaces use schema version 2. The manifest contains:

- application slug, display name, and npm package scope
- repository owner and normalized CODEOWNERS
- selected `web`, `api`, and `worker` applications
- web, API, and database ports plus the database name
- authentication, worker transport, telemetry, deployment, and optional AI profiles
- the upstream template repository used for attribution and future upgrade metadata

## Repository-wide identity replacement

Initialization rewrites every text file outside generated caches and dependency directories. It parameterizes:

- the internal npm scope and all workspace imports
- package names, generator commands, lockfile entries, and custom TypeScript conditions
- service, Compose project, telemetry, database-client, and application identifiers
- OCI image prefixes, image references, and deployment labels
- database defaults in environment files and Compose health checks
- generated CODEOWNERS and application-specific ownership paths

Binary files and ignored build directories are not modified. Intentional references to the upstream template, `kaleigh-dem/cookiecutter-agentic-webapp`, are preserved only in attribution, generator metadata, tests of that metadata, and `workspace.template.json`.

Applications omitted from `--applications` are removed from `apps/`, their root TypeScript project references are removed, and container builds are scoped to the selected applications.

## Validation rules

Initialization fails before writing files when options are invalid or incompatible:

- slugs must be lowercase kebab case; package scopes must be lowercase npm scopes
- repository owners and CODEOWNERS must use valid GitHub or email forms
- ports must be unique integers from 1 through 65535
- database names must use lowercase letters, numbers, and underscores
- authentication requires the API; session authentication also requires the web application
- a configured worker transport requires the worker application, and a selected worker requires a transport
- optional AI capabilities require both web and API applications

Lists are trimmed, deduplicated, and written in stable order. The manifest contains no timestamps or machine-specific paths.

`pnpm template:identity:check` scans the entire initialized repository and fails when it finds the upstream package scope, service slug, snake/camel/Pascal identity forms, or the original personal CODEOWNER outside the approved upstream metadata allowlist. CI runs initialization twice in a copied workspace, compares all text files, executes this detector, and validates Nx synchronization without changing the source checkout.
