---
title: "Route remaining media tools through the same executor"
type: task (AFK)
status: closed
assignee: dor-17
blocked_by: [16-browser-edit-tools, 08-atomic-media-edits]
builder: sol
phase: 3
---

## What

Adapt media reads/edits/settings to browser execution and durable media commit path. Preserve current result limits and explicit timeout/unknown outcomes.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md), [traffic budgets](../../tickets/07-set-request-budgets-and-rollout.md), [relay research](../../research/live-relay-and-cleanup.md).

## Files

- `src/agent-tools-media.ts`
- `src/agent-tools.ts`
- `src/agent-media.ts`
- `src/agent-media-actions.ts`
- `worker/mcp.ts`
- `tests/agent-tools-media.test.ts`

## Done when

- Unit tests and existing browser spec `native-mcp-media.spec.ts`: no legacy queue/storage result path; aggregate buffering stays ≤8 MiB.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Encoding may exceed 10 seconds; cancel before commit or reconcile an already-committed result. Do not silently extend deadlines.

## Done (2026-10-18)

**Behaviour.** Every media MCP tool (list_media, preview_media, remove_media, keep_media, restore_media, replace_media,
frame_image incl. trim, place_media, improve_images, loop_video, video_still, write_subtitles, describe_media,
change_collection, adding_settings) makes ONE relay dispatch (`{operation:"media", tool, path, args, id, grantId,
generation, createdAt}`, shared/agent-media.ts) to the owner tab, with no context read before it. The Worker keeps only
its context-free checks and each result contract (list_media's parsed report, preview_media's image item + JSON text,
report parsing, isError). The tab (`src/agent-tools-media.ts`, lazy with the transport, registered through
`src/agent-tools.ts`) runs reads with no receipt; changes go receipt-first like ticket 16 (identity over tool + path +
args + branch; duplicate → recorded outcome, id/grant reuse refused, in-flight join; get_command_status finds them),
then through ticket 08's durable media commit (bytes first, then drafts + receipt in one owner-fenced transaction).
- **place_media, frame_image (trim), loop_video** now stage too: their media-controller transforms run against
  buffering ports, so trim/placement bytes are staged first and the page draft + receipt commit together; the page
  source the tab sees on admission (before the receipt lookup and any module load) is the commit proof. The live `receiptless` refusal is gone.
- **Deadline.** The relay stamps `remainingMs` on each command frame at send (after any delayed handshake); the tab
  fences the commit at arrival + remaining − 1 s and cancels before commit (records tombstone) when it passes; the 10 s
  is never restarted and clocks are never compared. A commit that still lands after the relay gave up (frame delayed
  > 1 s) was answered `unknown` by the Worker and is reconciled by its receipt (status/duplicate → applied).
- **Outcomes.** not-sent → failed; timeout/unknown-outcome/lost → unknown ("check get_command_status; do not replay");
  too-large before delivery → clear "too large" error, nothing stored; too-large after delivery of a change → unknown;
  a receipt read failing after the run → unknown, never conflict. Reads: a clear error, never retried. Results stay
  under MEDIA_LIST_LIMIT / MEDIA_PREVIEW_LIMIT and the 8 MiB envelope.
- **Legacy queue path.** After this ticket no MCP tool uses the hub queue/result-poll path except: (1) the temporary
  legacy fallback (editor-unavailable with a matching legacy-shared context in authentication's hub snapshot; edits,
  media and get_command_status), until ticket 20; (2) wait_for_requests, reply_to_request, get_selection(request)
  (ticket 18).
- `inspect_media` (lead's list) is not a tool; the media read forms are list_media, preview_media, restore_media
  without files, adding_settings without changes, frame_image without changes, loop_video without `looping`.

**Out-of-Files edits (needed).** shared/agent-media.ts (new: request contract, read/change split), worker/agent-relay.ts
(`remainingMs` per frame; deadline fence needs the relay's own clock), src/agent-transport.ts (media dispatch kind,
receiptless set removed, arrival deadline), src/components/agent-menu.ts (lazy media registry), src/main.ts (adapter
moved into the lazy chunk, boot ±0), src/agent-site.ts (read forms of frame/loop never navigate), src/agent-tools-read.ts + src/agent-site-host.ts (optional
live `source` port for that proof),
tests/agent-transport.test.ts, tests/agent-relay.test.ts, tests/mcp-runtime.test.ts, tests/native-save/native-mcp-media.spec.ts
(now over the fixture socket, no `useLegacyRelay`).

**Commits.** 539fb211 (Sol build), 52611a17, 70574618, 3d48d86a (review 1), ed44987b (review 2), 84192dd3 (review 3) (Claude); hashes before
`kit pr`'s rebase.

**Tests.** New tests/agent-tools-media.test.ts (13): registry and read forms without receipts; read-only loop never
navigates; duplicate/in-flight join/id and grant reuse; deadline, relay budget, cancel, disconnect before commit apply
nothing; oversized reads; trim bytes durable before the records transaction, no second encode; `forEachAwait` revision
change at every await for adding_settings, frame_image and loop_video; the main adapter refuses when the page is edited
during module/workspace loading, and the executor refuses when the page is edited while its receipt lookup waits
(both mutation checked); real relay: **3 auth + 1 dispatch, 0 result polls, 0 server draft
fetches**; commit after the deadline → Worker unknown, status applied; post-run receipt AbortError → unknown, status
applied (mutation checked); relay failures never retry, too-large after delivery → unknown (mutation checked). Relay:
frame carries the remaining budget after a delayed handshake. Transport: deadline = arrival + remaining − 1 s.
native-mcp-media.spec.ts (5) passes over the socket. Focused unit runs by hand (`scripts/agents/unit.sh` on the touched
tests: pass 244 fail 0); full check/unit/lint run by `kit pr`.

**Review** (gpt-6.1-sol, medium, read-only; run.log verified). Round 1 `RESULT: ok review … evidence
.scratch/reviews/dor-17/20261018T140653Z`: fixed 2 (a fresh 10 s browser deadline extended the relay's total deadline:
now the relay's remaining budget; a post-run receipt read failure reported conflict: now unknown) + race coverage for
frame/loop. Round 2 `RESULT: ok review … evidence .scratch/reviews/dor-17/20261018T143106Z`: fixed 1 (the adapter took
its page proof after module loading: now the page seen on arrival). Rejected in part 1 (P1: transit delay beyond the
margin can still commit after the relay gave up): one-way latency cannot be bounded without comparing clocks; the margin
is 1 s, and such a commit is reported unknown by the Worker and reconciled by its receipt, never silent; telling the tab
when the relay expires a call is ticket 19's relay/executor cancellation. Not added: a place_media await race in Node
(it decodes through DOM Image; it stages through the same proof as frame/loop).
Round 3 (run by `kit pr`, `RESULT: ok review … evidence .scratch/reviews/dor-17/20261018T145248Z`): fixed 1 (the page
proof was still taken after the executor's hashing and receipt lookup: now on admission, through an optional live
`source` port). Rejected 0. `kit pr` was stopped before merge to land the fix.

**Kit.**
- RESULT: ok doctor 7/7 checks passed
- RESULT: ok size boot 355 KB (±0 KB) vs dev@b9839d2, budget 355 KB
- RESULT: ok specs 5/5 passed (native-mcp-media 5, native-agent-edits, native-agent-reads, native-agent-live 2, native-mcp 18)
- RESULT: ok specs 2/2 passed (native-mcp-media 5, native-agent-live 2; after review 2)
- First `kit pr`: check, unit, lint, specs ok; PR #65 opened; stopped while CI ran (review 3 fix)
- RESULT: ok size boot 355 KB (±0 KB) vs dev@57d25a1, budget 355 KB (after review 3)
- RESULT: ok specs 4/4 passed (native-mcp-media 5, native-agent-live 2, native-agent-reads, native-agent-edits; after review 3)
- Second `kit pr`: RESULT: fail specs 1 of 70 failed: native-mcp.spec.ts (Ask agent history, `locator.fill` 2 min timeout under
  load; no media code), then alone RESULT: ok specs 1/1 passed
- Third `kit pr`: check, unit, lint, specs ok; CI failed in tests/agent-usage.test.ts ("an empty default wait takes requests 18
  times…": MCP client request timed out on the runner, as in ticket 14; passes locally); CI rerun refused, so this note retriggers it

Landed: PR #65, merged as 4b42ebd8 (`RESULT: ok merged #65 4b42ebd`; kit pr: check, unit, lint, specs, review, CI ok).

Follow-up (landing review round 4, gpt-6.1-sol, medium, read-only; evidence
/home/ubulex/Projects/native-site-editor/.scratch/reviews/dor-17/20261018T161135Z; read before CI finished): fixed 1 in a
follow-up PR (9036f317) — the agent menu awaited the lazy media executor before the page proof was taken; the transport now
reads the page synchronously when the frame arrives (before readiness, the ownership proof and module loading) and
carries it to the executor (tests: arrival read once and passed through; an edit before admission refuses with nothing
run, mutation checked). What remains is inherent: the media tools take no page hash, so an edit between the agent's
get_page and the frame's arrival is not detectable. `scripts/agents/unit.sh` (agent-transport, agent-tools-media):
pass 58 fail 0; RESULT: ok size boot 355 KB (±0 KB) vs dev@4b42ebd; RESULT: ok specs 2/2 passed (native-mcp-media, native-agent-live).
