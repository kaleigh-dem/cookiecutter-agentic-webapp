# Scheduled Development Workflow

This document is the durable protocol for the automated development loop. Scheduled prompts should identify their role, cadence, safety boundaries, current counterpart IDs, and instruct the agent to read this file. GitHub and the repository are authoritative; chat history is not.

## Source of truth

Use current data in this order:

1. GitHub pull-request metadata, exact head SHA, review threads, comments, and checks.
2. `docs/TODO.md`, applicable `AGENTS.md` files, ADRs, and repository code.
3. Current scheduled-task status and only the latest compact handoff.

Never copy old chat history forward. Ignore superseded PR heads, resolved findings, and handoffs whose `PR + HEAD + ACTION` key has already been handled.

## Roles

### Scheduled Developer

- Runs in ChatGPT using GPT-5.6 Sol with High reasoning and the GitHub plugin when practical.
- Implements one active TODO or fixes one existing PR. It never reviews, approves, or merges its own work.
- Does not begin another TODO while a PR or requested fix is active.
- After pushing a ready PR or fix head, wakes the current reviewer immediately. Its Daily schedule is only a fallback.

### Scheduled PR Reviewer

- Runs in local Codex using GPT-5.6 Luna with Extra High reasoning and the real repository checkout.
- Reviews the exact handed-off head, runs proportionate local validation, comments on blockers, verifies fixes, resolves addressed threads, merges clear PRs, and cleans up merged branches.
- Never implements product fixes. Because the authenticated reviewer can also be the PR author, use inline or top-level comments rather than `REQUEST_CHANGES` when GitHub rejects that review state.
- After blockers or a merge, wakes the current developer immediately. Its two-hour schedule is only a fallback.

### Scheduled Activity Supervisor

- Runs as a standalone local Codex scheduled task every 30 minutes using GPT-5.6 Luna with High reasoning.
- Reconstructs state from GitHub, this document, `docs/TODO.md`, and task status on every run.
- Never develops, reviews code, approves, or merges.
- Repairs missing handoffs, failed or drifted schedules, terminal conversations, duplicate schedules, and stalled state transitions. It must not interrupt an agent that is genuinely using tools or generating output.
- Remains completely silent when the workflow is healthy and unchanged.

## State flow

`developer work -> ready PR/fix head -> reviewer -> blockers or merge -> developer`

Immediate reciprocal handoffs are the primary trigger. Fixed schedules are independent safety nets and must not be dynamically changed during a review cycle.

## Compact handoffs

Every handoff is at most 12 lines and 900 characters. Fetch all detail from GitHub; never paste full comment bodies, diffs, logs, TODO sections, or blocker explanations when IDs and locations are enough.

Ready or re-review:

```text
TYPE: RE_REVIEW
PR: 27
HEAD: abc123
CHECKS: green; targeted command names only
ACTION: review exact head now
```

Fix required:

```text
TYPE: FIX_REQUIRED
PR: 27
HEAD: abc123
REVIEW: 4840251348
COMMENTS: 3703371561 file:line; 3703371569 file:line
CHECKS: relevant status only
ACTION: fetch comments, fix this PR, validate, push, wake reviewer
```

Merged:

```text
TYPE: MERGED
PR: 27
HEAD: abc123
MERGE: def456
EVIDENCE: docs/TODO.md phase/task record
ACTION: take next eligible TODO
```

Include only pass/fail, command names, and the relevant failure location for validation. A new head SHA is a new state. Before sending, inspect the recipient's latest messages and do nothing if the same `PR + HEAD + ACTION` was already delivered.

## Review and development gates

- The reviewer works only on an open, non-draft PR targeting `main` and the exact handed-off SHA; the developer may start one new branch only after a merge handoff authorizes the next eligible TODO.
- Never merge a draft, conflicted PR, changed SHA, unresolved blocker, or failing/pending required check.
- Mark a TODO item complete only after implementation, tests, documentation, and applicable CI pass.
- A phase is complete only after its goal and every exit criterion have explicit validation, documentation, and merged-main evidence.
- Never carry findings from an older head into a new review without verifying that they still apply.

## Phase record and paired rotation

When the last task in a phase merges, add one concise phase gate record to `docs/TODO.md`. It must contain the phase, date, goal result, exit-criteria result, validation references, documentation status, and merged PR/commit evidence. Do not carry prior task-level detail into the next phase.

Then emit this compact checkpoint:

```text
TYPE: PHASE_COMPLETE
PHASE: P12
GOAL: pass
EXIT_CRITERIA: pass
EVIDENCE: docs/TODO.md; PR/merge SHA
ACTION: ROTATE_BOTH
```

The supervisor rotates the developer and reviewer together before the next phase:

1. Capture only phase/task, open PR, exact SHA, unresolved review IDs, checks, and next action.
2. Create one fresh ChatGPT developer chat named `Scheduled Developer - Phase <N>`, GPT-5.6 Sol/High, with one Daily fallback task.
3. Create one fresh local Codex reviewer task named `Scheduled PR Reviewer - Phase <N>`, GPT-5.6 Luna/Extra High, with one two-hour fallback heartbeat.
4. Update the supervisor and both role prompts with the new counterpart IDs before sending the checkpoint.
5. Verify both replacements accept the checkpoint, then disable/delete the old schedules and rename/archive the old chats.
6. Verify exactly one active developer schedule, one reviewer schedule, and one standalone supervisor remain.

If a conversation reports a maximum-length warning, `ROTATION_REQUIRED`, or cannot accept a prompt, treat it as terminal and perform the same paired rotation immediately. Do not retry the terminal chat. If any rotation step fails, stop retries and notify the user with the exact failed step.

## Supervisor repair rules

- Determine the expected owner from the open PR, exact SHA, unresolved review state, and latest deduplicated handoff.
- Wake an idle reviewer when a ready/fix head lacks exact-head review action.
- Wake an idle developer when current blockers or a merge lack a delivered handoff.
- If an agent only acknowledges, adjusts scheduling, or stops before its required role result, send one compact corrective wake.
- Treat an unchanged state as stalled only after two supervisor intervals and only after confirming the expected owner is not genuinely active.
- Correct prompt or schedule drift without replacing healthy tasks. Never create duplicate active schedules.
- Notify the user only when intervention occurred, repair failed, or the workflow remains stalled.

## Completion

When every TODO and phase gate is complete and no related PR remains open, stop all three scheduled tasks. If a platform limitation prevents stopping one, reduce it to monthly verification and prohibit new work unless `docs/TODO.md` receives an explicitly added task.
