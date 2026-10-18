---
title: "Dispatch editing tools through atomic browser execution"
type: task (AFK)
status: closed
assignee: dor-16
blocked_by: [15-browser-read-tools, 07-atomic-structural-edits]
builder: sol
phase: 3
---

## What

Adapt text/page/section/component/file tool handlers to one browser dispatch using existing guarded transformations. Preserve hashes, protected-path checks and receipt status lookup.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md), [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [relay research](../../research/live-relay-and-cleanup.md).

## Files

- `src/agent-tools-edit.ts`
- `src/agent-tools.ts`
- `src/agent-site.ts`
- `worker/mcp.ts`
- `tests/agent-tools-edit.test.ts`

## Done when

- Unit tests and existing browser spec `native-mcp.spec.ts`: ≤**4 control-path invocations**, **0 result polls**, duplicate commands apply once.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Do not perform a separate context dispatch before mutation dispatch; that would exceed the control-path target.

## Done (2026-10-18)

**Behaviour.** The MCP edit tools edit_file, write_file, move_file, delete_file, create_page, set_page_details,
open_page, make_component, add_section, move_section, remove_section, and inspect_preview make ONE relay dispatch
(`{operation:"edit", tool, args, id, grantId, generation, createdAt}`) to the workspace's owner tab, with no context
read before it. The Worker keeps only context-free argument checks (schemas, protected paths, content size, ids, tags).
The tab (`src/agent-tools-edit.ts`, loaded lazily with the transport from the agent menu, registered through
`src/agent-tools.ts`) prepares the command from its own drafts with the same code the Worker used
(`shared/agent-edit.ts` `prepareAgentEdit`: read + hash proof, replacements, unchanged, folder/parent-file, page,
outline hash, component and placement checks; `shared/agent-replacements.ts`), then runs it through tickets 06/07's
guarded transformations and owner-fenced staged commits. Result contracts are kept (`requestId`, `state`, `message`,
`result`; isError on conflict/failed/unknown; make_component's live fields).
- **Receipts first.** The receipt is looked up by operation id BEFORE preparation, against an identity over the tool
  request (tool + args + branch), not the derived text: a duplicate edit_file returns the recorded outcome instead of
  failing its now-stale hash, and is never applied again; the same id with different work or another grant is refused;
  in-flight duplicates join one run. Unchanged requests (fenced by the revision read before preparation; no
  drafts written) and open_page also get a receipt, so their id stays reserved; inspect_preview writes none.
- **get_command_status** is a receipt lookup in the tab over one dispatch (authorization rechecked by
  `records.receipt`); no receipt → `unknown`, never replayed.
- **update_active_draft / create_file_draft** take the staged text commit (drafts + receipt), so they are no longer
  refused live; place_media, frame_image, loop_video stay refused (ticket 17).
- **Outcomes.** Relay `timeout`/`unknown-outcome`/lost socket → `unknown` with "check get_command_status; do not
  replay"; a command the relay proves it never sent (`outcome:"not-sent"`: busy, too large, expired before delivery)
  → `failed`, nothing changed. The Worker never retries. `waitSeconds` is accepted for compatibility; the relay's
  10 s deadline governs.
- **Legacy fallback** (until ticket 20): only on `editor-unavailable` with a matching legacy-shared context in
  authentication's hub snapshot does the old current()+queue() path run (same `prepareAgentEdit`); otherwise the
  not-sharing message at once, no wait or poll.
- **Not migrated.** Media tools (ticket 17) and request tools wait_for_requests, reply_to_request,
  get_selection(request) (ticket 18). Every non-media edit tool was migrated.

**Measured (usage harness, real SessionStore relay).** Already-authorized edit_file, its duplicate and
get_command_status: **4 DO HTTP invocations each** (3 `auth` + 1 dispatch), **0 result polls**, 0 data calls,
0 server draft key reads, 0 Worker GitHub fetches, 0 virtual ms waited (vs about 30 with 25 polls before);
duplicates: 1 draft, 1 history step, 1 executor run.

**Out-of-Files edits (needed).** shared/agent-edit.ts, shared/agent-replacements.ts (new, one preparation for both
sides), shared/agent.ts (`requestIdentity`; `applyReplacements` moved), src/agent-transport.ts (edit/status
dispatch kind, receiptless set), src/components/agent-menu.ts (lazy edit registry), src/agent-tools-read.ts
(`agentFileReader` exported), tests/agent-transport.test.ts, tests/mcp-runtime.test.ts, new
tests/native-save/native-agent-edits.spec.ts.

**Commits.** 4d6aa932 (Sol build), 41fce5a7 (not-sent outcomes; Claude), 0973c850 (review 1: socket spec; Claude).

**Tests.** New tests/agent-tools-edit.test.ts (11): every tool's prepared command shape from browser drafts;
hash/unchanged/protected-path/content/folder/parent-file and page/section/component/placement contracts; duplicate
edit_file joins in flight and returns the receipt before re-reading a changed hash; unchanged receipts; stale
preparation and unknown persistence never run again; real-relay counts above; legacy fallback only with matching
context; timeout/lost → unknown with exactly 1 dispatch, not-sent → failed; update_active_draft/create_file_draft
commit drafts + receipt, duplicates add no Undo step; authorization in the in-flight identity; `forEachAwait`
revision change at every preparation await never reaches the executor. New native-agent-edits.spec.ts (fixture
socket, no page mocks): edit_file applies once, duplicate and get_command_status equal the receipt with unchanged
durable drafts/receipts, one Undo restores and a redelivery after Undo does not reapply, id reuse refused, unknown
status; write/move/delete_file, set_page_details, create_page, open_page, inspect_preview, add_section (duplicate =
receipt, no second section), move_section, remove_section, make_component; 0 context/drafts/claim/ack HTTP.
native-mcp.spec.ts still runs on the legacy fixture path (its relay is forced absent) and passes; the 4-invocation
count is asserted by the harness and the socket spec instead.
`npm run check` ok; `npm run lint` ok; `scripts/agents/unit.sh` pass 4401 fail 0 (by hand).

**Review** (gpt-6.1-sol, medium, read-only; run.log verified). Round 1 `RESULT: ok review git diff
fb3ba43d5f3376b0d9f3c91f1bf2a1f04e3a59c1...HEAD evidence .scratch/reviews/dor-16/20261018T122811Z`: fixed 1
validation gap (socket coverage of section/component tools, 0973c850). Rejected 1 (P2: resubmitting an id after its
receipt and retired marker expired can apply again): that is a new agent call past ticket 06's 24 h retention, not
a late delivery or automatic replay; keeping an issue record across retries would need durable server state on the
control path, which ticket 07 forbids; text edits still need a current hash; legacy behaved the same.

**Kit.**
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok size boot 355 KB (±0 KB) vs dev@fb3ba43, budget 355 KB
- RESULT: ok specs 147/147 passed (`--affected`)
- RESULT: ok specs 1/1 passed (native-agent-edits, after review 1)

Landed: PR #59, merged as 3a0d9ad8 (`RESULT: ok merged #59 3a0d9ad`; kit pr: check, unit, lint, specs, review, CI ok).

Follow-up (landing review round 2, gpt-6.1-sol, medium, read-only; `RESULT: ok review … evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-16/20261018T131941Z`; read after the merge): fixed 3 in a
follow-up PR — a status lookup the relay never delivered was reported as a failed change (it is now `unknown`; only
mutation dispatches map not-sent to failed); a revision change or lost socket after the executor committed relabeled
the edit a conflict (after the executor runs, its own commit decides the reply); an unchanged receipt was committed
against a revision read after preparation, so a manual edit meanwhile could not be fenced (unchanged requests now
record no receipt: a redelivery finds the same text again or a hash conflict, never an application). Tests: two new
(mutation checked), the unchanged test now asserts no receipt and a conflict after a manual change.
`npm run check` ok; `npm run lint` ok; `scripts/agents/unit.sh` pass 4403 fail 0 (by hand);
RESULT: ok specs 2/2 passed (native-agent-edits, native-mcp 18).

Follow-up 2 (landing review round 3 on PR #60, merged as 4a2d73d4, gpt-6.1-sol, medium, read-only; `RESULT: ok review …
evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-16/20261018T135243Z`): fixed 1 — round 2's
"no unchanged receipt" left the id unreserved, so the same id could then run different work or another grant (P2).
Unchanged requests record a receipt again, now committed against the workspace revision read before preparation
(an agent commit meanwhile refuses it; it writes no drafts, so manual work is never touched). Test rewritten
(reuse for different work, another grant, a new tools instance; agent commit during preparation), both mutations
checked. Focused: tests/agent-tools-edit.test.ts pass 13 fail 0; check, unit, lint, specs by `kit pr`.

Follow-up 3 (landing review round 4 on PR #63, merged as b9839d2, gpt-6.1-sol, medium, read-only; `RESULT: ok review …
evidence /home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-16/20261018T141944Z`): no defects. Fixed the nit:
the unchanged-receipt race now waits for an explicit "context entered" promise instead of a 10 ms delay. Rejected in
part the `forEachAwait` request for the unchanged receipt: ownership, revocation and cancellation are proved inside
`records.commit`'s transaction (ticket 06/07 tests), and the preparation awaits are already covered by "a changed
revision at every preparation await never reaches the guarded executor".
