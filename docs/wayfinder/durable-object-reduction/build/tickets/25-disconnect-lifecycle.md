---
title: "Clean temporary data after detected last-editor loss"
type: task (AFK)
status: closed
assignee: dor-25
blocked_by: [21-workspace-metadata-caps, 22-bounded-repository-cache]
builder: sol
phase: 4
---

## What

Combine alarm deadlines by purpose. Last eligible editor loss schedules five-minute eligibility; reconnect revalidates workspace and fences old cleanup. Cleanup invalidates grants; remote traffic cannot renew presence. Sign-out/revoke denies immediately and requests scoped deletion.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [storage budgets](../../tickets/05-set-storage-budgets-and-lifetimes.md), [disconnect behaviour](../../tickets/01-define-disconnect-and-reconnect.md).

## Files

- `worker/agent-lifecycle.ts`
- `worker/index.ts`
- `worker/agent-relay.ts`
- `worker/agent-context.ts`
- `worker/app.ts`
- `tests/agent-lifecycle.test.ts`

## Done when

- Unit tests: first/last tab, background tab, deadline reconnect, retried alarm, delayed deletion and absolute expiry; sign-in/config survive agent cleanup.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Check generation/presence at deletion, not only scheduling. Exclude remote agents from editor presence.

## Done (2026-10-19)

**Behaviour.**
- **One alarm, many purposes** (worker/agent-lifecycle.ts `AlarmDeadlines`): each SessionStore object keeps `alarm-deadlines`
  (`session`, `registration`, `agent-cleanup`) and the alarm is always the earliest. Setting one purpose never postpones
  another; sign-out clears only its own purpose. Nothing writes an alarm at construction. Objects from before this change
  (alarm, no table) derive their purposes lazily from `session.expiresAt` / the registration budget. The session purpose
  runs only once the stored record really expired (a live sign-in, hub or OAuth client is rescheduled, never cleared);
  `config` and live sign-ins are never touched by agent cleanup.
- **Presence** (worker/agent-relay.ts `eligibleEditors`): open (`readyState 1`) editor sockets of the workspace that have
  handshaken at least once (`everHandshaken` in the attachment survives hibernation). Closing sockets, never-handshaken
  sockets and MCP traffic (dispatch, cancel, ledger calls) never count; a connected background tab counts.
- **Last loss** (webSocketClose/Error): if no eligible socket remains **and the workspace ledger has live grants**, store
  `agent-lifecycle` `{generation+1, disconnectDeadline = close + 5 min}` and the `agent-cleanup` deadline. A workspace with
  no grants writes nothing. A first handshake within grace bumps the generation and cancels it (the upgrade route already
  re-authorizes the repository; the handshake is the fresh scope check). Lead decision: a grant reserved while no eligible
  editor socket exists arms the same grace (a remote agent alone cannot keep permissions alive).
- **Cleanup alarm**: inside `blockConcurrencyWhile`, local storage only, it rechecks eligible sockets, deadline and
  generation, then in one transaction marks every ledger entry `cleaned` and records tombstones; the relay refuses those
  grant ids at once (`connect-agent-again`, in-memory set, one key read per wake, 0 writes on tool traffic). After the gate,
  it deletes each grant record (conditional, with a short PUT fence in the record object), its hub entry, then releases the
  ledger entry; unknown outcomes stay counted and retry (30 s deadline + throw). Entries of grants rebound to another
  workspace are released without touching their new binding. Tombstones refuse reserve/finalize/rebind of a cleaned id and
  shrink to 10 min after physical deletion; they and each record fence count toward the 64 KiB workspace budget at admission
  and are pruned lazily. A reconnect after cleanup works; old grants need a fresh connection.
- **Sign-out / revoke**: sign-out ends the session first (authentication fence), then deletes grants and the hub. Revoke
  removes the hub entry first (denies), then deletes the record; a failure never restores access; one revoke leaves the
  others. Rebind refuses a cleaned source and compensates a cleanup race hub-first. Absolute expiry checks unchanged.

**Out-of-Files edits (needed).** worker/agent-metadata.ts (`cleaned` entry state, exported types), tests/fakes/counted-agent.ts
(gate tracking, close/error hooks, `list` ranges), tests updated for async socket handlers and the deadline table:
agent-relay, agent-cancellation, agent-cutover, agent-usage (hub alarm test now uses an expired hub: a live one is
rescheduled), oauth-pending (alarm at session expiry), agent-tools-read/edit/media, agent-watch. Docs: CONTEXT.md (Agent
connection: pinned workspace, explicit opt-in, receiving tab, five-minute grace), docs/agents/code-map.md (relay, metadata,
lifecycle; browser transport, tools, records, owner, recovery, Watch). app.ts unchanged.

**Commits.** f926a8b5 (Sol build), 28d5bbe4 (Claude: grant-less last close writes nothing, so ticket 13's 0-write relay test
is back; no second parse of results), c81c3ac0 (review 1), 7ef0c7ef (review 2); hashes before `kit pr`'s rebase.

**Tests.** New tests/agent-lifecycle.test.ts (20): first of two tabs; last tab (detection, deadline and deletion measured
apart); background tab; reconnect just before the deadline; late and repeated alarms; remote-only grant and dispatch never
extending grace; never-handshaken and closing sockets; unknown edit outcome; failed deletion fenced across reconnect, retries
and tombstones; sign-in, config, repository cache survive; sign-out and revoke deny while deletion is held or fails; deadline
table order, independence and legacy alarms; delayed first PUT fenced; fence transaction rollback; rebind racing source
cleanup with a failing compensating delete (401, mutation checked); tombstone budget, shrink and lazy prune (mutation checked).
Focused `scripts/agents/unit.sh` (lifecycle, relay, cancellation, usage, metadata, cutover, oauth-pending, registration,
repository cache, workspace binding, grant reliability) pass 199 fail 0; Sol's full run pass 4531 fail 0; `npm run check` ok;
eslint on worker/ and the new test ok (by hand). Used grant stays 3 auth DO calls + 1 dispatch (agent-usage).

**Review** (gpt-6.1-sol, medium, read-only; run.log verified).
Round 1 `RESULT: ok review git diff e91b72398d8c27c3b0fc35623bad1a7d0a467e95...HEAD evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-25/20261018T234253Z`: fixed 2 (P1 a rejected rebind whose
compensating delete failed left the token working: hub removal now comes first; P2 tombstones were outside the 64 KiB budget:
now charged, shortened after deletion, pruned lazily). Also fixed while there: a grant rebound away kept its source entry
retrying until expiry.
Round 2 `RESULT: ok review git diff e91b72398d8c27c3b0fc35623bad1a7d0a467e95...HEAD evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-25/20261018T234734Z`: fixed 1 (P2 the record object's PUT fence
lived until grant expiry, unaccounted: now 10 min and charged per tombstone). Rejected in part: the suggested cross-object
inventory test (the per-tombstone charge is asserted directly; the record fence's lifetime is asserted). Rejected 0 otherwise.

**Known limits.** Silent network loss is detected only when the runtime reports the close (decision 01: no physical-loss
deadline). Pre-ticket-21 grants are in no ledger, so this cleanup cannot see them (ticket 27/28).

**Kit.**
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok specs none affected
- Boot size not run: worker-only change, no `src/` imports.
