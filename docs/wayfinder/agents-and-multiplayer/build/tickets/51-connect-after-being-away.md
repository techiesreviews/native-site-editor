---
title: "After being away, Connect to MCP tells the truth and copies the prompt"
type: task (AFK)
status: closed
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

## Done (2026-10-30)

Causes, as diagnosed above: (1) a reconnect that gave up while away leaves the connection `paused`, and Connect to MCP only retried a `reconnecting` one, so the press did nothing, on every press and reload; (2) a sign-in that ended during a press turned agents off and the press ended with no copy and no dot; (3) a return to the tab or the menu opening never re-read the connections while the button offered Disconnect MCP, so an expired permission or ended sign-in kept showing it.

- `src/agent-resume.ts` `turnOnAgents`: a press finding the connection paused by the reconnect (not by the site owner) retries it, as for a reconnect, then copies again, makes a new prompt or shows the press stuck. A retry that leaves it paused (it did nothing while a retry time is still ahead or another read runs, or it failed again) shows the press stuck: the failed dot, until the connection moves on or the next press.
- `src/agent-resume.ts` `pressSignedOut`, wired by the menu's `press`: a press during which the sign-in ends, copying nothing, shows the problem dot on the site it was pressed for (read before its first await), not on one shown since; a newer press begun meanwhile shows its own outcome. A resume that finds the sign-in ended still stays off.
- `src/components/agent-menu.ts` `wake`: offering Disconnect MCP, opening the menu reads the connections once 2 seconds have passed since the last read (the user looking, as Wait for MCP and the failed dot already did); a return to the tab or its focus reads once the last read is at least 5 minutes old: one read after time away, no polling.
- Tests that failed before the fix: the paused rows in `tests/agent-menu-resume.test.ts` and the four "away" specs in `tests/native-save/native-mcp-menu.spec.ts`.
- More unit tests (`tests/agent-menu-resume.test.ts`): a press whose socket finds the site owner's pause while it opens neither retries (which would lift that pause) nor prompts (fails without the owner check on the retry); a retry that leaves the connection paused shows the press stuck, also with a retry time still ahead, where still reconnecting waits for it with no dot; the press's sign-out mark under `forEachAwait`, with a newer press or a site switch at its await.
- More specs (`tests/native-save/native-mcp-menu.spec.ts`): the real recovery, the relay cut and its tries fast-forwarded with the page clock, gives up by itself, and the press then copies a new prompt; offering Disconnect MCP, coming back after 2 and 4 minutes reads nothing, opening the menu reads once, another popover reads nothing, coming back after 10 minutes reads once, and the window regaining focus after 6 minutes reads once; a sign-in that ends during a Wait for MCP press, or a Connect to MCP press that makes a new connection with agents on, shows the problem dot and leaves the clipboard as it was; one that ends after another branch is shown marks the press's own branch, not the one shown.
- Where it was reproduced: locally on the native-save fixture (the real Worker and relay), not on the preview build: this build may not deploy, and a preview repro needs a real GitHub sign-in and an agent there. The live editor's answer comes from its code being the same as on `main` (`turnOnAgents`, the recovery). A tab hidden 10+ minutes and a machine asleep were not reproduced as their own cases: headless Chromium neither throttles nor freezes a hidden tab, and sleep is stood in for by the cut relay and the page clock.
- UX check on the MCP menu: no new control, label or toast; every press ends in Copied or the problem dot on the button. The UX review found the button (and Download unsaved changes) 32 px tall at 390 px: `src/components/agent-menu.css` now gives it the theme's tap floor, `max(var(--size-control), var(--size-tap))`, so it is 44 px on phones and touch screens and 32 px with a mouse (HS18).
- Validation (last round): `RESULT: ok doctor 11/11 checks passed`; `RESULT: ok unit 835/835 (31 files)` (kit unit --affected); `RESULT: ok specs 1/1 passed` (`native-mcp-menu.spec.ts`, 45 passed); `RESULT: ok specs 4/4 passed` (native-agent-lifecycle, -live, -quiet, -recovery); earlier rounds ran `kit specs --affected` (`RESULT: ok specs 17/17 passed`); `npm run check` and `npm run lint` pass.
- Feature list: F-agent-01 Good line updated (state after time away).
