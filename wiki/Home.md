# SteadyStack

SteadyStack is a production-minded TypeScript web-application template designed to become the foundation for many different products that are built and maintained substantially by AI and coding agents under human ownership.

The workspace includes a Next.js web application, NestJS API, PostgreSQL-backed worker, shared contracts, validated configuration, deterministic generators, and production-shaped delivery controls in one Nx monorepo. Its defining goal is not simply to provide these technologies together. It is to make the repository legible, constrained, and verifiable enough that an agent can enter with no prior conversation history, find the correct change boundary, create approved structure, receive fast feedback, and produce a reviewable handoff.

> **Important:** Agentic-compatible development is a repository operating model, not an AI feature in the product. The optional `--ai=true` profile records product intent to add AI capabilities; it is unrelated to whether coding agents can work effectively in the repository.

> **Production warning:** A generated workspace that starts locally, passes validation, or was largely implemented by agents is **not automatically production-ready**. The adopting team must still own identity-provider integration, production data services, secrets, telemetry, deployment infrastructure, risk acceptance, rollback, disaster recovery, and operational support.

## Primary design goal

The template makes the preferred engineering path explicit and executable:

- layered `AGENTS.md` files tell contributors and agents which rules apply near the code;
- the Nx project graph and project tags expose ownership and dependency direction;
- `.mcp.json` makes Nx workspace context available to compatible agent clients;
- local generators create domains, features, jobs, and contracts with approved structure;
- ESLint, TypeScript, generated-contract checks, and project references enforce boundaries;
- focused Nx targets and affected commands provide fast iteration;
- `pnpm check`, preview validation, production gates, and release evidence provide objective completion criteria;
- versioned template provenance and ownership-aware upgrades support long-lived generated projects.

Read [Agentic Development Model](Agentic-Development-Model) before establishing an agent-led workflow.

## What the platform includes

### Agent-facing repository controls

- Root and subsystem-specific `AGENTS.md` guidance.
- Nx project graph, caching, affected commands, architectural tags, and MCP configuration.
- Deterministic workspace initialization and local structural generators.
- Stable root commands for formatting, testing, validation, preview, and upgrades.
- Generated contracts with drift and compatibility checks.
- Versioned template provenance, migration tooling, and file-ownership policy.

### Application and operational foundation

- A Next.js App Router web application.
- A NestJS HTTP API with generated runtime contract enforcement.
- A Node.js worker that consumes a PostgreSQL transactional outbox.
- Framework-free Agent Task and rate-limit libraries.
- Shared UI, contracts, PostgreSQL migrations, environment validation, and observability.
- Production OCI image builds, a local preview stack, smoke tests, performance budgets, SBOMs, vulnerability policy, signatures, attestations, immutable release manifests, and production configuration validation.

## What it does not include

The template does not provide:

- a hosted coding-agent service, an LLM choice, or an autonomous production operator;
- organization-specific agent credentials or permission policy;
- an organization-specific cloud deployment or Kubernetes manifests;
- identity-provider login, callback, and logout implementation;
- a production session store or Redis worker adapter;
- a model-provider integration, prompt system, or AI evaluation framework;
- production backups, DNS/TLS, dashboards, alert routing, or incident ownership.

Supported profiles can record some product or platform directions without implementing them.

## Start here

1. [Understand the Agentic Development Model](Agentic-Development-Model), including the standard agent workflow and human approval boundaries.
2. [Choose workspace profiles](Choosing-Workspace-Profiles) for applications, authentication, worker delivery, telemetry, deployment, and optional product AI intent.
3. [Complete the Quick Start](Quick-Start) to create, initialize, map, run, and validate a local workspace.
4. [Tour the repository](Repository-Tour) and inspect its Nx project graph.
5. [Learn everyday development](Everyday-Development), [code generation](Code-Generation), and [validation](Validation-and-Testing).
6. Review [Production Readiness](Production-Readiness) before connecting shared or production environments.

## Current roadmap status

Roadmap status is mirrored from the repository's authoritative [`docs/TODO.md`](https://github.com/kaleigh-dem/steady-stack/blob/main/docs/TODO.md); the wiki does not maintain an independent task ledger.

Current Phase 13 status:

- **P13-01 — complete:** image and dependency supply-chain artifacts, reviewed in PR #50.
- **P13-02 — complete:** immutable digest publication and promotion, merged in PR #52 and hardened in PR #53.
- **P13-03 — complete:** CI cancellation, BuildKit cache reuse, and retained failure diagnostics, merged in PR #55.
- **P13-04 — complete:** Nx cache-input auditing and affected execution, merged in PR #59.
- **P13-05 — next:** documentation integrity checks.
- **P13-06 — planned:** release metadata and rollback-evidence validation.

Use `docs/TODO.md` for sequencing, acceptance criteria, and future status changes.

## SteadyStack identity

PR #61 established the SteadyStack public identity across the repository, package scope, plugin, upgrade executable, release artifact, generated-workspace provenance, workflows, and documentation. New workspaces use `kaleigh-dem/steady-stack`, while existing generated products retain their own application identity.

See [SteadyStack Identity Migration](SteadyStack-Identity-Migration) for canonical names, upgrade steps, compatibility boundaries, and external integration checks.

## Common tasks

| Task                                                    | Page                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------- |
| Establish an agent-led development workflow             | [Agentic Development Model](Agentic-Development-Model)                     |
| Create and run a workspace                              | [Quick Start](Quick-Start)                                                 |
| Select initialization profiles                          | [Choosing Workspace Profiles](Choosing-Workspace-Profiles)                 |
| Understand apps, packages, and agent instructions       | [Repository Tour](Repository-Tour)                                         |
| Run focused and affected development commands           | [Everyday Development](Everyday-Development)                               |
| Generate domains, features, jobs, and contracts         | [Code Generation](Code-Generation)                                         |
| Understand the executable architecture                  | [Architecture](Architecture)                                               |
| Configure identity                                      | [Authentication and Authorization](Authentication-and-Authorization)       |
| Manage PostgreSQL and migrations                        | [Database and Data Management](Database-and-Data-Management)               |
| Operate background jobs                                 | [Worker and Background Jobs](Worker-and-Background-Jobs)                   |
| Understand `pnpm check` and agent feedback loops        | [Validation and Testing](Validation-and-Testing)                           |
| Diagnose retained CI failure evidence                   | [CI Diagnostics](CI-Diagnostics)                                           |
| Build and test production-shaped images                 | [Containers and Preview Environments](Containers-and-Preview-Environments) |
| Verify image SBOMs, scans, signatures, and attestations | [Image Supply Chain](Image-Supply-Chain)                                   |
| Configure repository controls and agent permissions     | [Repository and GitHub Setup](Repository-and-GitHub-Setup)                 |
| Migrate to the SteadyStack public identity              | [SteadyStack Identity Migration](SteadyStack-Identity-Migration)           |
| Prepare for launch                                      | [Production Readiness](Production-Readiness)                               |
| Upgrade a generated repository                          | [Releases and Upgrades](Releases-and-Upgrades)                             |
| Diagnose a failure                                      | [Troubleshooting](Troubleshooting)                                         |

## By role

### Evaluating the template

Read [Agentic Development Model](Agentic-Development-Model), [Architecture](Architecture), [Repository Tour](Repository-Tour), and [Choosing Workspace Profiles](Choosing-Workspace-Profiles).

### Creating an agent-led product workspace

Follow [Quick Start](Quick-Start), customize the root and nested agent guidance for the product, then complete [Repository and GitHub Setup](Repository-and-GitHub-Setup).

### Developing applications

Use [Everyday Development](Everyday-Development), [Code Generation](Code-Generation), [Validation and Testing](Validation-and-Testing), and the root plus closest nested `AGENTS.md` files.

### Configuring infrastructure

Use [Authentication and Authorization](Authentication-and-Authorization), [Database and Data Management](Database-and-Data-Management), [Containers and Preview Environments](Containers-and-Preview-Environments), [Image Supply Chain](Image-Supply-Chain), and [Production Readiness](Production-Readiness).

### Operating production

Use [Worker and Background Jobs](Worker-and-Background-Jobs), [Image Supply Chain](Image-Supply-Chain), [Production Readiness](Production-Readiness), [Releases and Upgrades](Releases-and-Upgrades), and [Troubleshooting](Troubleshooting). Agents may prepare evidence and draft procedures; accountable operators approve and execute production decisions.

## Agent and human operating model

```mermaid
flowchart LR
  Intent[Human intent and acceptance criteria] --> Agent[Human or AI implementation agent]
  Agent --> Context[AGENTS.md + Nx graph + ADRs + contracts]
  Context --> Change[Generators + scoped code changes]
  Change --> Feedback[Focused Nx targets + affected checks]
  Feedback --> Contract[pnpm check + preview + release evidence]
  Contract --> Review[Human review and approval]
  Review --> Product[Generated product repository]
```

The repository supplies the context and guardrails. Agents can explore, generate, implement, test, and prepare evidence. Humans remain responsible for product intent, architecture exceptions, access policy, production risk, and operational approval.

## Application system overview

```mermaid
flowchart LR
  Browser[Browser] --> Web[Next.js web]
  Web -->|Bearer access token| API[NestJS API]
  API --> Contracts[Generated runtime contracts]
  API --> Domain[Framework-free domain]
  Domain --> DB[(PostgreSQL)]
  DB --> Outbox[Transactional outbox]
  Outbox --> Worker[Node.js worker]
  Worker --> Domain
  API --> RateLimit[PostgreSQL rate limits]
  Web --> Telemetry[OTLP telemetry]
  API --> Telemetry
  Worker --> Telemetry
```

The web application obtains an access token through the configured browser authentication adapter and calls the API through generated client code. The API validates transport contracts, authenticates and authorizes the request, executes framework-free application behavior, and writes application data plus outbox events transactionally. The worker leases outbox records, executes handlers at least once, and uses fencing and idempotency to make duplicate or stale delivery safe.

## Source of truth

The wiki reorganizes end-user guidance from the repository implementation and maintained documentation. When a wiki statement conflicts with code, use the implementation and open a documentation correction. The [Documentation Audit](Documentation-Audit) records command verification, source mapping, discrepancies, and known gaps.

## Next steps

1. [Agentic Development Model](Agentic-Development-Model)
2. [Choosing Workspace Profiles](Choosing-Workspace-Profiles)
3. [Quick Start](Quick-Start)
