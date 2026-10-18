---
title: "Persist Ask agent history locally"
type: task (AFK)
status: closed
assignee: dor-09
landed: PR #48 (494dff2d)
blocked_by: [06-atomic-text-edits]
builder: claude
phase: 2
---

## What

Move questions, replies, seen/dismissed states and thread retention into browser records. Enforce 50 unfinished requests, 1 MiB aggregate conversations and seven-day completed retention. Preserve unfinished work; explicit capacity errors.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [browser recovery](../../tickets/06-define-browser-recovery.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/agent-records.ts`
- `src/components/agent-menu.ts`
- `src/components/agent-pins.ts`
- `src/controllers/agent-controller.ts`
- `src/controllers/page-structure-controller.ts`
- `shared/agent.ts`
- `tests/agent-conversations.test.ts`

## Done when

- Unit tests; existing browser spec `native-mcp.spec.ts` Ask agent scenarios plus reload/scope isolation. Local conversation actions produce **0 DO writes**.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Existing request visibility assumes remote connection; local history must remain accessible after disconnect.

## Done (2026-10-18)

Behaviour: Ask agent questions, replies, seen/dismissed states and threads live in the browser
(IndexedDB `conversations` store, src/agent-records.ts), per account/repository/branch; the agent
menu and pins read only this copy. Completed requests (done, answered, dismissed) are kept up to 7
days from their last change, all within 1 MiB serialized per workspace; expired, then oldest
completed ones go first. Unfinished ones (open, seen, question) are never evicted: a 51st, or any
unfinished one (new, reopened by an answer, or grown by a reply) that cannot fit once every completed
one is gone, is refused with a clear message ("50 requests already wait…", "…use all their space
(1 MiB). Dismiss some first."), checked before anything is sent. History stays after Turn off,
Disconnect and reloads; it does not turn remote agents on, restore grants, or reach other devices.
Clear and Dismiss are local (0 hub calls); dismissing a request agents still wait on also tells the
hub while remote is on, or on the first poll after it is turned on again. Answering needs remote on
(the card says so). While on, each poll brings agents' progress: kept only over an older stored copy,
never over a stored dismissal (checked in the writing transaction, so another tab's dismissal wins),
and a waiting hub request this browser lacks is adopted. The server request path is unchanged (remote
transport until ticket 20). Startup mounts the agent menu (0 requests) when a localStorage marker
says the open workspace has requests to show, so agent records stay out of boot.

Commits (as merged): 5dd1ccda, cdc685f5, d76c5789, fa3bc253 (spec), 4bbc5620 (review 1), 4f552370, 45011221 (review 2), ae6e7566, 494dff2d (Done).

Out-of-Files edits (needed): tests/agent-records.test.ts (conversation records now carry
`unfinished`/`updatedAt`); tests/native-save/native-mcp.spec.ts (new history scenario, as Done when
asks). shared/agent.ts, agent-pins.ts and page-structure-controller.ts needed no change (the rules
live in agent-records.ts, so the affected specs stayed 25 instead of 133).

Tests: tests/agent-conversations.test.ts (retention order, 7-day expiry, 50-cap and 1 MiB refusals
before and at writing, oversized update leaves the stored copy, accept-in-transaction keeps another
tab's dismissal, workspace isolation incl. account case, controller mounts the menu only for kept
history). native-mcp.spec.ts "Ask agent history stays in this browser": after Turn off and reload
both pins show; another branch shows none and switching back restores them; answering while off is
refused on the card; Dismiss and Clear, a reload and the branch switches make **0** `/api/agent/*` or
`/mcp` requests (each /api/agent request is one hub DO call); turned on again, the dismissed question
is withdrawn on the hub and wait_for_requests returns none. `npm run check` ok, `npm run lint` ok,
`scripts/agents/unit.sh` pass 4192 fail 0 (by hand; no kit command).

Review (gpt-6.1-sol, medium, read-only; run.log verified):
Round 1 `.scratch/reviews/dor-09/20261018T010846Z`: fixed 3 (updates could exceed 1 MiB; a stale
hub reply could overwrite another tab's dismissal; Ask did not recheck remote/workspace after the
storage await).
Round 2 `.scratch/reviews/dor-09/20261018T013852Z`: fixed 2 (answer sent before checking space;
evicted records stayed in the in-memory list). Rejected 1: "dismissing while connected writes the
hub": withdrawing a request agents wait on is a remote transport action like ask/answer (they would
otherwise keep working on it); there is no transient transport until tickets 13/14, and local Clear,
off-line Dismiss and reload make 0 calls. Validation gaps not added: menu-level forEachAwait/eviction
tests (no DOM harness for agent-menu; the browser spec covers the menu), two-tab browser spec (the
transaction rule is unit-tested).

Kit:
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok size boot 354 KB (±0 KB) vs dev@6635ffa, budget 355 KB
- RESULT: fail specs 2 of 25 failed: native-components.spec.ts, native-lazy-panels.spec.ts (lazy-panels: hub-only request not adopted, fixed in b96e7274; components: unrelated slot field, passed on rerun)
- RESULT: ok specs 4/4 passed (native-agent-quiet, native-components, native-lazy-panels, native-mcp)
- After rebasing on 6635ffa1: RESULT: ok specs (native-agent-quiet 5, native-lazy-panels 6); native-mcp 14/15 with
  `RESULT: fail specs 1 of 1 failed: native-mcp.spec.ts` ("an MCP client connected by OAuth reaches the open editor
  tab": the consent page answers "Too many unfinished connection requests for this sign-in"). The same test fails on
  plain dev 6635ffa1 (ticket 24's pending ledger on the native-save server); nothing in this slice touches OAuth.
- Landing: rebased on cb308bc1 (ticket 24b fixture fix); RESULT: ok size boot 355 KB (+1 KB) vs dev@cb308bc, budget 355 KB;
  kit pr: check, unit, lint, specs, review, CI ok; RESULT: ok merged #48 494dff2.
- RESULT: ok shots raw spec, out /home/ubulex/Projects/native-site-editor/.scratch/shots/dor-09/20261018-013725
- RESULT: ok review git diff b72c6cb3…HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-09/20261018T010846Z
- RESULT: ok review git diff 6635ffa1…HEAD evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-09/20261018T013852Z
