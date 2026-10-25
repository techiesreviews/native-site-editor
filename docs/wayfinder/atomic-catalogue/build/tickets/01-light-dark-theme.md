---
title: "Dark mode written with light-dark()"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Make light and dark side by side possible on the board, with nothing in the editor looking different ([board ticket 07, item 5](../../tickets/07-grill-board-look-and-use.md#resolution-2026-10-25)). The very first slice.

## Decided behaviour

- `:root` gets `color-scheme: light dark`; every themed colour is written once as `light-dark(<light>, <dark>)` instead of a `@media (prefers-color-scheme: dark)` block.
- Shadows that differ by theme keep their own values (`light-dark()` takes colours only).
- `src/theme.ts` keeps its `matchMedia` for Monaco.
- Research: `git show origin/research/ac-02-board-on-a-canvas:docs/wayfinder/atomic-catalogue/research/02-board-on-a-canvas.md`, "light and dark side by side".

## Files

- `src/theme.css` (dark block at about line 205), `src/components/structure-editing.css`, `src/page-builder/media-adding-summary.css`, `src/page-builder/media-picker.css` (the four files with `prefers-color-scheme: dark` today)
- `docs/editor-colors.md` (how to write a themed colour now)

## Done when

- No `prefers-color-scheme: dark` left in `src/**/*.css` (`grep` in Done).
- `kit shots --compare dev` shows no visible change in light or dark.
- A themed element under `color-scheme: dark` inside a light page shows dark colours (unit or spec).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-01 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-01 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots --compare dev` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review against the [UX rulebook](../../../../agents/ux-rulebook.md).
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.
