---
title: "One home for inline formatting, text runs and phrasing tag sets"
type: task (AFK)
status: closed
assignee:
blocked_by: [20-runtime-bundle]
builder: sol
phase: 2
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/frame-protocol-design.md (sections 3, 4.1). Does not need sturdy slice 10.

`src/page-builder/rules/text-level.ts`, each set with one sentence on what it means:

- `INLINE_FORMATTING` (formatting inside a line of text): replaces runtime `INLINE_TAGS` (:2860; the runtime adds `slot` at its use sites in templates), component-model `inline` regex (:53, with `slot`) and `INLINE` (:478), native-insert.ts `INLINE` (:29), main.ts:1686, card-grid.ts `INLINE` (:176).
- `TEXT_RUN_TAGS` (one Page structure row): runtime `TEXT_RUN` (:1680) and component-model `run` (:54), identical today.
- `HTML_PHRASING` (HTML's phrasing content, for where an element may go): native-operations `phrasing` (:235). `TEXT_LEVEL` (text-level semantics, "formatting is content"): card-swap.ts `PHRASING` (:73). Different concepts, kept apart and named.

**Disagreement this fixes (bug):** card-grid's list has `data`, `var`, `del`, `ins`; the others do not. Add card resets `<p>Was <del>£40</del> £30</p>` as one text, but the canvas will not type into it, its slot is "content" not "text", and Make component treats it as a block. **Lead decides** the one list (proposed: the 24 with `data var del ins`); the visible change (such paragraphs become typeable) gets a screenshot on preview.

## Done when

- `tests/rules-text-level.test.ts` pins the sets; `tests/canvas-gesture.test.ts`, component-model and card-grid tests green, plus one case per consumer for a `<del>` paragraph.
- No inline/phrasing tag list left outside `rules/text-level.ts` (checked by slice 28's guard; until then by `rg '"strong", "em"|strong\|em' src`).
- `native-canvas`, `native-text*`, `native-cards`, `native-make-component*` specs green; `npm run check`, `npm test`, full `native-save` suite green.

## Done (2026-10-10)

- `src/page-builder/rules/text-level.ts` holds `INLINE_FORMATTING` (card-grid's list, with `data var del ins`), `TEXT_TAGS` (the canvas's typeable elements; replaces the runtime's `TEXT_TAGS` and main.ts's `nativeTextTags` + formatting), `TEXT_RUN_TAGS`, `HTML_PHRASING` and `TEXT_LEVEL`. The runtime, component-model, native-insert, main.ts, card-grid, card-swap and native-operations import them; their eight copies are gone (`slot` added by the runtime and the template reader where they use the list).
- Behaviour: a line like `<p>Was <del>£40</del> £30</p>` is now typed into on the canvas, one Structure row, a "text" slot, a Make component text slot, copied as a slot fallback, and page content inside a card instance.
- Commits b5e6701c, 5de73b32 (built by Claude, reviewed by Sol: no defects; a Structure check added for its validation gap).
- Tests: `tests/rules-text-level.test.ts`, `<del>` cases in card-grid, native-insert, template-structure and component-model tests, and one native-text spec. Unit 1,632/1,632; full native-save 873 passed, 56 skipped; smoke 42/42; @actual 54/54.
