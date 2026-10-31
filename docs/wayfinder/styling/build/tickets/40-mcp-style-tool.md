---
title: "Agents style through the same writer"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [11-writer-looks-classes-tokens]
---

## Goal

An agent makes the same change a person makes, with the same CSS ([ticket 05](../../tickets/05-grill-where-styles-go.md#resolution-2026-10-26)). Size: M.

**Waits for** the agents and multiplayer build (map 1) released, for its tool and relay shape.

## Decided behaviour

- A new MCP tool `style_element`: `path`, `element` (id, selector or selection), `target` (`element`, `look`, `site-class`, `token`), optional `look`, `state`, `part` and `size`, and `properties` (set or clear). The open tab runs slice 10's writer, as edits do today; refusals come back plainly (changed source, `--accent` literal, unknown look).
- `inspect_preview` reports each matched rule's scope (slice 13).
- The conventions resource (`worker/site-conventions.ts`) tells agents to use the tool rather than editing CSS by hand where they can, and repeats the good-css rules it writes by.

## Files

Expected: `worker/mcp.ts`, the tab-side handler, `tests/mcp-runtime.test.ts` (names and count), `docs/mcp.md` (36 → 37 tools), `worker/site-conventions.ts`.

## Done when

- A test calls `style_element` for the hero's padding and gets the same file text as the panel's spec.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-40 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-40 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
