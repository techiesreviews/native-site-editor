---
title: Images are re-checked after a move, in the move's own Undo step
type: task (AFK)
status: open
assignee: claude (mm-88 runner)
blocked_by: [33-placed-image-markup]
builder: sol
phase: 2
---

## What

Ticket [08](../../tickets/08-responsive-image-output.md#resolution-2026-10-13) "Size hint" and "Loading order": `sizes` and the loading order (eager or `loading="lazy"`, `auto, `, `fetchpriority="high"`) are re-checked whenever an image is placed, replaced **or moved**. Slice [33](33-placed-image-markup.md) did place and replace; its Done section leaves the move out, because the re-check can only join the move's Undo step if the draft store's groups are tagged (today any grouped write on the same file joins an open group, so a keystroke in a component field during the measurement could join the move).

- **Tagged groups.** A grouped draft-store write carries a tag; it joins the open group on top of the journal only when the tags match (today's untagged typing keeps working as it does). The tag reaches the store from guarded-edit's `group` key through the workspace and the source editor.
- **The move opens a group.** Every block or section move (canvas drag, Alt+arrows and the Section Move buttons, Page Structure rows, MCP `move_section`; all go through `createBlockMoves` in `src/page-builder/block-move.ts`) that moves a placed image (an `<img>` with `sizes`) or can change which images are on the first screen writes its step as a group with its own tag.
- **The re-check joins it.** Once the preview has rendered the moved page, the editor re-measures (slice 32's `measure-image`) the placed images inside the moved block and the page's image list, and rewrites `sizes`, `loading` and `fetchpriority` by slice 33's rules (moved placed images follow their own first-screen fact; other placed images whose first-screen fact changed follow it; one priority holder for the page; hand-written images change only for the priority holder). The rewrite joins the move's group with the same tag, then the group closes: one Undo step takes back the move and the re-check together; Redo restores both.
- **When it cannot join.** Another edit, Undo, a page switch or a failed or timed-out measurement before the rewrite: no rewrite, no separate step, the group closes. The move itself is never held back by the measurement.
- **Boot stays flat.** The re-check rules and orchestration load lazily (dynamic `import()`); boot grows by well under 1 KB.
- **Not here.** The re-check after a shape change: slice [38](38-place-shape-and-focus.md) re-measures `sizes` after a shape change itself.

## Done when

- `tests/draft-store.test.ts`: a tagged group joins only its own tag; untagged typing unchanged; a different tag or an ungrouped write starts a new step; close ends it.
- Unit tests for the pure re-check rule (which images change after a move, both directions across the fold, priority holder moves, hand-written images kept) and for the move/re-check orchestration (joins the move's step; skipped when another edit, Undo or a failed measurement came first; group closed afterwards).
- Browser spec (`tests/native-save/native-image-markup.spec.ts` or the move specs): move a lazy placed image block to the top of the starter's home page; it becomes eager (no `loading`, no `auto`) and the former first-screen image becomes lazy; one Undo puts both the order and the markup back; Redo restores both.
- Existing move, structure and typing specs keep passing; full suite green (draft-store and Undo are shared plumbing).
