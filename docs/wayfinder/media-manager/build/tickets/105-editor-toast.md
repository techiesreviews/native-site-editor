---
title: One visible confirmation: a toast for the whole editor
type: task (AFK)
status: closed
assignee: claude (mm-105 runner)
blocked_by: [89-ux-ui-audit]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#c2-one-visible-confirmation-leads-note-6), finding C2, and the lead's note 6 (slices 80 and 81 left their results screen-reader only).

- One toast for the editor: one line, past tense, naming the thing, with at most one action (Undo or Show). About 44 px tall, 8 px radius, inverse surface (dark on light, light on dark), 13–14 px text, 16 px side padding. It sits bottom-centre 16 px from the edge on computer and tablet, and full width minus 8 px on phone, always above any pinned action row. It stays 6 s, longer while hovered or focused, and a new toast replaces the old one. References: Fibery, Linear and Google Photos snackbars (audit, Mobbin notes part 10).
- `announce()` (`src/main.ts:3840`) shows its text as this toast and keeps the `#status` live region for screen readers. Site settings results ("Updated 95 links in 13 files…", "Added the .nojekyll file…") become visible.
- Media's result lines (Replace everywhere, Remove, Restore, Vimeo bar, Improve images, Adding settings) use the toast instead of a status line at the bottom of the screen; no success text in a warning colour.
- A screen's own status line is cleared when you leave that screen (no "Removed 3 files" under Improve images, no Vimeo line under the Replace confirm).
- Errors stay inline next to their field.

## Done when

- A spec: Site settings → change the address → Update links shows a visible toast naming the count; Undo in the toast works; the live region still gets the text.
- A spec: a Media status line does not carry over to the next screen.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Done (2026-10-15)

**Behaviour.** `announce()` (`src/main.ts`) still writes `#status` and now also shows its text as the editor toast (`src/components/toast.ts`, `toast.css`, pure rules in `toast-rules.ts`). The toast is one line naming the result, with at most one action. It uses the inverse surface (`--text` on `--surface`) with an 8 px radius, a minimum height of 44 px, 13 px text and 16 px side padding. It sits bottom-centre 16 px from the edge on computer and tablet; on a phone it is full width less 8 px, 8 px from the edge. It lifts itself above visible primary buttons and `[data-toast-avoid]` rows in its layer, for slice 104's pinned rows. It stays 6 s and is held while hovered or focused (at least 2 s more after). A newer toast replaces it, and it goes as soon as `#status` says something else (a refusal, another page loading). It is a manual popover in the topmost open modal dialog or popover, so it is never inert under a modal and a click on it never closes the explorer. It follows layers as they open and close. It loads lazily on first use.
- Guarded edits pass `{ undo: <file> }`, so a toast for a whole step (Site settings, page and file operations, structure edits) carries **Undo**. Undo is offered only while that step is the newest one anywhere (`draft-store` `latestUndo`); a click after a newer step refuses with "Newer changes came after this one…".
- Kept screen-reader only (`"quiet"`): component-mode notes ("Editing the X component…", "X is inside Y…") and typing-group keystroke steps. Load progress (`status()`) and refusals never went through `announce()` and are unchanged. Errors stay inline.
- Media: `LibrarySheetContext.done()` sends results to the toast (Replace everywhere, Remove, Clean up and its Undo, Restore, Vimeo bar, still picture, Improve images, Adding settings, details saved, collections, To check). `tell()` stays the inline warning line, which every screen change now clears (the sheet's version setter). So no "Removed 3 files" under Improve images and no Vimeo line under the Replace confirm. No success text in the warning colour any more.

**Commits.** 30f2ba20, 18d0ba28 (claim); 23511ec0 (toast, wiring, media results); 3128fb3f (specs use the editor's own Undo; layers); 0d11f8e4 (review: follow the topmost layer); 92482a95 (re-review: no layer inside the toast).

**Tests.** New `tests/native-save/native-editor-toast.spec.ts` (4 tests):
- Site settings → Update links shows a visible toast naming "Updated 74/9 links…"; its Undo takes the change back, and `#status` still has the text.
- A Media inline warning clears on the next screen, and a result is a toast.
- The toast follows the explorer and a modal, its Undo works there, and its 6 s timer plus hover and focus hold work (Playwright clock).
- A preparation question opening over a toast.

New unit tests: `tests/toast-rules.test.ts` (lift, resume) and a `latestUndo` case in `tests/draft-store.test.ts`. 11 specs that clicked a page-wide "Undo" now click `.code-editor__undo`, and 7 media specs read results from the toast. Runs:
- Full native-save suite (3 shards): 1060 passed, 5 failed; all 5 were the Undo locators and one moved result, all fixed.
- Touched default specs: 145 passed. `@actual` group: 58 passed.
- Toast and media specs with CI fonts: 68 + 46 passed.
- check, lint, and unit (3,430 tests).

**Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-105/{before,after}/` on the real starter at 390, 768 and 1280, light and dark: Site settings result, Replace confirm and result, Clean up result, and Improve images as the next screen.

**Review.** GPT-6.1 Sol, read-only (`.scratch/reviews/mm-105/review-1`, `review-2`).
- Review 1 found a P2: a toast in the page stayed under a newly opened modal. Fixed in 0d11f8e4, and the gaps it listed got a browser test and a unit test.
- Review 2 found a P2: the preparation question could mount inside the toast. Fixed in 92482a95, with a regression spec and the focus-hold check.
- Nothing rejected. Both result.md files note that a nested `codex exec` inside the run failed on the read-only sandbox, which is harmless per the brief.

**Byte budget.** Boot is 347 KB before and after (budget 355 KB). The main bundle is +0.36 KB gzip (the `announce` wiring and the Undo guard). The toast chunk is 1.35 KB JS plus 0.69 KB CSS gzip, lazy.

**Follow-ups.** Slices 108, 111, 112, 113 and 115 use `h.done()` for results and may add an action. Slice 113 rewrites the Replace result's words. Slice 104 can mark its pinned action rows with `data-toast-avoid`.
