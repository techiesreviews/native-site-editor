---
title: Click a block to insert it by selection
type: task (AFK)
status: closed
assignee:
blocked_by: [28-block-rail, 29-heading-level-from-position]
builder: claude ★
phase: 4
---

## What

Ticket [12](../../tickets/12-prototype-drag-and-drop.md) §2–4.

- A pure rule for where a clicked block goes: a selected Section or Div takes it inside, at the end; a selected leaf takes it right after, in the same container; a Section always goes after the selection's page band; with nothing selected, a Section goes after the last band and other blocks into the last Section (or a new one).
- The new block is selected, so the next click builds on it; Esc goes up a level.
- A label flashes at the new block ("Into Section › after Heading"); a refusal flashes the red reason and inserts nothing.
- Writes go through `nativeMarkupInsertEdit` (`src/page-builder/native-operations.ts:312`), one undo step each. Build the insert as one helper that slice 35 (drag) and slice 43 (templates) reuse.
- The Image block's placeholder is the site file `images/placeholder.svg` (decided at handoff, 7; its SVG is defined in slice 04): the first Image insert writes it in the same undo step (one `applyNativeOperation` with the page edit); later inserts reuse it, whatever its content. A selected instance takes the block into its items slot once slice 40 lands; until then it refuses with the reason.
- Prototype: `prototype/cb-12-drag-and-drop`, `src/prototype/cb12-rail.ts` (`clickTarget` `:85`, `flash` `:154`), `cb12-core.ts` (`whereText` `:299`).

## Done when

- Unit tests for the rule: each selection case, nothing selected, Sections never nested.
- Nightly spec: the first Image insert drafts `images/placeholder.svg` and one undo removes both; a second insert writes no file.
- `@smoke` spec (for example `tests/native-save/native-blocks.spec.ts`): click Section, Div, Heading, Paragraph: the page holds `<section class="flow"><div class="flow"><h3>…</h3><p>…</p></div></section>`, each insert one undo step.

## Done (2026-10-09)

- Clicking a rail block inserts it by selection (`clickTarget` in `src/page-builder/block-insert.ts`; Sections only between bands, other blocks only into a Section or Div, a component refuses until slice 40). The new block is selected, a label flashes under it ("Into Div › after Heading"), a refusal flashes its red reason, and Escape on the rail goes up a level. `src/controllers/block-insert-controller.ts` `insert` is the one helper for slices 35 and 43: one `applyNativeOperation` per block; the first Image also creates `images/placeholder.svg` in that step (drafted SVGs now show in the preview). Loaded on the first click; boot JS +1.2 KB gzip.
- Commits 763f3a8, c93499f, cba1851 (the last two from Sol's review: the click's proof held across the lazy load, stale painted selections refused, the selection request waits for the step's own render, undo pinned to the page's editor).
- Tests: `tests/block-insert.test.ts`, `tests/block-insert-controller.test.ts`, `tests/native-save/native-blocks.spec.ts` (`@smoke` Section › Div › Heading › Paragraph with one undo each; nightly placeholder draft, reuse and undo; refusal); `native-block-rail.spec.ts` expects the click to insert.
