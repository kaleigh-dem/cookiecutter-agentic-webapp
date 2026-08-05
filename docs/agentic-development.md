# Agentic development model

This template is designed to become the foundation for many web applications that are built and maintained substantially by AI and coding agents under human ownership.

Agentic compatibility is a repository property. It means a capable contributor with no prior conversation history can discover the rules, understand the project graph, create approved structure, receive fast feedback, and produce objective evidence for review. It does not mean the generated product includes an AI model provider or that agents receive autonomous production authority.

The optional initialization setting `ai=true` records product intent to add AI-powered application features. It is separate from the agentic development model; every generated workspace retains the repository controls described here.

## Repository control surfaces

| Surface                                                | Purpose                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Root and nested `AGENTS.md`                            | Layered instructions that become more specific near the code being changed.     |
| Nx project graph and `project.json`                    | Machine-readable ownership, tags, targets, dependencies, and affected analysis. |
| `.mcp.json`                                            | Starts the Nx MCP server for compatible agent clients.                          |
| Local workspace generators                             | Deterministic creation of approved domains, features, jobs, and contracts.      |
| ESLint boundaries and TypeScript references            | Executable dependency and runtime constraints.                                  |
| Contract generation and compatibility checks           | One source of truth for HTTP and asynchronous payloads.                         |
| Root package scripts                                   | Stable commands for focused work, repository validation, preview, and delivery. |
| `workspace.template.json` and upgrade ownership policy | Provenance and safe evolution of generated projects.                            |
| ADRs, runbooks, and environment contracts              | Durable design and operational context outside transient conversations.         |

## Standard workflow

1. Read the root `AGENTS.md` and the closest nested instruction files.
2. Inspect the target project and graph:

   ```bash
   pnpm nx show project <PROJECT_NAME>
   pnpm graph
   ```

3. Identify the source of truth for contracts, domain behavior, persistence, configuration, or application composition.
4. Use the local generator when creating repeated structure:

   ```bash
   pnpm generate:domain <DOMAIN_NAME>
   pnpm generate:feature <FEATURE_NAME>
   pnpm generate:job <JOB_NAME> --queue=<QUEUE_NAME>
   pnpm generate:contract <CONTRACT_NAME>
   ```

5. Make the smallest coherent change through public package entry points.
6. Run focused targets and affected validation during iteration.
7. Run the full repository contract before handoff:

   ```bash
   pnpm format
   pnpm check
   pnpm template:identity:check
   git status --short
   ```

8. Provide a reviewable summary of behavior, projects, boundaries, migrations or generated files, validation, risks, and remaining human decisions.

Compatible agent clients can use the checked-in MCP configuration, which runs:

```bash
pnpm nx mcp
```

MCP is an additional discovery interface. It does not replace repository instructions, source-of-truth documents, or validation.

## Human approval boundaries

Agents can explore, generate, implement, test, document, draft migrations, and inspect release evidence. Accountable humans retain decisions that require authority, organizational context, or risk acceptance, including:

- product intent and acceptance criteria;
- architecture exceptions and weakened controls;
- repository, secret, database, and cloud access;
- data classification, privacy, and retention;
- vulnerability exceptions;
- destructive production migrations;
- environment promotion, deployment, rollback, and incident command.

Do not give an agent long-lived production credentials merely to increase autonomy. Use least privilege, short-lived credentials, protected environments, required review, and auditable approval gates.

## Maintaining compatibility as the product grows

- Keep root and nested `AGENTS.md` current and scoped.
- Add an ADR when architecture or dependency direction changes.
- Extend local generators when a pattern will be repeated.
- Keep public package APIs narrow and prohibit cross-project deep imports.
- Preserve project tags and executable boundary rules.
- Keep root commands stable and documented.
- Generate repeated artifacts from authoritative sources and check drift.
- Add focused tests and observable verification for new behavior.
- Keep secrets and production authority outside source-controlled agent context.
- Apply template upgrades separately from product changes.

## Anti-patterns

- Treating nearby code or a prior chat as the only specification.
- Asking agents to copy project directories manually.
- Putting reusable product logic in routes, controllers, or process bootstrap files.
- Duplicating request, response, or event types outside contract sources.
- Disabling lint, security, performance, or production policy to get a green result.
- Accepting an agent completion statement without reviewing the diff and command evidence.
- Equating `ai=true` with development-time agent compatibility.
- Equating agent-generated code with production approval.

See `README.md`, `AGENTS.md`, `docs/architecture/overview.md`, `tools/workspace-plugin/README.md`, and the generated-project checklist for the concrete repository contracts.
