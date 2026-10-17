---
title: "Make remote connection an explicit action"
type: task (AFK)
status: closed
assignee: dor-02
blocked_by: [01-usage-harness]
builder: claude
phase: 1
---

## What

Remote opt-in is per tab and not remembered across reloads (lead decision in the README). Remove controller startup discovery and menu-mount discovery. Start legacy transport only after explicit Connect/authorized consent; preserve a local UI shell. Stop background work on remote-off.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/controllers/agent-controller.ts`
- `src/components/agent-menu.ts`
- `src/main.ts`
- `tests/agent-controller.test.ts`
- `tests/native-save/native-agent-quiet.spec.ts`

## Done when

- Updated existing controller tests; browser spec `native-agent-quiet.spec.ts`: startup, menu opening, visible/hidden idle each produce **0 agent-hub calls/uploads/writes**.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Consent events must be workspace-bound; existing grants alone must not silently enable remote mode.

## Done (2026-10-17)

**Behaviour.** Remote agents are off in every tab until the user turns them on there; the choice is
not remembered across reloads. `agent-controller.ts` no longer probes the hub at startup, on focus or
every 30 s: `start()` only listens for the consent page's storage event. Mounting the agent menu
(opening the project menu) makes no request. The menu's legacy transport (2 s / 30 s polling, 30 s
context heartbeat, draft uploads, claim/ack) starts only on:
- **Connect with MCP** in that tab: it polls once; an agent connected before is used again and the
  menu says "Remote agents are on. If an agent you connected before stopped, ask it to continue.";
  otherwise it makes a token and copies the prompt as before.
- **An approval in this browser** bound to the tab's workspace: up to three hub checks (1, 4, 10 s)
  look for an OAuth grant for the repository this tab shows, made no earlier than 10 s before the
  approval, and not one this tab saw before Turn off. An existing grant alone never turns it on.
While off the menu says "Remote agents are off in this tab. Choose Connect with MCP to turn them on."
**Turn off** (new link while on) and Disconnect/Cancel stop every timer and listener and withdraw a
shared context once (one `pause`). An activation counter fences every await: a hub answer, context
share, draft batch (checked after gzip, before fetch) or consent check from an earlier activation
writes nothing. A change already claimed is still acknowledged. GitHub/editor/sign-in traffic unchanged.

**Commits.** dce6c1c7, bb3f94fe, cda9ecab, c948955f, 9040489f, 4d43ef1d (review 1), 1d55ff26 (review 2).

**Tests.** `tests/agent-controller.test.ts` updated (6 tests: no probe/timer/mount on start, consent
time passed to the menu). New `tests/native-save/native-agent-quiet.spec.ts` (2 tests): with a used
grant in the session, startup, opening the menu, 65 s visible, 65 s hidden and 65 s visible again
(Playwright clock) make **0** `/api/agent/*` or `/mcp` requests (each `/api/agent/*` request is one
hub DO call; POSTs are the context uploads and hub writes); Connect re-uses the connected agent without
a new token; Turn off during a held context share leaves only `pause` requests, then 0. An approval
whose only grants are a minute old or for another repository makes exactly its 3 checks and stays
off. `native-lazy-panels.spec.ts`: the hub-failure test turns remote on with Connect, and both tests
now assert 0 hub calls at startup (was 1). `tests/guarded-edit-reads.test.ts`: removed the
stale-compare allowlist entry for the deleted discovery retry (outside Files; the allowlist test fails
on stale entries). Browser counts use request interception, not the Node usage harness, which runs
the Worker without a browser.
`npm run check` ok; `npm run lint` ok; `scripts/agents/unit.sh` pass 3994, fail 0;
`RESULT: fail specs 1 of 11 failed: native-components.spec.ts` (component-tools module test,
`deps.canvasComponent is not a function`, no agent code involved), rerun `RESULT: ok specs 1/1 passed`;
after review fixes `RESULT: ok specs 4/4 passed` (quiet, lazy-panels, mcp, mcp-media).

**Shots.** `RESULT: ok shots raw spec, out .scratch/shots/dor-02/20261017-142416` (agent menu off and
waiting; 1280 light/dark, 390 light). First take showed Turn off beside a disabled Connect during the
change; links now hide while a change is in progress.

**Review** (gpt-6.1-sol, medium, read-only; run.log verified).
Round 1 `RESULT: ok review` evidence `.scratch/reviews/dor-02/20261017T143617Z`: fixed 2 (approval
window let a 60 s old grant match; Turn off did not fence a pending share/draft upload).
Round 2 evidence `.scratch/reviews/dor-02/20261017T144257Z`: fixed 3 (overlapping consent check could
undo Turn off; upload checked before gzip, not before fetch; grants seen before Turn off now never
count). Rejected 2: (a) "correlate approval with the specific authorization": the consent page
(worker/oauth.ts, outside Files) announces only a time; remaining gap is a second approval for another
repository within 10 s of a first one never seen by this tab, itself a fresh approval. A later ticket
can put the repository in the announcement. (b) `forEachAwait` coverage: the menu is DOM-bound and
unit tests have no DOM; the browser spec holds a context share across Turn off instead.

**Evidence.** `RESULT: ok doctor 7/7 checks passed`.
