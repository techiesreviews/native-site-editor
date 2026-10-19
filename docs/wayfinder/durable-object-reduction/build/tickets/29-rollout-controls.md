---
title: "Add independent safe pause controls"
type: task (AFK)
status: closed
assignee: dor-29
blocked_by: [28-bounded-legacy-cleanup]
builder: sol
phase: 6
---

## What

Finalize independent relay, Watch and modern-registration controls; modern registration remains off. Pausing remote features/cleanup preserves browser schema/fences, drafts, sign-in and manual editing.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md) (rollback), [handoff](../../handoff.md) release evidence.

## Files

- `worker/agent-controls.ts`
- `worker/app.ts`
- `worker/mcp.ts`
- `worker/oauth.ts`
- `worker/agent-maintenance.ts`
- `src/components/agent-menu.ts`
- `wrangler.jsonc`
- `wrangler.preview.jsonc`
- `wrangler.techies.jsonc`
- `tests/agent-controls.test.ts`

## Done when

- Unit tests and browser spec(s): `native-agent-quiet.spec.ts`: every control combination fails safely; pause never restores polling/mirrors or replays unknown edits.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Initial configuration must remain disabled; production enablement is a separate authorized action.

## Done (2026-10-19)

**Behaviour.** Five Worker vars, read only in `worker/agent-controls.ts`, values `"on"`/`"off"` (trimmed, any case). A
missing var keeps today's behaviour (relay, Watch, lifecycle cleanup on; legacy maintenance off); any other value means off.
`AGENT_MODERN_REGISTRATION` exists in every config but no code reads it: `modernRegistration` is always false until the
later change that builds it (ticket 09).
- **Defaults (not deployed).** All three wrangler files, `wrangler.preview.jsonc`, `wrangler.jsonc` (self-host template) and
  `wrangler.techies.jsonc` (production): `AGENT_RELAY`, `AGENT_WATCH`, `AGENT_LIFECYCLE_CLEANUP` = `"on"`;
  `AGENT_LEGACY_MAINTENANCE`, `AGENT_MODERN_REGISTRATION` = `"off"`. This is today's agreed behaviour, so the next deploy changes
  nothing until someone flips a var. Each var has a one-line comment saying what off does.
- **Relay off**, refused in `route()` before sign-in/account lookup or any DO call (after ticket 20's 410 routes, which stay):
  `/api/agent/relay`, `/connect`, `/rebind`, `/connections` answer **403** `{error: "Remote agents are paused by the site owner.",
  code: "agents-paused"}` (no-store); `/mcp` answers the same text as a tool error result for `tools/call` (else a JSON-RPC error),
  before authentication; OAuth `/auth/mcp/register`, `/authorize`, `/token` answer the 403 with CORS. Revoke, sign-out and
  existing grants are untouched (removing access always works). Browser: the menu's turn-on check meets the pause and shows the
  message with **Retry** (one manual attempt) and **Disconnect MCP** (revokes this repository/branch's grants without listing them:
  `/api/agent/revoke {all, repoId, branch}`, new optional `branch` filter); the transport classifies an `agents-paused` probe as
  paused, never quota or transient, so no reconnect loop. A pause reply only acts for the activation and workspace that sent it.
  Already-open sockets stay open until reload/reconnect; their MCP calls are refused at the Worker.
- **Watch off**: wait_for_requests sends a 0 ms budget (no hold) and answers the quiet result with the hint "Watch is paused by the
  site owner. Agents still get requests when they ask."; `/api/agent/connections` carries `controls.watch`, so the menu learns it on
  its existing explicit reads (no new requests) and shows that line instead of "Watch for requests".
- **Lifecycle cleanup off**: a due `agent-cleanup` alarm purpose is postponed 6 h (no deletions, no refire loop; one wake per
  6 h per waiting object) and runs normally once back on. Session expiry, registration pruning, cleaned-grant refusals, sign-out
  and revoke are unchanged.
- **Legacy maintenance off**: both `/__maintenance/*` routes 404 with 0 DO work even with their secrets set; on, they still need them.
- Never restored: polling, context heartbeats, server draft mirrors, legacy hub, replay of unknown edits. Browser drafts, sign-in,
  manual editing, schema and generation fences untouched.

**Out-of-Files edits (needed).** worker/index.ts (lifecycle gate in the alarm), src/agent-transport.ts (classify a paused relay),
tests/native-save/server.ts (`POST /__demo/agent-controls`, per-session relay/Watch vars for the spec), tests/agent-transport.test.ts,
tests/agent-cutover.test.ts (response contract), tests/durable-inventory.test.ts and tests/durable-cleanup.test.ts (maintenance now
needs `AGENT_LEGACY_MAINTENANCE: "on"`).

**Commits.** 2fc8ee93 (Sol build), 4c88413b (Claude: relay pause also covers OAuth registration), 86c0c9f3 (review 1); hashes
before `kit pr`'s rebase.

**Tests.** New tests/agent-controls.test.ts (4): parsing (missing, on, off, junk; modern registration off even when "on"); the
three wrangler files hold the defaults; **all 32 combinations**: every paused route 403 `agents-paused` with **0 DO invocations**,
maintenance 404 with 0 DO work even with secrets (401/200 + 1 DO call when on), obsolete routes still 410 with 0 DO work, Watch
off sends no hold and returns the hint, grants kept; all 32 again for lifecycle: off postpones 6 h with 0 deletions and no refire,
on cleans. native-agent-quiet.spec.ts (+2): relay paused: menu opening 0 requests, turn on → 1 `/connections` and the message,
over 10+ simulated minutes visible/hidden no more requests and 0 sockets, one manual Retry = 1 request, manual edit and browser
drafts survive a reload, Disconnect MCP revokes the grant; Watch paused: the menu shows the line, wait_for_requests is quiet with
the hint, write_file still works, 0 extra agent requests. Focused `scripts/agents/unit.sh` (controls, mcp-oauth, transport,
cutover, durable-cleanup/inventory, lifecycle) pass 148 fail 0; `npm run check` ok; eslint on touched files ok (by hand).

**Review** (gpt-6.1-sol, medium, read-only; run.log verified). Round 1 `RESULT: ok review git diff
b7b0127a8c233383e7ac498ac67a929ae3ef2dc7...HEAD evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-29/20261019T013031Z`: fixed 1 (P2 a delayed paused reply from an
off-tab consent check could stop a newer connection: the reply now must come from the same activation and workspace). Rejected 1
(P2 "ship relay/Watch/lifecycle off": the lead's slice decision keeps today's agreed behaviour on; nothing deploys here, and
production enablement stays Lex's separate action). Rejected the suggested browser race test (no agent-menu DOM harness, as
tickets 09/14/18; the guard is one captured-activation predicate).
Round 2 (run by `kit pr` on PR #80, evidence `/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-29/20261019T014655Z`):
no defects. Gaps left open: the same browser race test (reason above) and a successful Retry after the relay is switched back on
(the transport's Retry reopens through the normal path tickets 14/03 already test; noted for ticket 30's rollout evidence).
Round 3 (run by `kit pr` after the rebase, evidence `/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-29/20261019T022450Z`): no defects; the same two gaps.
Landing: rebased over ticket 26 (one conflict in tests/native-save/server.ts: both added `/__demo/*` fixture controls; kept both).

**Kit.**
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok specs 1/1 passed (native-agent-quiet, 9)
- RESULT: ok size boot 355 KB (±0 KB) vs dev@b7b0127, budget 355 KB

Landed: PR #80, merged as f26279d (`RESULT: ok merged #80 f26279d`; kit pr: tier full, check, unit, lint, specs, review, CI ok).
