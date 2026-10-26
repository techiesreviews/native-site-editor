---
title: "Connect to MCP copies the prompt again"
type: task (AFK)
status: open
assignee: lead-99 (child thread)
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
- Write the failing spec before the fix.

## Files

`src/components/agent-menu.ts`, the agent wiring host it moved to (`src/agent-site-host.ts` or wherever the press now enters), `tests/native-save/native-mcp-menu.spec.ts`.

## Done when

- A spec that fails before the fix and passes after, covering the cause found; the existing MCP menu specs pass.
- The Done section names the cause with file and line and the commit that introduced it.
- `kit unit --affected`, `kit specs --affected`, `npm run check` green; landed with `kit pr`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `ASE_OWNER=lead-99 ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`.
