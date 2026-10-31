---
title: "One selector field: classes, looks, states and modern selectors"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [30-style-panel-shell, 11-writer-looks-classes-tokens, 13-rule-scope]
---

## Goal

The Bricks-style CSS Selectors field of the [prototype](../../prototypes/03-styling-panel.html) ([ticket 03](../../tickets/03-prototype-styling-panel.md#resolution-2026-10-26), [ticket 04](../../tickets/04-grill-panel-scope.md#resolution-2026-10-26)). Size: L.

## Decided behaviour

- **One field, all chips:** the element's classes, its look and its state are chips. There are no id or class fields. The filled chip is what is being styled.
- **Scope on every chip** (slice 13): Site-wide, This component or This look, plus the file name under the field.
- **Typing searches one list** of: classes on this element, site classes, looks, states and the modern selectors that fit the element, each with a plain name beside the code:
  - all: Hover, Focus (`:focus-visible`), Pressed (`:active`), `:focus-within`, `::before`, `::after`, `::selection`, First, Last and Odd items, `:has()` (for example "Has an image"), `:empty`, and `@starting-style` ("When it appears");
  - fields: `:disabled`, `:checked`, `:user-invalid`, `:user-valid`, `:placeholder-shown` and `::placeholder`;
  - lists: `::marker`; details: `[open]` and `::details-content`; popovers: `:popover-open`;
  - components: `:state(…)` for the states the component declares; positions and states on a component go on the host (`:host(:nth-child(odd)) article`).
- **One state plus one part** at a time (ticket 03, round 3). Longer chains are written in the code editor.
- **×** on a class removes it from the element (the HTML changes, the rule stays); on a state or look it goes back to normal. Backspace in an empty field removes the last state.
- **New:** typing a name that doesn't exist offers **New site class** or **New look** (slice 11). Editing a site class is allowed and its chip says Site-wide.
- **Screen size** is a small device chip at the end of the field, showing the canvas size (slice 34). Its × goes back to all sizes.
- ⋯ holds **Clear styles** for the current selector.

## Files

Expected: `src/style-panel/selector-field.ts`, `src/style-panel/selectors.ts` (the modern-selector table, filtered by element), unit tests for filtering and chip building, a spec adding Hover to the hero button and a class to a card.

## Done when

- On the starter's email field, typing `inv` offers `:user-invalid`; on the FAQ, `open` offers `[open]`; neither shows on a heading.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-st-32 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-st-32 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)). The panel and everything it needs load lazily; the lazy chunk's size is quoted in Done.
- `kit shots` for anything visible, light and dark, 390 and 1280 wide.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
