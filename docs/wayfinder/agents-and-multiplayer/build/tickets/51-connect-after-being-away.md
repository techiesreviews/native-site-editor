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
