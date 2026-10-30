---
title: "Connect to MCP works after a failed takeover too (follow-up on 51)"
type: task (AFK)
status: closed
assignee: am-53
builder: claude
blocked_by: [51-connect-after-being-away]
---

## Goal

Slice 51 (PR #272) fixed the dead Connect to MCP press after time away. Its review left the same kind of fault in one more state ([ticket 51 Follow-ups](51-connect-after-being-away.md#follow-ups)): after an earlier failed attempt to make this tab the one that receives agent changes (the takeover), the problem dot is red but pressing Connect to MCP does nothing.

## Decided behaviour

- Every press of Connect to MCP copies a fresh, working prompt or shows the problem dot (ticket 99's rule), in this state too: the press retries the takeover, then copies.

## Files

- `src/components/agent-menu.ts`, `src/agent-resume.ts` and the takeover code they call, their tests
- `tests/native-save/native-mcp-menu.spec.ts`

## Done when

- A unit test or spec for "takeover failed, then press" fails before the fix.
- `kit unit --affected`, `kit specs --affected` (RESULT quoted), `kit doctor` pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit specs --affected`, `kit review`, `kit pr`; report the RESULT lines.

## Done (2026-10-30)

- Behaviour: after an earlier failed takeover (the site's stored record left paused in this browser), Connect to MCP no longer does nothing. `turnOnAgents` (`src/agent-resume.ts`) now tries the takeover again when the socket ends in `takeover-failed`, then copies a prompt as for any other found state. A press makes one takeover attempt: when the socket's opening already tried one in this press (the site was not paused, and its own takeover failed), the menu does not try again (`triedTakeover`, set when the menu sees `taking-over`, reset on each turn-on). If the takeover fails again, the press writes nothing more: `takeover-failed` is itself the problem dot. The menu wires the new `takeover` port to `transport.takeover()` (`src/components/agent-menu.ts`), and its owner-pause rule is now `ownerPause` in `src/agent-resume.ts`: only `paused` with the relay's message, never `takeover-failed`.
- Unit: `tests/agent-menu-resume.test.ts` has a new matrix, "Connect to MCP after a failed takeover", covering each outcome after the takeover (nothing written when it fails again) (also `quota` and `unavailable`: nothing written) plus the owner pause known before the press, and the off/switch/again race test now includes `takeover-failed`. Before the fix it failed (4 of 18). A further test pins `ownerPause`: owner-paused, then `takeover-failed`, then a reconnect that gave up read true, false, false.
- Spec: `tests/native-save/native-mcp-menu.spec.ts` has a new test, "after a failed takeover, Connect to MCP takes over again and copies a working prompt; the agent keeps working". It pauses the stored record, reloads, expects `takeover-failed` with the danger dot, then presses and expects Copied, a new token on the clipboard and the earlier agent still working. Before the fix it failed (no connect request). A second spec, "a takeover that fails again on the press", holds the lock for the next fence so the press's takeover fails: the state passes through `taking-over` and ends at `takeover-failed` with the danger dot, the label stays Connect to MCP, no prompt is made and the clipboard is unchanged; with the lock released, the next press copies a working prompt. A third spec, "a press whose own takeover fails tries it once", starts with agents off and the site not paused, holds the next fence's lock, and expects one `taking-over`, then `takeover-failed`, the danger dot, no prompt and the clipboard unchanged; the next press takes over and copies. Without the one-attempt guard it failed (a second takeover went through and copied).
- Size: the lazy `agent-menu` chunk grows by 67 B gzip (10,926 → 10,993) against `ca806cde9`; the cold-start `index` chunk is unchanged apart from chunk-name hashes (±3 B).
- Feature list: F-agent-01 Good updated.
- Validation (last round): `RESULT: ok doctor 11/11 checks passed`; `RESULT: ok unit 855/855 (32 files)`; `kit specs --affected`: `RESULT: fail specs 1 of 17 failed: native-lazy-panels.spec.ts` ("Files works again after a failed chunk load and recovery", a test this change does not touch, under a load average of 25), and rerun alone `RESULT: ok specs 1/1 passed`; the three takeover specs alone: 3 passed; `npm run check` and `npm run lint` pass.
