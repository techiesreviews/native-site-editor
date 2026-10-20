---
title: "Every added image starts as the placeholder, even on a new site"
type: task (AFK)
status: open
assignee:
blocked_by: [10-block-set]
builder: sol
phase: 3
---

## What

Lex (2026-10-20): "When adding an image, always first use placeholders. Even on new projects."

Today the Image block on a page writes nothing: a click or a drop opens the media picker for the place (`ports.media` in `src/controllers/block-insert-controller.ts`, `click` and `drop`), and the image arrives only once a file is picked. Only in Edit component mode does it insert the placeholder (`insertPlan`: `images/placeholder.svg`, created in the same step when the site lacks it). And the editor writes `<img src="" alt="">` (a broken image) where it fills an empty image slot (`fillMarkup` in `src/page-builder/component-model.ts`) and in the default card template (`src/page-builder/cards.ts`).

Change:

- **The Image block always inserts the placeholder first**, on a page as in a template, by click and by drop: the block's markup with `images/placeholder.svg` (written with the site's prefix, as `blockMarkup` does), the file created in the same step when missing (a new or empty site included), one Undo step, the new image selected. The picker no longer opens on insert; the image is replaced afterwards from the selected image as any image is (its edit bar). Remove the `media` port's insert path if nothing else uses it.
- **An image the editor makes for an empty image slot uses the placeholder too**: `fillMarkup`'s image case and the default card template in `cards.ts`, with the placeholder file created in the same step when missing. Each caller that writes such markup must carry the `creates` (guarded edit) so the file and the page change are one step. `card-swap.ts`'s `src=""` is overwritten at once with the kept image; leave it.
- `worker/site-conventions.ts`: if the conventions tell agents how to add an image without a real one, say to use `/images/placeholder.svg` (copy into the starter's AGENTS.md and refresh the fixture if the chapter changes); otherwise no change.

## Files

Read the whole ticket (What above) first.

- `src/controllers/block-insert-controller.ts`, `src/page-builder/block-insert.ts`, `src/page-builder/native-elements.ts`
- `src/page-builder/component-model.ts` (`fillMarkup`), `src/page-builder/cards.ts`, `src/page-builder/components.ts` (callers of `fillMarkup` that write)
- where `ports.media` for block insertion is wired (`src/main.ts` or its controller), only to remove the insert path
- `worker/site-conventions.ts` (only if needed)
- tests: `tests/block-insert-controller.test.ts`, `tests/block-insert.test.ts`, `tests/component-model.test.ts`, `tests/card-fill.test.ts`, the browser specs that click or drop Image on a page (find them with `kit specs --affected --list`)
- docs: `docs/page-builder/components.md` or `docs/NATIVE-PROJECT.md` where they say Image opens the picker; this ticket

## Done when

- Unit: Image click and drop on a page insert `<img>` with the placeholder and create `images/placeholder.svg` when it is missing (and not when present), one step; an empty image slot fill and a new default card use the placeholder.
- Browser: on a site with no `images/placeholder.svg`, clicking Image and dropping Image each add a visible placeholder image (natural width > 0), the file appears in the drafts, the picker does not open, and one Undo removes image and file. The existing specs that expected the picker on insert are updated to the new behaviour (not loosened).
- `kit specs --affected` passes.
