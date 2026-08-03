# Automated Development and Local Review Workflow

This document is the durable protocol for the low-Codex-credit development loop. GitHub and the repository are authoritative; chat history is not. ChatGPT performs development work, deterministic CI proves broad correctness, a local Python bridge performs routing and state management, and Codex is invoked only for a focused exact-head local review.

## Source of truth

Use current data in this order:

1. GitHub pull-request metadata, exact head SHA, review threads, comments, labels, and workflow results.
2. `docs/TODO.md`, applicable `AGENTS.md` files, ADRs, and repository code.
3. The local bridge SQLite state and only the latest compact handoff.
4. Chat history only as advisory context.

Never copy old chat history forward. Ignore superseded PR heads, resolved findings, and handoffs whose `SOURCE + HEAD + ACTION` key has already been consumed in GitHub or the bridge state store.

## Roles

### ChatGPT Scheduled Developer

- Runs in ChatGPT using the strongest practical reasoning level and the authorized GitHub connector.
- Implements one active TODO task or fixes one existing PR. It never reviews, approves, or merges its own work.
- Does not begin another TODO while a PR or requested fix is active.
- Reads `AGENTS.md`, `docs/TODO.md`, relevant ADRs, the active PR, review threads, and exact-head workflow results before changing code.
- Publishes through the GitHub connector. Missing Mac-local `gh` or Codex authentication is not a blocker for the ChatGPT environment.
- When Docker or another OS-level feature is unavailable, preserves completed validation, documents the unavailable gate in the PR, and relies on exact-head CI for that gate.
- After a ready head or fix is pushed and all required workflows pass, posts one valid `[reviewer-handoff]` comment.
- An hourly scheduled run may monitor for new `CHANGES_REQUIRED` results or the next eligible TODO. Direct chat wakes are optional acceleration only.

### Local Python Review Bridge

- Runs on the trusted local development machine continuously or on demand.
- Polls GitHub or receives a future webhook; it does not use a model for monitoring, deduplication, scheduling, or state reconstruction.
- Consumes only the newest valid unconsumed `[reviewer-handoff]` for each PR.
- Deduplicates by `SOURCE + HEAD + ACTION` in GitHub and SQLite.
- Verifies that the PR is open, non-draft, targets `main`, is conflict-free, and still points to the full handed-off SHA.
- Verifies that configured required workflows passed for that exact SHA.
- Accepts only named verification profiles from local configuration. A PR comment can never provide a shell command.
- Creates a disposable detached Git worktree at the exact SHA.
- Runs allowlisted deterministic commands as argument arrays without a shell.
- Invokes Codex only after deterministic local validation passes.
- Posts structured PASS, CHANGES_REQUIRED, or REVIEW_ERROR results to GitHub.
- Removes the worktree after success or failure and retains only compact local state and logs.
- Does not implement product fixes.
- Does not merge unless automatic merging is explicitly enabled and every exact-head merge gate passes.

### Local Codex Reviewer

- Is invoked on demand by the Python bridge through non-interactive `codex exec`; it has no polling heartbeat or supervisor schedule.
- Uses the real local worktree and reviews only the handed-off exact head.
- Runs proportionate additional functional checks rather than repeating the complete CI suite.
- Never implements fixes, broadens scope, or makes style-only recommendations.
- Returns schema-constrained PASS or FAIL output with reproducible findings.
- Leaves tracked files unchanged. A tracked-file modification converts the result to failure.

### Human Operator

- Authenticates `gh` and Codex on the trusted machine and maintains the local bridge configuration.
- Intervenes for credentials, product decisions, destructive actions, unsupported tooling, or failed bridge recovery.
- Keeps automatic merge disabled until several one-shot review cycles have behaved correctly.

## State flow

`ChatGPT development -> exact-head CI -> reviewer handoff -> Python validation -> local Codex review -> PASS or CHANGES_REQUIRED -> merge or ChatGPT fix`

GitHub is the durable handoff queue. A direct chat message is never required for correctness. The only recurring AI task should be the optional ChatGPT developer monitor; Python replaces reviewer heartbeats and the former AI supervisor.

## Compact reviewer handoffs

Every handoff is at most 12 lines and 900 characters. Fetch detail from GitHub; never paste diffs, logs, TODO sections, or full blocker explanations when IDs and locations are enough.

First review:

```text
[reviewer-handoff]
TYPE: REVIEW_READY
TASK: P12-05
PR: 36
HEAD: <full 40-character lowercase SHA>
VERIFY: delivery
CHECKS: GREEN
ACTION: REVIEW_EXACT_HEAD
```

Re-review after fixes:

```text
[reviewer-handoff]
TYPE: RE_REVIEW
TASK: P12-05
PR: 36
HEAD: <full 40-character lowercase SHA>
VERIFY: delivery
SOURCE: <prior review or blocker ID>
CHECKS: GREEN
ACTION: REVIEW_EXACT_HEAD
```

Rules:

- `REVIEW_READY` and `RE_REVIEW` are the only valid types.
- `REVIEW_EXACT_HEAD` is the only valid action.
- `TASK` uses the stable TODO task ID.
- `VERIFY` names a locally configured allowlisted profile such as `affected`, `delivery`, `security`, or `contracts`.
- `HEAD` must be the current full PR head SHA.
- A new SHA is a new review state.
- The bridge ignores old or already consumed handoffs and processes only the newest unconsumed valid handoff per PR.

## Handoff consumption

Before local work, the bridge posts:

```text
[handoff-accepted]
SOURCE: <handoff comment ID>
HEAD: <full SHA>
ACTION: REVIEW_STARTED
```

A source is considered consumed when GitHub contains a matching `[handoff-accepted]`, `[handoff-duplicate]`, or `[reviewer-result]` comment, or when SQLite already contains the same `SOURCE + HEAD + ACTION` key.

The bridge must re-check the PR head and required workflows after reading the handoff and again immediately before an automatic merge. An older acknowledgement never consumes a newer head.

Unknown types, actions, task IDs, SHA formats, or verification profiles fail closed. They do not invoke Codex.

## Verification profiles

Verification profiles live only in the trusted local bridge configuration. Each profile contains:

- a Codex profile name;
- a fixed ordered list of command argument arrays;
- optional `{BASE}` and `{HEAD}` placeholders replaced by the bridge;
- no shell interpolation, `eval`, or command text from GitHub.

Recommended initial profiles:

- `affected`: frozen install plus Nx affected lint, typecheck, test, and build;
- `delivery`: frozen install plus focused delivery tests;
- `security`: secret and license checks plus affected tests;
- `contracts`: contract generation and compatibility checks plus affected tests.

Broad exact-head GitHub workflows remain authoritative for full CI. The local profile should target the behavior that requires a real machine or independent execution.

## Reviewer results

Pass:

```text
[reviewer-result]
TYPE: PASS
TASK: P12-05
PR: 36
HEAD: <full SHA>
SOURCE: <handoff comment ID>
LOCAL_CHECKS: PASS
SUMMARY: <compact verification summary>
ACTION: MERGE_EXACT_HEAD
```

Changes required:

```text
[reviewer-result]
TYPE: CHANGES_REQUIRED
TASK: P12-05
PR: 36
HEAD: <full SHA>
SOURCE: <handoff comment ID>
ACTION: DEVELOPER_FIX_EXISTING_PR

FINDINGS:
- P1: concise title
  Reproduction: command or concrete steps
  Expected: expected behavior
  Actual: actual behavior
  File: relevant path
```

Bridge or environment failure:

```text
[reviewer-result]
TYPE: REVIEW_ERROR
TASK: P12-05
PR: 36
HEAD: <full SHA>
SOURCE: <handoff comment ID>
ERROR: concise operational failure
ACTION: USER_INSPECT_REVIEWER
```

A deterministic command failure is a review error and must not invoke Codex. The developer posts a new handoff only after repairing the branch or the operator repairs the local environment.

## Review and development gates

- Review only an open, non-draft PR targeting `main` at the exact handed-off SHA.
- Never merge a draft, conflicted PR, changed SHA, unresolved blocker, or failing or pending required workflow.
- Never carry findings from an older head into a new result without verifying they still apply.
- Mark a TODO task complete only after implementation, tests, documentation, applicable CI, and required local review pass.
- A phase is complete only after its goal and every exit criterion have explicit validation, documentation, and merged-main evidence.
- The ChatGPT developer starts the next task only after the active PR is merged or explicitly abandoned.

## Automatic merge

Automatic merge is disabled by default. Enable it only after at least three successful one-shot local review cycles.

Even when enabled, the bridge may merge only when:

1. Codex returned PASS for the exact current head.
2. Required workflows remain green for that head.
3. The PR remains open, non-draft, conflict-free, and mergeable.
4. The configured authorization label, for example `automation:merge`, is present.
5. GitHub accepts a squash merge with the reviewed SHA supplied as the expected head.

Keep final human merge approval for authentication, authorization, database migrations, secrets, destructive operations, production infrastructure, payments, financial logic, data deletion, and dependency trust-policy changes.

## Developer monitoring fallback

The optional hourly ChatGPT developer task reconstructs state from GitHub on every run. In priority order it:

1. fixes a new unconsumed `CHANGES_REQUIRED` result for the current head;
2. continues the single active unfinished development PR;
3. starts the next eligible TODO only when no development PR is active;
4. remains silent when no action is required.

It never depends on a direct message from Python and never treats chat history as authoritative.

## Phase records and chat rotation

When the last task in a phase merges, add one concise phase gate record to `docs/TODO.md` containing the phase, date, goal result, exit-criteria result, validation references, documentation status, and merged PR or commit evidence.

A developer chat may be rotated when it becomes long or terminal. The replacement starts by reading `AGENTS.md`, this document, `docs/TODO.md`, the active PR, and current GitHub handoffs. Reviewer continuity does not require a persistent Codex conversation because each review is an ephemeral exact-head run.

## Blocker routing and recovery

GitHub issue #33, `Automation control queue`, remains the durable queue for blockers that occur before a PR or cannot be represented as a PR review result.

Developer blocker:

```text
[scheduler-blocked]
TYPE: BLOCKED
TASK: P12-06
BASE: <full SHA>
PR: number or none
BRANCH: branch or none
CHECKS: compact pass/fail summary
BLOCKER: concise blocker
ACTION: UNBLOCK_AND_RESUME
```

Deduplicate by `TASK + BASE + PR + BRANCH + BLOCKER`. Tooling, access, and environment recovery may repair configuration or identify a safe alternate path but must not take over product implementation. Credentials, product decisions, destructive actions, and broader authority require the human operator.

The Python bridge reports its own operational failures as `REVIEW_ERROR`; it does not repeatedly spend Codex credits retrying the same source. After repair, create a new handoff comment or explicitly clear the failed local state.

## Completion

When every TODO and phase gate is complete and no related PR remains open:

- disable the ChatGPT developer monitoring task;
- stop the local Python bridge;
- retain the protocol, local configuration template, and state backup for future roadmap additions;
- do not create new work unless `docs/TODO.md` receives an explicit task.
