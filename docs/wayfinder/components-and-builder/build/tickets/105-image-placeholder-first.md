---
title: "Every added image starts as the placeholder, even on a new site"
type: task (AFK)
status: closed
assignee: claude-release-lead
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

**Lead decision (2026-10-20, after the first build run):** the rail's Media block is not only images; Add → Media's picker also placed videos, audio, PDFs and online videos. The placeholder now stands for any media: the Media block (click and drop, on a page) always inserts the placeholder image first, and **Replace on a placeholder image opens the Media picker for any media** (picture, video, audio, download, online video), placing it in the placeholder's place as one Undo step, as Add → Media placed it before. Other pictures keep today's Replace rule (a picture spot takes a picture or a video). The `native-media-video.spec.ts` cases that placed media through Add → Media now go Media block → placeholder → Replace → pick, and still check the same outcome (player, still, card, one Undo for the replacement). Keep the edits already in the worktree; continue from them.

## Files

Read the whole ticket (What above) first.

- `src/controllers/block-insert-controller.ts`, `src/page-builder/block-insert.ts`, `src/page-builder/native-elements.ts`
- `src/page-builder/component-model.ts` (`fillMarkup`), `src/page-builder/cards.ts`, `src/page-builder/components.ts` (callers of `fillMarkup` that write)
- where `ports.media` for block insertion is wired (`src/main.ts` or its controller), only to remove the insert path
- `worker/site-conventions.ts` (only if needed)
- Replace on a placeholder: `src/page-builder/media-spot-popup.ts`, `src/page-builder/image-popup*.ts`, `src/page-builder/media-spot-rules.ts` and the picker's place/use path; `tests/native-save/native-media-video.spec.ts`
- tests: `tests/block-insert-controller.test.ts`, `tests/block-insert.test.ts`, `tests/component-model.test.ts`, `tests/card-fill.test.ts`, the browser specs that click or drop Image on a page (find them with `kit specs --affected --list`)
- docs: `docs/page-builder/components.md` or `docs/NATIVE-PROJECT.md` where they say Image opens the picker; this ticket

## Done when

- Unit: Image click and drop on a page insert `<img>` with the placeholder and create `images/placeholder.svg` when it is missing (and not when present), one step; an empty image slot fill and a new default card use the placeholder.
- Browser: on a site with no `images/placeholder.svg`, clicking Image and dropping Image each add a visible placeholder image (natural width > 0), the file appears in the drafts, the picker does not open, and one Undo removes image and file. The existing specs that expected the picker on insert are updated to the new behaviour (not loosened).
- `kit specs --affected` passes.

## Done (2026-10-21)

- Clicking or dropping Media inserts and selects the placeholder immediately, without opening the picker. A missing `images/placeholder.svg` is created with the page change in one Undo step; existing files are kept.
- Empty image-slot fills and default card markup use the placeholder, with missing files created in the same guarded step. Site prefixes, including HTML-escaped prefixes, are respected.
- Replace on a placeholder opens the picker for pictures, video, audio, downloads and online video. Replacement keeps its component slot and undoes in one step. Other pictures retain their existing replacement rules.
- Validation: `kit doctor` passed 7/7; `kit unit --affected` passed 1,994/1,994 across 133 files; `kit specs --affected` passed 132/132 specs. After the escaped-prefix fix, all eight touched browser specs passed again (64 tests). `npm run check` and `npm run lint` passed. Phone and desktop Image popup screenshots passed with zero layout findings.
- Commits: none; changes are left unstaged for the slice runner.
- Picture choices in a placeholder's Replace picker retain the image's classes, unrelated inline styles, description and shape through the existing image swap. Newly selected shapes and centred focus are carried into that same replacement step.
- Follow-up validation: browser regressions cover existing and uploaded pictures with a class and Square shape, including exact source restoration by one Undo and removal of the uploaded file. `kit doctor` passed 7/7; `kit unit --affected` passed 1,994/1,994 across 133 files; touched Image popup and media-video specs passed 35 tests (2/2 specs). `npm run check` and `npm run lint` passed. No follow-up commit was created; changes remain unstaged.
- Filling a plain card from a page without `og:image` now fills an empty image with the prefixed default placeholder, creating its missing file in the same step. Existing card pictures and existing placeholder files are kept; one Undo restores the original card and file state.
- Plain-card fill validation calls `fillCard` directly on cards whose images start empty, checks the title, description and prefixed placeholder, and verifies atomic Undo. Controls cover existing pictures and existing placeholder files. `kit doctor` passed 7/7; `kit unit --affected` passed 1,995/1,995 across 133 files; card browser specs passed 50 tests (3/3 specs). `npm run check` and `npm run lint` passed. No commit was created; changes remain unstaged.
- Empty image-slot fills keep the originating selection, host proof and workspace stamp through asynchronous placeholder creation. A stale action changes neither the page nor the placeholder file, records no Undo step and leaves the current selection alone.
- Await-race validation uses `forEachAwait` to invalidate the selection or `isCurrent()` independently at the slot-plan, placeholder-creation and page-base awaits, with successful control fills. `kit doctor` passed 7/7; `kit unit --affected` passed 1,996/1,996 across 133 files; slot seam, Structure slots and published-slot browser specs passed 23 tests (3/3 specs). `npm run check` and `npm run lint` passed. No commit was created; changes remain unstaged.
