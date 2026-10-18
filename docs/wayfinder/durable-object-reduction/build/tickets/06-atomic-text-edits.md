---
title: "Commit text edits before acknowledging success"
type: task (AFK)
status: closed
assignee: dor-06
blocked_by: [05-owner-fencing]
builder: sol
phase: 2
---

## What

Stage text edits; commit durable drafts/receipt before publishing model/history changes or success. Serialize pending manual writes and validate their revisions. Reconcile lost responses; never automatically replay receiptless operations.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [browser recovery](../../tickets/06-define-browser-recovery.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/draft-store.ts`
- `src/drafts.ts`
- `src/guarded-edit/commit.ts`
- `src/editor-workspace.ts`
- `src/components/source-editor.ts`
- `tests/agent-text-commit.test.ts`

## Done when

- Unit tests plus existing `tests/guarded-edit.test.ts`: cancellation before commit applies nothing; after commit reports applied; reload finds matching drafts/receipt.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Current synchronous history APIs need a staged agent-only boundary; preserve manual typing behavior.

## Done (2026-10-17)

Behaviour: an agent's `write_file` (and `edit_file`) on an existing file now goes through a staged commit.
src/agent-site.ts `prepareAgentText` (lazy-loads src/agent-records.ts and src/agent-owner.ts; one owner per
workspace per tab at the stored generation) builds the identity: operation id = command id, authorization =
`grantId` (refused if missing), workspace = account/repository/branch, payload identity over operation, path,
branch, commit, expectedHash, args and the text's hash (never the text; a supplied `contentHash` must match).
src/guarded-edit/commit.ts fences the touched files (src/drafts.ts `fenceAgent`: pending manual writes are
flushed first, and manual writes queued meanwhile go straight to IndexedDB; src/draft-store.ts `flushTyping`
closes open typing steps), captures the workspace revision and whole draft records, then commits drafts +
receipt in one owner-fenced transaction. Only then does it publish to the draft model, history and preview
(`publishAgent`, no second write) and report success. A failed/unavailable transaction, revocation,
cancellation that won, stale revision or newer manual draft applies nothing and refuses with a plain reason
("Nothing was changed; your drafts are as they were."). A matching duplicate returns the recorded outcome
without reapplying; a reused id for different work is refused; a cancel after commit reports applied. Manual
typing, its persistence, per-file retry and BroadcastChannel are unchanged. New files (create) and structural
and media commands stay on the existing path (tickets 07/08).

Out-of-Files edits (needed): src/main.ts (routes text commands through `prepareAgentText` and a separate
agent guarded-edit instance; lazy import keeps boot at 353/355 KB); src/agent-site.ts (identity, outcome,
`write_file` path); src/agent-records.ts (review fix: retired marker, below); scripts/check-exports.allow.json
(removed the three temporary entries for shared/agent-command.ts, src/agent-owner.ts, src/agent-records.ts);
tests/agent-owner.test.ts (one assertion added).

Commits: 2a476dbb (Sol build), 9a9ad651 (review 1 fixes, Claude), 608c0cef (review 2 fix, Claude).

Tests: tests/agent-text-commit.test.ts (22): commit-then-publish and reload agreement; AbortError/
QuotaExceededError multi-file refusal with no drafts, history or model change; missing/failed IndexedDB;
cancellation before/after commit; duplicate and id reuse; manual typing flushed first and a manual write
between capture and commit refused with 0 overwrites; revocation; unchanged text; preview/history failure
after commit; hashed identity without text; redelivery after receipt eviction + Undo stays unknown (mutation
checked); editor change during the transaction still leaves draft memory equal to the durable records
(mutation checked). Existing tests/guarded-edit.test.ts green. `npm run check` ok, `npm run lint` ok,
`scripts/agents/unit.sh` pass 4094 fail 0 (by hand; no kit command).

Review (Sol gpt-6.1-sol, medium, read-only; two rounds): fixed 3 — receiptless redelivery after eviction could
apply again with fresh proofs (P1: every removed receipt now leaves a small retired marker per operation id,
kept like cancellation tombstones, and commit refuses it as unknown); payload identity stored whole file text
when no `contentHash` came (P2); a commit that won while the editor moved on left this tab's draft memory
behind IndexedDB (P1: it now reads the committed drafts back, announces them and refreshes lists; newer manual
writes win). Rejected 1 — every tab builds its owner at the stored generation, so a second tab is not fenced
without explicit takeover (P1): acquiring and transferring tab ownership is ticket 14 (shared ownership
coordination); today the hub still hands each command to one claiming tab. Retired markers have no cap yet
(ticket 28, bounded cleanup).

Kit:
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok size boot 353 KB (+1 KB) vs dev@e760068, budget 355 KB
- RESULT: fail specs 1 of 157 failed: native-upload.spec.ts (ran beside the review; rerun alone: RESULT: ok specs 1/1 passed)
- RESULT: ok review git diff e760068306bca55f71bb5371fd9729ac0588fb10...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-06/20261017T200944Z
- RESULT: ok review git diff e760068306bca55f71bb5371fd9729ac0588fb10...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-06/20261017T203617Z

Follow-up (landing review, Sol gpt-6.1-sol, medium, read-only; evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-06/20261017T210759Z; PR #35 merged as fbfc8b4c
before it was read): fixed 1 — the read-back of an unpublished agent commit could replace a newer manual write
made during that read (the agent fence flushes it at once, so it was no longer pending) (P1). src/drafts.ts
`settleAgent` counts this tab's changes per key and drops a read that any change overtook; the cross-tab
`refresh` is unchanged. Test: "a manual write during the read-back ... wins over that read" (mutation checked).

