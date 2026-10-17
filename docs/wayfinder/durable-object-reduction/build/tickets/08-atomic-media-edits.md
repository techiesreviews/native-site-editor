---
title: "Include uploads and media changes in command recovery"
type: task (AFK)
status: closed
assignee: dor-08
blocked_by: [06-atomic-text-edits]
builder: sol
phase: 2
---

## What

Persist immutable upload bytes before committing referencing drafts/receipt; stage media drafts until the fenced transaction. Preserve referenced uploads on uncertain outcomes; clean only proven orphan staging.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [browser recovery](../../tickets/06-define-browser-recovery.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/page-builder/media-draft-transaction.ts`
- `src/page-builder/media-workspace.ts`
- `src/uploads.ts`
- `src/agent-media-actions.ts`
- `tests/agent-media-commit.test.ts`

## Done when

- Unit tests plus existing `tests/media-draft-transaction-await-race.test.ts`; existing browser spec `native-mcp-media.spec.ts`: abort/reload/cancel preserve all-or-none drafts and recoverable bytes.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Separate upload database prevents a single cross-database transaction; durable staging must precede draft commit.

## Done (2026-10-18)

Behaviour: agent media commands that change drafts through Media batches (remove_media, keep_media,
restore_media with files, replace_media, describe_media, change_collection, changing adding_settings,
write_subtitles, video_still, single-batch improve_images) now follow ticket 06's staged fenced commit.
src/agent-media-actions.ts `applyAgentMedia` validates arguments first (specific refusals unchanged), requires
`grantId`, builds a hashed identity (operation, path, branch, commit, hash of args; no subtitle text,
descriptions or bytes in receipts), returns a matching duplicate's recorded outcome without staging, and
buffers the command's batch (more than one batch refuses the whole command before mutation). The batch then
runs through src/page-builder/media-draft-transaction.ts with an agent context: fence the touched drafts and
the drafts the plan only read (pages that prove usage, assets), snapshot, stage content-addressed upload
bytes durably first (src/uploads.ts readwrite now resolves on transaction `complete`, rejects on abort), then
one owner-fenced IndexedDB transaction commits drafts + receipt and proves the read drafts unchanged, then the
sources/draft model/history are published without a second draft write, then the outcome is reported. A
failed or refused records transaction applies nothing; its staged bytes stay held in this tab and are never
deleted by the agent path (after reload, the ordinary sweep removes bytes no durable draft references).
Cancel before commit applies nothing; after commit reports applied; a commit that won while the editor moved
on reads the durable drafts back. Manual Media batches are unchanged (same synchronous publish, rollback and
await-race counts). Read-only media commands need no receipt.

Not covered (decide): place_media, mutating frame_image (including trim) and mutating loop_video change page
text through media-controller guarded edits (src/guarded-edit/commit.ts, src/main.ts), not Media batches; they
stay on the existing receiptless path. Routing them needs ticket 07's lane files.

Out-of-Files edits (needed): tests/mcp-runtime.test.ts, tests/media-workspace.test.ts, tests/agent-media.test.ts
(commands carry a grantId and run the real durable path through tests/support/agent-media-workspace.ts: DraftStore
+ owner-fenced records over the in-test IndexedDB fake; assertions unchanged).

Commits: 1e054d17 (Sol build), b238bf27 (Sol: refusal order, test migration), 9e318a2a (review fix, Claude).

Tests: tests/agent-media-commit.test.ts (18): bytes durable before the one records transaction, no second draft
write, reload finds drafts + receipt + bytes; AbortError/QuotaExceededError apply nothing and delete no bytes;
bytes referenced by another unsaved draft kept; cancel before/after commit; duplicate and id reuse; missing
grantId; empty change records its outcome; editor moved on after commit settles; byte put aborted at
transaction complete fails; manual media unchanged; newer unsaved draft refuses; cancellation during staging;
two-batch Improve images refuses; adding settings report and replay; another tab's persisted page draft that
adds a use refuses removal (mutation checked: fails without the read-dependency proof). Existing
tests/media-draft-transaction-await-race.test.ts green (counts unchanged). `npm run check` ok, `npm run lint` ok,
`scripts/agents/unit.sh` pass 4129 fail 0 (by hand; no kit command).

Review (Sol gpt-6.1-sol, medium, read-only; one round): fixed 1 — the durable commit proved only the drafts it
wrote, not the pages/assets the plan read, so another tab's persisted new reference could be removed (P1).
Rejected 1 — place_media/frame_image/loop_video bypass the receipt path (P1): they are guarded page edits
outside this ticket's Files and inside ticket 07's lane; recorded under "Not covered". Not added: agent-path
`forEachAwait` coverage (suggested gap); the fixed refusals are covered by the tests above. A new page created
by another tab is not visible to the per-key proof; one-owner tabs are ticket 14.

Kit:
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok size boot 354 KB (+1 KB) vs dev@90d88af, budget 355 KB
- RESULT: ok specs 2/2 passed (native-mcp-media.spec.ts 5 passed, native-guarded-history.spec.ts 3 passed)
- Builder's `kit specs --affected` (126 specs): 698 default passed, 1 failed (native-guarded-history.spec.ts under load 18+; passed alone above), actual group 46+ passed before the builder timed out
- RESULT: ok review git diff 90d88afe814fdb282d37cd79c274f7f0a3e31f28...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-08/20261017T234023Z
