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
- In ChatGPT, publish through the authorized GitHub plugin/connector. A missing local `gh` binary or local `gh` authentication is not a blocker because the Mac and ChatGPT environments are separate. Block only after the connector itself fails for a required permission or unsupported operation.
- When Docker or an OS-level runner feature is unavailable, preserve all completed validation, document the unavailable gate in the PR, and rely on exact-head CI for that gate instead of withholding publication.

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

GitHub is the durable handoff queue. Direct reciprocal messages are an acceleration only; failure to deliver a direct wake never invalidates a matching GitHub handoff. Fixed schedules are independent safety nets and must not be dynamically changed during a review cycle.

## Compact handoffs

Every handoff is at most 12 lines and 900 characters. Fetch all detail from GitHub; never paste full comment bodies, diffs, logs, TODO sections, or blocker explanations when IDs and locations are enough.

Ready or re-review is always posted as one top-level PR comment:

```text
[reviewer-handoff]
TYPE: RE_REVIEW
PR: 27
HEAD: abc123
CHECKS: GREEN; targeted command names only
ACTION: REVIEW_EXACT_HEAD
```

Use `TYPE: REVIEW_READY` for the first review of a new PR and `TYPE: RE_REVIEW` after fixes. These are the only valid developer-to-reviewer types, and `REVIEW_EXACT_HEAD` is the only valid action. After posting, a direct wake may include the PR number, exact head, and source comment ID, but the GitHub comment remains authoritative.

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

### Handoff consumption

On every direct wake and reviewer heartbeat, scan open non-draft PR comments for the newest unconsumed `[reviewer-handoff]`. A handoff is actionable when its type and action are allowed, its PR is open and targets `main`, and its full `HEAD` equals the current PR head. A direct chat message is not required.

Before deep review, acknowledge the source comment with one top-level PR comment:

```text
[handoff-accepted]
SOURCE: 5165863418
HEAD: abc123
ACTION: REVIEW_STARTED
```

Deduplicate consumption by `SOURCE + HEAD + ACTION`. An acknowledgement for an older head does not consume a newer handoff. If a handoff has an unknown type or action, do not silently ignore it: report the invalid field compactly so the developer or supervisor can correct the existing comment.

The supervisor checks for any valid `[reviewer-handoff]` older than 10 minutes without a matching `[handoff-accepted]` or exact-head review action. It immediately wakes the idle reviewer with the source comment ID. If no acknowledgement or review exists after two supervisor intervals, it repairs the reviewer prompt and notifies the user.

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
- When the ChatGPT developer reports missing `gh`, redirect it to the authorized GitHub connector immediately; do not ask to install or authenticate a Mac-local CLI for a cloud environment.
- Notify the user only when intervention occurred, repair failed, or the workflow remains stalled.

## Completion

When every TODO and phase gate is complete and no related PR remains open, stop all three scheduled tasks. If a platform limitation prevents stopping one, reduce it to monthly verification and prohibit new work unless `docs/TODO.md` receives an explicitly added task.
