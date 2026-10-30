---
title: "After being away, Connect to MCP tells the truth and copies the prompt"
type: task (AFK)
status: open
assignee: am-51
builder: claude
blocked_by: []
---

## Goal

Lex, 2026-10-30: "when it is connected, and then I go away for a while, the button still says Connect to MCP, but it isn't connected and doesn't copy the prompt." So after time away (tab in the background, laptop asleep, or the agent's connection lapsing), the MCP menu shows a state that doesn't match reality, and pressing Connect to MCP does nothing visible: no prompt on the clipboard, no problem dot. Ticket 99 (clean-up build) made every press either copy or show the problem dot; that promise breaks here. Not yet known: whether this is on the preview, the live editor, or both, and which kind of "away" causes it.

## Decided behaviour

- Diagnose first (diagnosing-bugs loop): reproduce with the editor connected, then each kind of away (tab hidden 10+ minutes, the machine sleeping, the agent's grant expiring, the agent process ending, the editor sign-in nearing its 8 hours), on the preview build. Name the cause in the Done.
- When the menu opens or the tab comes back, it shows the real state: connected (with its agents), or not connected.
- Every press of Connect to MCP either copies a fresh, working prompt or shows the problem dot on the button (ticket 99's rule), also after time away. A prompt whose token has expired is never copied.
- No toasts; feedback stays on the control.

## Files

- `src/components/agent-menu.ts`, `src/agent-resume.ts`, the agent connection state code they read, and their tests (follow the cause)
- `tests/native-save/native-mcp-menu.spec.ts` (a spec for "away, then press")

## Done when

- The cause is named, with a unit test or spec that fails before the fix for each away case that was broken.
- `kit unit --affected`, `kit specs --affected` (RESULT quoted), `kit doctor` pass; UX check on the MCP menu.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit specs --affected`, `kit review`, `kit pr`; report the cause and the RESULT lines.

## Diagnosis (am-51, 2026-10-30)

Reproduced locally on the native-save fixture (real Worker and relay, MCP client agent), Chromium. The failing tests are committed before the fix: `tests/agent-menu-resume.test.ts` (paused rows) and the four "away" specs in `tests/native-save/native-mcp-menu.spec.ts` ("after the reconnect gave up while away…", "a reload after the reconnect gave up…", "a permission that ended while away…", "a sign-in that ended while away…").

- **Cause 1, Lex's report (machine asleep, tab in the background, network gone for a while).** The socket drops; the reconnect (`src/agent-recovery.ts` `schedule`, five tries within two minutes) gives up and writes `paused: "transient"` into this browser's recovery record (localStorage, so it survives a reload). The menu shows `paused`: Connect to MCP with the red dot. A press turns off and on again, and the new socket finds the record paused (`src/agent-transport.ts` `open`, `allowAutomatic()` false). `turnOnAgents` (`src/agent-resume.ts:72`) retries only when the state is `reconnecting`, so in `paused` no branch runs: no retry, no prompt, no copy, no new dot. Nothing clears the record except a retry, so every later press and reload does the same. Repro (real timing, socket cut until the tries ran out): state `paused`, press, state `paused`, clipboard unchanged; after a reload the press goes `taking-over` → `paused`, same result. The same code is on `main` (`turnOnAgents` and the recovery are identical), so the live editor has it too.
- **Cause 2, sign-in ended.** A press whose reads answer signed-out turns agents off (`failed` → `turnOff(true)` in `src/components/agent-menu.ts`); the press then sees its activation gone and returns with nothing shown (`turnOnAgents` after `read`, `start` inside its `made()` catch, `copyAgain` after its read). Repro: state `off`, no copy, no dot.
- **Cause 3, stale state on return.** Coming back to the tab reads the connections only while the button offers Wait for MCP or shows the failed dot (`wake`), and opening the menu reads nothing. A permission past its 8 hours, or an ended sign-in, still shows Disconnect MCP until something else reads. Repro: Disconnect MCP stays after the list went empty.
- **Not broken:** the agent process ending leaves its connection (Disconnect MCP is true: the permission still holds; its row leaves the agents list after ten minutes, ticket am-12). A tab hidden 10+ minutes was not reproduced on its own (headless Chromium does not throttle or freeze it); a hidden tab whose socket drops goes through the same reconnect, and when its tries run out it ends as cause 1.

### Fix plan

1. `turnOnAgents`: a press that finds the reconnect paused by the recovery (not by the site owner: `ports.paused()` false) retries it, as for `reconnecting`, then branches as before (copy again, new prompt, or stuck).
2. Agent menu: a press during which the sign-in ended shows the problem dot on its site (`failedOn`), copying nothing. A resume that finds the sign-in ended stays `off` (native-agent-lifecycle spec).
3. Agent menu `wake`: when the tab comes back or the menu opens (a popover holding the menu toggles open), with remote agents on, read the connections when the button offers Disconnect MCP and the last read is at least 5 minutes old (Wait for MCP and the failed dot keep their 2 s rule). The 5 minutes keep native-agent-live's "one hub read on return, no polling".
