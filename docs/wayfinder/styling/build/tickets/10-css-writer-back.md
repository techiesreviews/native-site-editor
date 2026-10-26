---
title: "The CSS writer comes back"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Bring back the old style panel's CSS writer from git and make it the one place that turns "this property, on this target, at this size and state" into a change in a real stylesheet ([ticket 05](../../tickets/05-grill-where-styles-go.md#resolution-2026-10-26); research 02, section "The old style panel", `git show origin/research/st-02-components-and-old-panel:docs/wayfinder/styling/research/02-components-and-old-panel.md`). Size: M–L.

## Decided behaviour

- Restore `src/page-builder/css-write.ts` and `tests/css-write.test.ts` from `1aada9c8c^` (`git show 1aada9c8c^:src/page-builder/css-write.ts`), adapted to today's code. All 40 old cases pass again.
- What it keeps from before: `locateWriteRule` and `writeCssProperties` reuse a matching rule, keep `@layer`, indentation, CRLF and comments, and **refuse** a source that changed since it was read (the caller re-reads and retries once).
- **Sizes:** the target carries the canvas size from `src/page-builder/breakpoints.ts` (`all`, `tablet`, `mobile`). Tablet writes inside `@media (max-width: 768px)`, Mobile inside `@media (max-width: 390px)`, reusing an existing block with exactly that condition; compound conditions stay separate. A new base rule goes before the file's first `@media` block, so size rules still win.
- **States:** the target can carry one state and one part (`:hover::before`, ticket 03 round 3).
  - Hover is written inside `@media (hover: hover) and (pointer: fine)` (good-css).
  - Hover and focus are shared by default: the same declarations go to the guarded `:hover` rule and to `:focus-visible`, until the person splits them (ticket 04).
  - Never writes `outline: none`.
- **Clearing:** removing a property deletes the declaration; a rule left empty is deleted, and an `@media` block left empty goes too.
- Pure text in, text out, no DOM, so the panel and the MCP tool (slice 40) call the same function.

## Files

Expected: `src/page-builder/css-write.ts` (restored), `tests/css-write.test.ts` (restored, plus cases for hover guarding, shared focus, one state plus one part, clearing and empty-block removal), `docs/agents/code-map.md`.

## Done when

- The 40 old cases and the new ones pass; nothing imports the writer at boot.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-10 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-10 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
