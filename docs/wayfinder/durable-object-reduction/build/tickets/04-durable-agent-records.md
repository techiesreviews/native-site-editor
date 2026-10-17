---
title: "Extend browser persistence for receipts and fences"
type: task (AFK)
status: closed
assignee: dor-04
blocked_by: [03-remote-recovery]
builder: sol
phase: 2
---

## What

Add versioned receipt, workspace revision/owner and conversation stores alongside drafts. Provide one transaction API for drafts + receipt + revision checks; retain manual-editor fallback separately.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [browser recovery](../../tickets/06-define-browser-recovery.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/drafts.ts`
- `src/agent-records.ts`
- `shared/agent-command.ts`
- `tests/agent-records.test.ts`
- `tests/drafts.test.ts`

## Done when

- Unit tests in both files: upgrade preserves drafts; injected abort commits neither drafts nor receipt; unavailable IndexedDB refuses agent transactions.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Do not send agent transactions through existing per-file failure recovery.

## Done (2026-10-17)

Behaviour: no user-visible change. IndexedDB `native-site-editor-drafts` goes from version 1 to 2; the
upgrade only adds missing stores (`receipts`, `workspaces`, `conversations`), so v1 drafts stay as they
are. `openDraftDatabase` (src/drafts.ts) is the shared opener; the manual editor's `indexedDbDrafts`,
per-file retry, localStorage fallback and BroadcastChannel are unchanged. src/agent-records.ts adds
`indexedDbAgentRecords`: one readwrite transaction over drafts + receipts + workspaces checks owner
generation, workspace revision and each expected draft (whole record or absence), returns the recorded
receipt for a repeated operation id with the same payload identity, refuses a reused id with a different
payload, then writes drafts, receipt and revision bump all-or-nothing. Failures reject with
`AgentRecordsError` (`unavailable`, `aborted`, `conflict`, `duplicate-id`) and never fall back to
per-file retry, localStorage or the server; `unavailableAgentRecords` refuses everything. Generations
only increase (compare-and-set). Conversations are stored per workspace without caps (tickets 09/10).
shared/agent-command.ts holds the workspace key, canonical payload identity and receipt shape.
Nothing imports the new modules yet; scripts/check-exports.allow.json lists them until ticket 06 wires
them (remove the two entries then).

Out-of-Files edits (needed): tests/native-save/drafts.ts opens the database without pinning version 1
(it would throw VersionError after the upgrade); scripts/check-exports.allow.json (see above).

Commits: ac42adc0 (Sol build), db0e602a (allow list), b153ca23 (review fixes).

Tests: tests/agent-records.test.ts (in-test IndexedDB fake; fake-indexeddb is not installed): v1 upgrade
keeps drafts and the manual DraftStore reads them; AbortError/QuotaExceededError mid-commit leaves
drafts, receipt and revision unchanged; missing factory/open error refuse with `unavailable` while the
manual store still saves; stale revision/generation/draft (same timestamp, other text) refuse; duplicate
and reused ids; contending commits; generation CAS and workspace isolation; proofs captured before the
opener await. tests/drafts.test.ts: v1 upgrade through `indexedDbDrafts`. `npm run check` ok,
`scripts/agents/unit.sh` pass 4030 fail 0, `npm run lint` ok (by hand; no kit command).

Review (Sol gpt-6.1-sol, medium, read-only; evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-04/20261017T182507Z): fixed 2 —
draft expectations compared only `updatedAt` (same-millisecond writes could pass), now whole records;
`setGeneration` allowed equal/lower generations, now strictly increasing. Rejected 0.

Kit:
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok size boot 352 KB, budget 355 KB
- RESULT: ok specs 125/125 passed
- RESULT: ok review git diff 342985fdfd3d9fe661a4551b7c5f1f5b47a537d6...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-04/20261017T182507Z
