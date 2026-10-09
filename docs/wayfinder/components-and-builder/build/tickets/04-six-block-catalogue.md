---
title: Cut the element catalogue to the six blocks
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 1
---

## What

The hidden element catalogue becomes the block set ([10](../../tickets/10-block-set.md) §1–2, §6, amended by [12](../../tickets/12-prototype-drag-and-drop.md) §3). It is not wired into Add: the rail (slice 28) uses it.

- `src/page-builder/native-elements.ts`: kinds `section`, `div`, `heading`, `paragraph`, `image`, `button`. Markup: `<section class="flow"></section>`, `<div class="flow"></div>`, `<h2>Heading</h2>` (level as an option; slice 29 picks it), `<p>Text</p>`, `<a class="btn" href="#">Button</a>`, and a placeholder `<img src="/images/placeholder.svg" alt="" width="…" height="…">`.
- The placeholder is a site file, `images/placeholder.svg` (decided at handoff, 7): define its SVG here (a neutral frame with an image mark, readable in light and dark, its size matching the `width`/`height`). Inserting writes it the first time and reuses it after (slice 30).
- Delete list, video, embed, divider, the form kinds and Columns/Grid, and the code that refuses Columns/Grid. Keep `nativeElementUrlProblem` and the escaping.
- Wherever the catalogue is offered today (the ⌘K palette's elements, `native-palette-elements.spec.ts`), it offers the six blocks.
- Prototype: `prototype/cb-12-drag-and-drop`, `src/prototype/cb12-core.ts` (`BLOCKS`, `previewMarkup`, `PLACEHOLDER`).

## Done when

- `tests/native-elements.test.ts` asserts each block's markup, the placeholder SVG, and that the deleted kinds are gone.
- `native-elements-compat`, `native-elements-host` and `native-palette-elements` specs pass, trimmed to the six blocks.
