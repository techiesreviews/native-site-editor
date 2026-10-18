---
title: "Bound receipts and export recoverable work"
type: task (AFK)
status: closed
assignee: dor-10
landed: PR #51 (065aa4f5)
blocked_by: [08-atomic-media-edits, 09-browser-conversations]
builder: claude
phase: 2
---

## What

Enforce receipts ≤24 hours/1,000/1 MiB. On quota failure evict eligible completed records/rebuildable caches, reconcile, then retry an uncommitted transaction at most once. Offer draft/upload export; never remove unsaved work.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [browser recovery](../../tickets/06-define-browser-recovery.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/agent-records.ts`
- `src/components/agent-menu.ts`
- `src/uploads.ts`
- `src/agent-recovery-export.ts`
- `tests/agent-local-recovery.test.ts`
- `tests/native-save/native-agent-recovery.spec.ts`

## Done when

- Unit tests and B: full storage, disabled storage, uncertain commit, reload and missing upload evidence produce truthful outcomes; export includes available bytes.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Receipt eviction must not make stale delivery eligible as a new edit.

## Done (2026-10-18)

Behaviour: receipts and the fences beside them are bounded per account/repository/branch workspace
without letting a late delivery apply (src/agent-records.ts `receiptRetention`). Receipts: 24 hours,
1,000, and 1 MiB serialized together with that workspace's retired markers, cancellation tombstones and
revocation records; the oldest completed receipts go first, each leaving a small retired marker that
refuses its operation id (any issue time) until the receipt's 24 hours end. Markers, tombstones and
revocations now carry their workspace and time and only age out (24 hours); a required receipt that
cannot fit beside them is refused (`capacity`) before mutation. Drafts are never evicted. Receipts now
record `issuedAt` (the command's `createdAt`); every dropped receipt or marker raises the workspace's
`horizon`, and a delivery without a live receipt issued at or before it, or more than 23 hours ago
(fences may have aged out; one hour for clock differences), is refused as unknown (`conflict`). Older
global `["retired", id]` markers are still honoured and no longer written. Cancel and revoke no longer
delete expired receipts (the next sweep does); a tombstone is checked before the receipt lookup.

Full storage: a commit refused with QuotaExceededError is first settled from its receipt (a transaction
that landed anyway is reported applied once and published); then aged-out records and completed
conversations go, and receipts older than 10 minutes of edits issued before it become markers, in every
workspace; only if that freed something is it tried once more, and settled again if the retry reports
failure. Still failing: agent edits stop in this tab (`agentStorageStatus`, each refused before any
transaction) until the user chooses Try again; a receipt that cannot be read is reported `unknown`
(src/agent-site.ts and src/agent-media-actions.ts no longer say "Nothing was changed" then). Disabled
storage (IndexedDB missing or refusing to open) refuses agent edits and is reported the same way without
stopping. Unsaved drafts, unfinished conversations, uploads and fences are never removed. The browser keeps
no persistent rebuildable source cache (ticket 11's is in memory), so `evictCaches` is an empty hook.

Project menu (src/components/agent-menu.ts): a warning box says in plain words what stopped and what to
do, with Download unsaved changes and Try again. src/agent-recovery-export.ts (lazy, with src/zip.ts)
downloads `<repo>-unsaved-changes.zip`: `files/<path>` for each unsaved text draft and each upload or
replaced file whose bytes this browser still has, `changes.json` and a README listing what is not
included (deleted, bytes missing, content on GitHub). It only reads; a workspace change or closed menu
during the export downloads nothing. Boot is unchanged.

Out-of-Files edits (needed): shared/agent-command.ts (`AgentReceipt.issuedAt`); src/agent-site.ts and
src/agent-media-actions.ts (pass `issuedAt`; `unknown` refusal text); src/components/agent-menu.css (the
warning box); tests/support/fake-agent-indexeddb.ts (full storage, commit-then-abort, read failure);
tests/agent-owner.test.ts, tests/agent-records.test.ts (issue times; horizon in workspace records; cancel/
revoke leave expired receipts to the sweep); tests/agent-media.test.ts, tests/media-workspace.test.ts,
tests/mcp-runtime.test.ts (commands issued now, not at 0); tests/native-save/native-mcp.spec.ts (its
injected receipt failure is an AbortError: a quota one would now stop agent edits); tests/agent-text-
commit.test.ts (lead follow-up: the deletion race Sol flagged in ticket 06).

Tests: tests/agent-local-recovery.test.ts (18): retention count/bytes/age and capacity; past 1,000 the
evicted id stays unknown for its late delivery and for reuse with a fresh issue time, other work and
current proofs; tombstone/revocation age-out with late deliveries still refused; 23-hour age; quota relief
keeps unfinished conversations, tombstones and recent receipts and applies once; still full stops before
any write and Try again resumes; nothing to evict means one attempt; uncertain commit and uncertain retry
settled applied once (mutation checked); unreadable receipt is `unknown`; reload; disabled storage; export
contents, missing and unreadable bytes; stale download saves nothing. tests/agent-text-commit.test.ts: a
manual discard during the read-back stays discarded (mutation checked: fails without `drop()`'s counter).
tests/native-save/native-agent-recovery.spec.ts: full storage refuses the edit with drafts unchanged,
shows the box, downloads text and the kept upload and names the lost one, stays stopped until Try again,
then applies; disabled IndexedDB refuses and downloads the manual draft kept in the tab.
`npm run check` ok, `npm run lint` ok, `scripts/agents/unit.sh` pass 4301 fail 0 (by hand; no kit command).

Review (gpt-6.1-sol, medium, read-only; run.log verified):
Round 1 `.scratch/reviews/dor-10/20261018T035821Z`: fixed 2 (a retry that landed but reported failure
was called nothing changed; the export did not recheck its workspace after awaits).
Round 2 `.scratch/reviews/dor-10/20261018T040245Z`: fixed 3 (markers could be dropped early under byte or
quota pressure, letting a reused id with a fresh issue time apply: they now last the day and quota turns
receipts into markers; one unreadable upload aborted the whole export; the save module loaded after the
last workspace check). Rejected 0. Beyond 24 hours an agent re-sending an old request id gets a new
command from the Worker (new issue time); the browser keeps no record that old by contract. Not added:
menu-level await-race test (no DOM harness for agent-menu; the helper's stale paths are unit-tested).

Kit:
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok size boot 355 KB (±0 KB) vs dev@5825912, budget 355 KB
- RESULT: ok specs 4/4 passed (native-agent-recovery 2, native-draft-storage 3, native-mcp-media 5, native-mcp 18)
- RESULT: ok shots raw spec, out /home/ubulex/Projects/native-site-editor/.scratch/shots/dor-10/20261018-035533
- RESULT: ok review git diff 5825912b…HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-10/20261018T035821Z
- RESULT: ok review git diff 5825912b…HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-10/20261018T040245Z
- Landing: kit pr rebased on 5825912b; check, unit, lint, specs, review, CI ok; RESULT: ok merged #51 065aa4f.
  Landing review (gpt-6.1-sol, `.scratch/reviews/dor-10/20261018T043028Z`): no defects; validation gap added
  after merge (follow-up PR): quota relief turns a live receipt over ten minutes old into a marker, its
  redelivery and reuse with a fresh issue time stay refused, drafts and another workspace's generation and
  revision unchanged (mutation checked). Menu-level forEachAwait export race: not added (no agent-menu DOM
  harness; the helper's stale paths are unit-tested).
