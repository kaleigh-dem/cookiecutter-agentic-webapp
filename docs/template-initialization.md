# Template initialization

The `init` Nx generator captures the choices that distinguish one generated application repository from another. Run it once after creating or cloning a workspace, and rerun it with the same options to verify deterministic output.

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

## Generated initialization contract

The generator writes `workspace.template.json` as the canonical, versioned record of initialization choices. The manifest contains:

- application slug, display name, and npm package scope
- repository owner and normalized CODEOWNERS
- selected `web`, `api`, and `worker` applications
- web, API, and database ports plus the database name
- authentication, worker transport, telemetry, deployment, and optional AI profiles

The generator also applies the choices that have stable ownership in this phase:

- updates the root package name
- scopes the production container-build command to the selected applications
- regenerates `.github/CODEOWNERS`
- updates local web, API, database, and telemetry defaults in `.env.example`

Repository-wide replacement of template identity, service names, image names, and custom TypeScript conditions remains P10-04. Application selection is recorded now so that P10-04 can apply it consistently across source, delivery, and documentation surfaces without asking for another set of inputs.

## Validation rules

Initialization fails before writing files when options are invalid or incompatible:

- slugs must be lowercase kebab case; package scopes must be lowercase npm scopes
- repository owners and CODEOWNERS must use valid GitHub or email forms
- ports must be unique integers from 1 through 65535
- database names must use lowercase letters, numbers, and underscores
- authentication requires the API; session authentication also requires the web application
- a configured worker transport requires the worker application, and a selected worker requires a transport
- optional AI capabilities require both web and API applications

Lists are trimmed, deduplicated, and written in stable order. The manifest contains no timestamps or machine-specific paths. Unit tests snapshot the normalized contract, and CI runs the generator twice in a copied workspace to prove byte-for-byte deterministic output and a clean source checkout.
