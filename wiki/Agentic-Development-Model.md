# Agentic Development Model

This page explains the template's primary design goal: provide a durable web-application foundation that AI and coding agents can understand, extend, validate, and upgrade safely under human ownership.

## The core thesis

This is not only a full-stack starter. It is a repository operating model for projects in which a substantial share of implementation work may be performed by AI agents.

An agent-compatible repository must make the correct path easier to discover than an incorrect one. It needs explicit context, deterministic structure, enforceable boundaries, fast feedback, and reviewable evidence. The template provides those controls so an agent does not have to infer the architecture from folder names or imitate nearby code blindly.

> **Agentic-compatible development is different from an AI-enabled product.** Every generated workspace includes the agent-facing repository structure described here. The optional `--ai=true` profile records product intent to add AI features; it does not enable agentic development and does not add a model provider.

## What agentic-compatible means here

| Need                         | Repository mechanism                                                                             | Why it matters for agents                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Discover the rules           | Root and nested `AGENTS.md` files                                                                | Instructions become more specific near the code being changed.                                              |
| Understand the system        | Nx project graph, `project.json`, tags, and public package entry points                          | Agents can inspect ownership and dependencies instead of relying on folder proximity.                       |
| Query workspace structure    | `.mcp.json` with the Nx MCP server                                                               | Compatible agent clients can ask Nx for project and graph context through a machine-readable interface.     |
| Create approved structure    | Local domain, feature, job, and contract generators                                              | Repeated code starts with correct tags, tests, exports, references, README files, and local agent guidance. |
| Prevent architectural drift  | ESLint module-boundary rules, runtime tags, TypeScript references, and generated-contract checks | Invalid imports and duplicated transport types fail mechanically.                                           |
| Iterate efficiently          | Focused Nx targets, caching, and affected-only validation                                        | Agents receive a smaller, faster feedback loop while working.                                               |
| Prove repository health      | `pnpm check`, preview smoke, performance budgets, supply-chain policy, and production gates      | A completed task has executable evidence rather than a verbal claim that it works.                          |
| Preserve long-lived projects | Versioned template provenance, ownership-aware upgrades, and immutable release evidence          | Generated products can adopt template improvements without treating every file as replaceable.              |

These mechanisms support human developers too. The design principle is that repository knowledge should be explicit and executable enough for a capable contributor who has no prior conversation history.

## Standard agent workflow

Use this sequence for application changes, whether the work is performed by a human, an agent, or both.

### 1. Read the instruction hierarchy

From the workspace root:

```bash
cat AGENTS.md
find apps packages tools -name AGENTS.md -print
```

Read the root file and the closest nested `AGENTS.md` for every area you expect to change. Nested guidance supplements the root rules; it does not replace them.

### 2. Inspect the target projects

```bash
pnpm nx show projects
pnpm nx show project <PROJECT_NAME>
pnpm graph
```

Identify the owning project, public entry point, direct dependencies, dependents, tags, and relevant targets before editing.

An agent client that supports Model Context Protocol can use the checked-in `.mcp.json`, which starts the Nx MCP server with:

```bash
pnpm nx mcp
```

The MCP integration is an additional discovery path, not a replacement for repository rules or validation.

### 3. Locate the source of truth

Determine which artifact owns the behavior:

- HTTP shapes: `packages/contracts/openapi/source`
- asynchronous payloads: versioned schemas in `packages/contracts/src`
- domain rules and use cases: `packages/backend/*`
- browser feature behavior: `packages/web/features/*`
- PostgreSQL adapters and migrations: `packages/database`
- application composition: `apps/*`
- environment contracts: configuration packages and `infra/environments`
- architectural decisions: `docs/adr`

Do not edit generated outputs, duplicate contracts, or place reusable behavior in an application composition root.

### 4. Generate repeated structure

Use the local generators when creating a domain, browser feature, worker job, or shared contract:

```bash
pnpm generate:domain <DOMAIN_NAME>
pnpm generate:feature <FEATURE_NAME>
pnpm generate:job <JOB_NAME> --queue=<QUEUE_NAME>
pnpm generate:contract <CONTRACT_NAME>
```

The generated code is a starting contract, not finished product behavior. Replace placeholders, add the required adapters, and validate the resulting architecture.

### 5. Make the smallest coherent change

Keep the task scoped to one behavior or boundary. Prefer public package APIs, explicit dependency injection, versioned contracts, and tests at the lowest effective layer.

Do not weaken a boundary, suppress a validation rule, or broaden a vulnerability exception solely to make an automated task pass.

### 6. Run focused feedback

```bash
pnpm nx run <PROJECT_NAME>:typecheck
pnpm nx run <PROJECT_NAME>:test
pnpm nx run <PROJECT_NAME>:build
pnpm affected
```

Use focused commands during iteration. Run contract, database, authentication, worker, preview, or delivery checks when the changed boundary requires them.

### 7. Run the repository contract

Before handoff:

```bash
pnpm format
pnpm check
pnpm template:identity:check
git status --short
```

Review generated changes and confirm validation leaves the working tree clean.

### 8. Produce a reviewable handoff

The pull request or human handoff should state:

- the user-visible or operational behavior changed;
- the projects and architectural boundaries affected;
- generated files or migrations introduced;
- focused and full validation run;
- production replacement points, risks, or manual follow-up;
- documentation or decisions updated.

An agent's completion message is not evidence by itself. Review the diff and the recorded command results.

## Human and agent responsibilities

Agents can perform substantial implementation work, including repository exploration, generation, coding, testing, documentation, migration drafting, and release-evidence inspection. Human owners remain accountable for decisions that require authority, organizational context, or risk acceptance.

| Agents can prepare or execute                    | Humans must own or explicitly approve                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| Explore the graph and instructions               | Product intent and acceptance criteria                                       |
| Generate approved project structures             | Architecture exceptions and boundary changes                                 |
| Implement and test scoped changes                | Access control, data classification, and privacy decisions                   |
| Draft migrations and run them on disposable data | Production migration timing, backup evidence, and destructive data decisions |
| Identify vulnerability findings                  | Vulnerability risk acceptance and exception ownership                        |
| Build and verify release evidence                | Production environment approval and deployment authorization                 |
| Draft rollback or incident steps                 | Incident command, customer communication, and business continuity decisions  |

Do not give an agent long-lived production credentials merely to make the workflow more autonomous. Use least-privilege repository access, short-lived workload identity, protected environments, and human approval gates.

## Keeping a generated project agent-compatible

As the product grows:

1. Keep root and nested `AGENTS.md` files current and concise.
2. Add an ADR when architecture or dependency direction changes.
3. Add or extend a local generator when a structure will be repeated.
4. Keep package public APIs narrow; avoid cross-project deep imports.
5. Preserve project tags and executable boundary rules.
6. Keep commands at the repository root stable and documented.
7. Ensure generated outputs have drift checks rather than manual editing instructions.
8. Add focused tests and observable verification for new infrastructure behavior.
9. Keep secrets and production authority outside agent-readable source files.
10. Upgrade the template regularly and commit upgrades separately from product work.

## Common anti-patterns

- Treating nearby code as the only specification.
- Asking an agent to create a new slice by copying directories manually.
- Putting business logic directly in Next.js routes, NestJS controllers, or worker bootstrap code.
- Duplicating request, response, or event types outside the contract source.
- Weakening lint, security, performance, or production policy to get a green check.
- Allowing generated files to change during validation without reviewing and committing them.
- Mixing template upgrades with unrelated feature work.
- Equating `--ai=true` with repository agent readiness.
- Equating agent-generated code with human-approved production readiness.

## What the template does not provide

The template does not bundle a coding-agent service, choose an LLM, manage prompts for product features, grant agents repository or cloud access, or make autonomous production decisions. Adopting teams select their agent tools and access model while preserving the repository contracts described here.

## Related pages

- [Repository Tour](Repository-Tour)
- [Everyday Development](Everyday-Development)
- [Code Generation](Code-Generation)
- [Architecture](Architecture)
- [Validation and Testing](Validation-and-Testing)
- [Repository and GitHub Setup](Repository-and-GitHub-Setup)

## Next steps

1. [Quick Start](Quick-Start)
2. [Repository Tour](Repository-Tour)
3. [Everyday Development](Everyday-Development)

[Back to Home](Home)
