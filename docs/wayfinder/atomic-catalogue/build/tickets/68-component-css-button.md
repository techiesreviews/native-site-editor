---
title: "Editor CSS: component-based on the Techies Framework layers, Button first, board shows its CSS"
type: task (AFK)
status: open
assignee: fleet-lead
builder: claude
blocked_by: [67-tweak-panel]
---

## Goal

Lex (2026-11-11, Orbit card TOOLS-207): "I rather have direct access to all relevant css for this component … instead of everything living in ui/dom.ts and style.css. I want to use my own techies.tools framework to edit this directly in css, component based, so each component gets its defaults. So using layers to determine the priority."

## Decided behaviour

- A short plan maps today's CSS onto the layers `tokens`, `elements`, `components` plus the editor's own unlayered screen CSS, one CSS file per component with its own `--<component>-*` defaults, and orders the migration slices: [css-layers-plan.md](../../css-layers-plan.md).
- Pilot: the Button in its own component CSS file on the components layer, with `--btn-*` defaults after the Framework's `.btn` shape. The editor looks the same (`kit shots --compare dev`); the boot budget of 355 KB holds with no waiver (Lex's decision B).
- On the design board, selecting the Button shows its CSS file in the right panel, readable and editable live: edits apply to the Live cell only, Reset puts it back, and "Send to agent" copies the changed CSS. It replaces the Tweak fields for parts that have their own CSS file. No toasts or explainers.
- The generated framework files are never edited by hand; the editor keeps its own layered files.

## Files

`src/ui/parts/button.css` (new), `src/style.css`, `src/theme.css`, `src/utilities.css`, `src/live-guest.css`; `src/catalogue/css-file.ts` (new), `src/catalogue/css-panel.ts` (new), `src/catalogue/component-css.ts` (new), `src/catalogue/main.ts`, `src/main.ts`, `src/catalogue/board.ts`, `src/catalogue/board.css`, `src/catalogue/parts.ts`, `src/catalogue/tweak.ts`, `src/catalogue/tweak-panel.ts`; `scripts/agents/one-offs.mjs`, `scripts/agents/one-offs.json`; `tests/editor-css-layers.test.ts` (new), `tests/catalogue-css-file.test.ts` (new), `tests/one-offs.test.ts`, `tests/native-save/native-catalogue-board.spec.ts`; `docs/wayfinder/atomic-catalogue/css-layers-plan.md` (new), `docs/agents/code-map.md`.

## Done when

- The plan is in the repo docs.
- The Button's whole look lives in `src/ui/parts/button.css` on the components layer with its `--btn-*` defaults; no other editor stylesheet holds its rules.
- `kit shots --compare dev` shows the editor unchanged; `kit size` shows the boot at 355 KB or lower.
- Selecting the Button on the board shows its CSS file; an edit changes the live cell only, Reset puts it back, Send to agent copies the changed CSS.
