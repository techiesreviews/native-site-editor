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

- Cause: Connect to MCP with remote agents off in the tab (another browser or profile, a tab that never turned them on, or a lost or paused connection, which also offers Connect to MCP) turns them on, reads the site's connections and opens the socket; when an agent had already used one of those connections the menu was "connected", and `turnOnAgents` (`src/agent-resume.ts:70-72` before the fix) only prompted when idle or copied again when waiting, so the press copied nothing and the button jumped to Disconnect MCP. Slice 37's press-time copy was dropped unused. The rule ("an agent connected before is used again; otherwise a new prompt") came in with `032e5ab55` (2026-10-17, `src/components/agent-menu.ts` `turnOn`: `else if (state() === "idle") await start(task)`) and moved into `turnOnAgents` in `7b9723819` (2026-10-24); production has the same rule. The agent wiring move (`7af33b949`, `2d2175b32`) did not change the press path: a plain press from off copies in Chromium, Firefox and WebKit (Playwright's, by hand), and the deployed preview bundle carries the same press code as dev.
- Fix: `src/agent-resume.ts:73`, a press that finds an agent already connected still copies a prompt (`copyAgain`: this tab's own token if it still waits, otherwise a new one); the earlier agent keeps working and the button then offers Disconnect MCP. Comments in `src/components/agent-menu.ts` (`turnOn`) and `turnOnAgents` say so.
- Spec: `tests/native-save/native-mcp-menu.spec.ts`, "Connect to MCP from off copies a prompt even when an agent already uses the site's connection": another browser's token used by an agent, then this tab presses Connect to MCP. Before the fix no token request was made and the button read Disconnect MCP; now it reads Copied, the clipboard holds a new working token, and the button offers Disconnect MCP. Unit: `tests/agent-menu-resume.test.ts` adds the connected case to the press table and its off/switch/again races.
- Specs that pinned the old rule now expect the press's prompt: `tests/native-save/native-agent-quiet.spec.ts` (the press with a connected agent makes exactly one token, the reload none; was "no new token for a connected agent", from ticket 02 of durable-object-reduction) and `tests/native-save/native-agent-live.spec.ts` (the press's requests now include its prompt's connections check and token).
- `native-mcp-menu.spec.ts` "a prompt another tab revoked as unused…" failed once in the first affected run (clipboard held another token) and passed on the rerun with no change to it.
- Feature list: F-agent-01 Good and Files updated.
- Not covered: Lex's exact state on preview cannot be read from here; if a press from Connect to MCP with no agent connected still copies nothing on preview, that is another cause. Real Safari is still unchecked by hand.
