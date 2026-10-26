---
title: "Live pages up close"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-site-map]
---

## Goal

Zoomed in close, the real page fades in over its picture and can be read ([ticket 04](../../../tickets/04-grill-map-behaviour.md#resolution-2026-10-26); research 01, "Zoom levels for the map"). Size: M.

## Decided behaviour

- From about 600 px wide on screen, the page's live sandboxed frame (the preview's `srcdoc` frame, `src/components/native-preview.ts`) fades in over its picture; at most 3 live at once, each removed when it leaves the screen or drops below the level. Nothing goes blank: the picture stays until the frame has drawn.
- **Scrolling inside a live page** (open in the prototype; lead decision in the README): over a live page, a two-finger scroll or mouse wheel scrolls the page; pinch, or Ctrl/⌘ with the wheel, zooms. Elsewhere on the map the wheel zooms, as before.
- Links inside a live page don't navigate the map; double-click still opens the page in the editor.

## Files

`src/site-map/` (live tile), tests.

## Done when

- A spec zooms into a page until it is live, scrolls it, and checks that a fourth page coming close removes the farthest live one.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-31 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-31 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
