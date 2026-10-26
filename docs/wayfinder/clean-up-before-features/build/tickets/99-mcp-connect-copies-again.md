---
title: "Connect to MCP copies the prompt again"
type: task (AFK)
status: closed
assignee: lead-99
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-26, on preview-editor.techies.tools): "when pressing connect with mcp, the prompt is not copied." Slice 37 (#160, 2026-10-24) fixed the same complaint by starting the clipboard write inside the press (`reserveCopy` / `pressCopy` in `src/components/agent-menu.ts`), and Lex's end check on 2026-10-25 passed it. Since then `7af33b949` "Agent wiring leaves main.ts" and its review rounds (`2d2175b32`) moved the agent wiring; later slices changed the editor around it. Find why the copy no longer lands for a real press on the preview editor and fix it.

## Decided behaviour

Unchanged from [37](37-mcp-copy-keeps-the-click.md): pressing **Connect to MCP** or **Wait for MCP** always puts a working prompt on the clipboard and the button confirms ("Copied"), in Chrome, Edge, Safari and Firefox; a failed token request copies nothing and shows the problem dot (no toast).

## How to find it

- Reproduce first, in a real press: the native MCP menu specs (`tests/native-save/native-mcp-menu.spec.ts`) pass on dev, so look for what they don't cover: the path a press takes now (lazy loading of the menu or its wiring before the click handler runs, an `await` before `reserveCopy`, a re-render that replaces the button, a second handler), the preview's real hub timings, Chromium vs WebKit vs Firefox.
- Compare the press path on `origin/main` (production, where Lex has not reported it) and `62e9f347b` (slice 37 merged) with `origin/dev`; bisect if needed.
- Lex's browser (2026-10-26, later): he pressed in T3 Code's integrated browser, an Electron webview, not Chrome, and the button did nothing visible: no "Copied", no problem dot. Check:
  1. Whether the press reaches the handler at all there: a swallowed click, a handler not bound, an exception thrown before `reserveCopy`.
  2. How `navigator.clipboard.write`/`writeText` and `ClipboardItem` behave in an Electron webview: a permission prompt that never shows, a rejected promise that leaves the button unchanged, a write that never settles (`reserveCopy`'s "never settles" row, `src/components/agent-menu.ts` ~947, ends in neither Copied nor the dot).
- The button must always end in Copied or the problem dot, whatever the clipboard does (bound a write that never settles).
- Write the failing spec before the fix.

## Files

`src/components/agent-menu.ts`, the agent wiring host it moved to (`src/agent-site-host.ts` or wherever the press now enters), `tests/native-save/native-mcp-menu.spec.ts`.

## Done when

- A spec that fails before the fix and passes after, covering the cause found; the existing MCP menu specs pass.
- The Done section names the cause with file and line and the commit that introduced it.
- `kit unit --affected`, `kit specs --affected`, `npm run check` green; landed with `kit pr`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `ASE_OWNER=lead-99 ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`.

## Done (2026-10-26)

- Cause 1, no visible change (Lex's report from T3 Code's Electron webview): the copy begun in the press waited on the browser's clipboard write with no time limit (`src/components/agent-menu.ts:966`, `await written;` in `reserveCopy`'s `put`, then `writeText` likewise), so a write that never settles ended in neither Copied nor the problem dot and left the clipboard as it was. Introduced by `62e9f347b` (slice 37, 2026-10-24), whose settle matrix left that row without an outcome. Fix: `src/components/agent-menu.ts:996-1016` (`put` through `settled`), each write is bounded by `COPY_DEADLINE` (3 s once the text is known): a hung write falls through to `writeText`, and a hung `writeText` shows the problem dot. The button is pressable again either way. A write that was given up on cannot be cancelled, so a late landing is made harmless (`landedLate`, `src/components/agent-menu.ts:751`). If its prompt is still the menu's newest, the button confirms Copied and the dot it caused clears. If a newer prompt was copied since, that newer prompt is written back. Its token is kept from the stale-token clean-up in `start` (`src/components/agent-menu.ts:659`), so a late prompt still works. The full settle matrix sits on `reserveCopy`.
- Electron checks (Electron 44.7, Chrome 152, the version T3 Code Nightly runs; a `<webview>` on a `persist:t3code-preview-…` partition with T3 Code's own permission handlers, guest sandboxed with contextIsolation off and a debugger attached, presses sent as real mouse input against the native-save test server): (1) the press reaches the handler: the click lands on the button, `navigator.userActivation.isActive` and `document.hasFocus()` are true when `clipboard.write` starts, and nothing throws before `reserveCopy`. (2) `ClipboardItem` exists. With T3 Code's handlers (they grant `clipboard-sanitized-write` at once), `clipboard.write` asks once and the prompt lands, and the button reads Copied. With the permission request left unanswered, `clipboard.write` never settles: the button read Wait for MCP with no Copied and no dot, and the clipboard kept its old text, which is Lex's report. After the fix the same run ends on the problem dot about 3 s later via a bounded `writeText`. T3 Code's shipped handler answers at once, so which condition held the write on Lex's machine is not confirmed. Whatever the clipboard does, the button now ends in Copied or the dot.
- Cause 2, a press that copied nothing and jumped to Disconnect MCP: Connect to MCP with remote agents off in the tab (another browser, a tab that never turned them on, or a lost or paused connection, which also offers Connect to MCP) found an agent already using the site's connection, and `turnOnAgents` (`src/agent-resume.ts:70-72` before the fix) only prompted when idle. The rule came in with `032e5ab55` (2026-10-17) and moved into `turnOnAgents` in `7b9723819` (2026-10-24). Fix: `src/agent-resume.ts:75`, that press branches on what the button would offer, as the menu's own press does. Offering Wait for MCP or Disconnect MCP copies again (this tab's waiting token, otherwise a new one): when an agent is connected, and also in another tab's states (`other-owner`, `taken-over`) with a connection in use. Offering Connect to MCP makes a new prompt when idle or when another tab receives; the earlier agent keeps working, and the button then offers Disconnect MCP. This reverses durable-object-reduction ticket 02's "Connect re-uses the connected agent without a new token", following this ticket's decided behaviour ("always puts a working prompt on the clipboard"); ticket 02 has a dated note saying so.
- The agent wiring move (`7af33b949`, `2d2175b32`) did not change the press path. A plain press from off copies in Playwright's Chromium, Firefox and WebKit, and the preview's deployed bundle carries the same press code as dev.
- Specs in `tests/native-save/native-mcp-menu.spec.ts`. All six new ones fail on the code before the fix and pass after:
  - "a clipboard write that never settles": Copied through `writeText`.
  - "no clipboard write ever settles": the problem dot, never Copied, and the next press tries again.
  - "Connect to MCP from off copies a prompt even when an agent already uses the site's connection" (another browser's token).
  - "a lost connection with this tab's agent connected": a new token is copied, the earlier agent still answers `get_site`, then Disconnect MCP.
  - "a copy that lands after its deadline": the dot clears, Copied shows, and the prompt is on the clipboard.
  - "an older copy that lands after a newer prompt was copied": the newer prompt is written back and works through an agent.
- Other tests: `tests/agent-menu-resume.test.ts` adds the connected, `other-owner` (connection in use: copy) and `taken-over` (nothing connected: new prompt) rows, each with its off/switch/again races. `native-agent-quiet.spec.ts` waits for the press's prompt on the clipboard, then expects one token from the press and none after a reload (it was "no new token for a connected agent"). `native-agent-live.spec.ts` waits for Copied, then checks one token and only connections reads.
- Feature list: F-agent-01 Good and Files updated.
- Not covered: real Safari, and T3 Code itself (the checks used a webview harness that copies its settings).
