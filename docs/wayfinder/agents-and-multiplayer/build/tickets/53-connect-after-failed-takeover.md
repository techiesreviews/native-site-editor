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

- Behaviour: after an earlier failed takeover (the site's stored record left paused in this browser), Connect to MCP no longer does nothing. `turnOnAgents` (`src/agent-resume.ts`) now retries the takeover when the socket ends in `takeover-failed` (not when the site owner paused), then copies a prompt as for any other found state. If the takeover fails again, the press is marked stuck and `takeover-failed` keeps the problem dot. The menu wires the new `takeover` port to `transport.takeover()` (`src/components/agent-menu.ts`).
- Unit: `tests/agent-menu-resume.test.ts` has a new matrix, "Connect to MCP after a failed takeover", covering each outcome after the takeover plus the two owner-paused cases, and the off/switch/again race test now includes `takeover-failed`. Before the fix it failed (4 of 18).
- Spec: `tests/native-save/native-mcp-menu.spec.ts` has a new test, "after a failed takeover, Connect to MCP takes over again and copies a working prompt; the agent keeps working". It pauses the stored record, reloads, expects `takeover-failed` with the danger dot, then presses and expects Copied, a new token on the clipboard and the earlier agent still working. Before the fix it failed (no connect request).
- Feature list: F-agent-01 Good updated.
