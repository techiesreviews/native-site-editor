---
title: "Extend command commits to structural changes"
type: task (AFK)
status: closed
assignee: dor-07
landed: PR #44 (4a2cdb19)
blocked_by: [06-atomic-text-edits]
builder: sol
phase: 2
---

## What

Stage create/move/delete/page/component changes as one draft transaction and one history action. Fence all awaited preparation and postcommit UI refreshes.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [browser recovery](../../tickets/06-define-browser-recovery.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/guarded-edit/commit.ts`
- `src/page-builder/native-operation-history.ts`
- `src/agent-site.ts`
- `src/main.ts`
- `tests/agent-structural-commit.test.ts`

## Done when

- Unit tests with `forEachAwait`; existing browser spec `native-mcp.spec.ts`: component/page/move failure writes **0 partial drafts**, successful change undoes once.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

A failed postcommit UI refresh must not relabel committed work as unapplied.

## Done (2026-10-18)

Behaviour: agent structural commands (write_file creating a file, create_page, set_page_details, make_component,
add/move/remove_section, move_file, delete_file) now take ticket 06's staged commit: drafts + receipt in one
owner-fenced IndexedDB transaction, then model/history/preview, then the reply. Media commands are unchanged
(ticket 08). src/agent-site.ts `atomicAgentCommand` picks them; `agentStructuralActions` gives each command its own
guarded-edit instance and its own Pages, Files, Block move and component controllers over that instance, so no
ambient flag can hand the receipt to a manual edit the user makes meanwhile. The instance allows one guarded run
per command (one history action: set_page_details writes title and description as one step) and always takes the
asynchronous commit (`historyOnly`); the plan's own selection (add_section's new section) follows once applied.
Every awaited preparation port (createProblem, entry, branchText, controller index/redirect/loader awaits, the
fence) rechecks staleness and `check()` (owner generation, paused admission); revocation and cancellation are
proved again inside the commit transaction. After the commit, a failed or stale refresh, preview error, refused
history registration or thrown UI error is never reported as unapplied: commit.ts `recover` reads the durable
drafts back and refreshes lists, and the recorded reply is returned. Manual edits are unchanged.
The receipt records the reply (created file/route/hash, section id, component files, loader note, page hash), built
from the staged drafts and plan at commit time; the live reply is that recorded reply plus live-only result fields
(make_component's slots/cards/notes), so a duplicate delivery returns the same message and recorded fields.
The controller factories are passed in from main.ts so the lazy agent chunk does not split boot modules.

Out-of-Files edits (needed): src/editor-workspace.ts (optional `check()`, absent from ticket 08's media context, and the commit's plan hint on `AgentTextCommit`);
tests/native-save/native-mcp.spec.ts (storage-failure and one-Undo assertions).

Commits (as merged in PR #44): bb9d94cf (Sol build), d0629849 (boot size, page-details labels; Claude),
6a544f6a (review 1; Claude), 0701ae74 (add_section selection regression; Claude), aec72a95, e43daa2e and 369478a0
(review 2: recorded reply, make_component files equal to the live reply; Claude), 4a2cdb19 (optional `check()` for
ticket 08's media context; Claude).

Tests: tests/agent-structural-commit.test.ts (57): create/move/delete/multi-file component commit together with
the receipt, one Undo and one Redo; AbortError/QuotaExceededError roll every file back; `forEachAwait` over every
await with takeover, revocation, cancellation and manual writes, 0 late commits (synthetic plans and the real
Pages controller); real create_page/set_page_details/move_file/delete_file controllers carry one receipt and one
history action; refresh failure/stale/history refusal after commit report applied with drafts equal to durable
records; duplicates return the recorded reply (equal to the live reply) without new drafts or steps; manual edits
during preparation never carry the receipt. native-mcp.spec.ts: make_component, create_page and move_file with an
injected receipt-store failure write 0 drafts and refuse with "Nothing was changed"; the retry applies and one Undo
clears every draft; set_page_details with title and description undoes in one step.
`npm run check` ok, `npm run lint` ok, `scripts/agents/unit.sh` pass 4148 fail 0 (by hand; no kit command).

Review (Sol gpt-6.1-sol, medium, read-only; two rounds): fixed 2 — the receipt recorded a generic reply while the
live reply carried file/route/hash (P2, round 1, create_page); section ids, component files and loader note were
still live-only (P2, round 2). Rejected 1 in part — `forEachAwait` through the real component adapter: component
UI cannot mount in the unit fixture; that path is covered by native-mcp.spec.ts and native-component-loader.spec.ts
(storage failure, loader-held refusal, one Undo). Also fixed by the runner: agent add_section had stopped selecting
the inserted section (native-component-loader.spec.ts).

Kit:
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok size boot 354 KB (+1 KB) vs dev@90d88af, budget 355 KB
- RESULT: fail specs 1 of 99 failed: native-component-loader.spec.ts (add_section selection; fixed in 0701ae74, rerun: RESULT: ok specs 1/1 passed)
- RESULT: fail specs 1 of 99 failed: native-mcp.spec.ts (first kit pr: make_component files listed the page; fixed in 369478a0)
- RESULT: ok specs 2/2 passed (native-mcp.spec.ts, native-component-loader.spec.ts after 369478a0)
- RESULT: ok review git diff 90d88afe814fdb282d37cd79c274f7f0a3e31f28...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-07/20261017T222648Z
- RESULT: ok review git diff 90d88afe814fdb282d37cd79c274f7f0a3e31f28...HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-07/20261017T235123Z
- RESULT: ok merged #44 4a2cdb1 (kit pr: check, unit, lint, specs, CI ok)
