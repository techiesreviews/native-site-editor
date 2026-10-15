---
title: More room for the page on phones
type: task (AFK)
status: closed
assignee: claude (mm-117 runner)
blocked_by: [104-media-panel-size]
builder: claude
phase: 8
---

## What

Lex's answer to the audit's [Q3](../ux-ui-audit.md#questions-for-lex) (2026-10-15): on phones the page being edited gets only about 90–150 px, so the edit bar covers the selection and double-click, Play and checking a result hardly work.

- On phones (narrow layout only), while the page is being edited, Page structure and the code fold into a pull-up sheet with a small handle, so the page takes most of the screen. Pull up (or tap the handle) to bring them back; the sheet remembers its last height for the session.
- The edit bar never covers the selected element: it sits above or below the selection, whichever has room.
- Wider screens are unchanged. This is editor-wide, not only media: check text editing, blocks, components and the Add panel on a phone.

## Done when

- Specs at 390×844: selecting a picture leaves it fully visible with the edit bar; double-click on a picture opens the picker; the sheet opens and closes by tap and drag; keyboard users can reach it.
- Shots at 390 and 768, light and dark, before and after, of editing text, a picture, a video, and the sheet open.
- Full suite (`scripts/agents/full-suite.sh 3`) green; boot budget unchanged.
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Done (2026-10-15)

**Behaviour.**
- Upright phones (≤ 650 px wide and ≥ 500 px tall; the existing column layout), while a page is on the canvas: the page takes most of the screen and Page structure and the code sit in a sheet under it, folded at first. A 36 px handle ("Page structure and code", a grip pill, 44 px hit area) opens or folds it by tap, Enter or Space. A drag follows the finger 1:1 (rubber band past the tallest), showing the panes as it rises, and settles by distance or flick: below 96 px or a flick down folds; a flick up opens to at least the last height; otherwise it stays where let go, at least 160 px and leaving the page 160 px. ArrowUp/ArrowDown resize by 40 px from the height shown, Home folds, End is tallest. The state lasts for the session (sessionStorage `ase.phone-sheet`). The open sheet gives Page structure 55 % and the code 45 % (a hidden pane gives its share back). Showing a pane another way (the command palette) opens a folded sheet. Folding with the focus inside gives it to the handle. At 390×844 the canvas goes from 144 px to 543 px.
- Nothing moves in the DOM: `.workspace` becomes a 5-row grid and `<main>` a subgrid over the page, handle, structure and code rows (`phone-sheet.css`, gated by `@supports (grid-template-rows: subgrid)`); `--sheet-size` is a registered, non-inherited length, moved by a 400 ms iOS-curve transition (none under reduced motion). The behaviour (`phone-sheet.ts`, rules in `phone-sheet-rules.ts`) and the handle's grip and states (`phone-sheet-handle.css`) load only once the phone query matches.
- The edit bar on phones (≤ 650 px wide): a new selection the bar would cover is scrolled clear of it 400 ms after it is chosen (after a double-click's second press could land), the shorter way that keeps the selection in view (`roomScroll`); if the page could not scroll that way (its top or end), the other way once. The same happens when the canvas changes height (the sheet) and has settled, never on a scroll. A selection too tall for itself and the bar stays pinned as before.
- The Add panel docks over the page and sheet while the sheet is in use. Inside the sheet the code and structure grips still hide and restore their panes; the sheet's handle sizes the sheet.
- Wider screens and phones on their side are unchanged (768 and 1280 shots and geometry identical before and after; no sheet script requested).

**Commits.** e8d8a294, 758af876 claim; 4a4928b2 build; 6716e083 upright phones only, specs open the sheet; 7fb9d2ee no window scroll when folded, 55/45, lazy handle look; db07562c review 1 fixes; 75a78075 re-review fix.

**Tests.**
- Unit: `tests/phone-sheet-rules.test.ts` (bounds, drag, settle, keys, stored state), `tests/edit-bar-room.test.ts` (room above/below, sticky header, too tall, the other way). Unit 3480/3480; check and lint pass.
- New `tests/native-save/native-phone-sheet.spec.ts` (12): at 390×844 the page takes most of the screen and the window never scrolls; a tapped picture stays fully visible with the bar clear; double-click opens the picker; a covered selection is scrolled clear; at the page's top the other way, and still clear after the sheet opens; a video plays from its bar, in view and clear; open and fold by tap and by drag (panes shown before release), remembered after reload; a cancelled drag folds again; after the window shrinks the first ArrowDown shrinks the sheet; keyboard reaches the handle (Tab from the rail), opens, resizes, folds, focus returns; text, Page structure, the Add panel and the palette with the sheet; a component edited from the open sheet; 568×320 keeps the column; 768 and 1280 unchanged. 12/12, and 14/14 with the newest spec under CI fonts.
- Updated for the sheet (they open it first): `native-block-rail` (the rail is a row right above the page), `native-resize-toggle` (opened by key so its focus-ring check holds), `native-code-visible` (390×650, and the 568×320 case's 650 px step), `native-panel-collapse` (390: toggles in the sheet; End-grows only on wide screens).
- The lead's `native-media-newest.spec.ts` "in the picker a file just added…" (failing 4/4 on dev at 390: the bar covered `.hero img`) passes 4/4 with `--repeat-each=4`; the hero sits at the page's top, which the other-way retry fixes.
- 21 phone-touching spec files: 203 passed; the 6 layout failures were updated above.
- Full suite (`full-suite.sh 3`, on 75a78075): shards 1 and 3 passed 368 and 364 with 1 failure; shard 2 ran 395 of 396 with no failure before the run hit its time limit, and its last file (`native-org-repositories.spec.ts`) then passed 8/8. The one failure, `native-settings-layout.spec.ts:83`, fails on dev itself (at 758af876, dev plus this ticket's claim only): `getByLabel("Default social image")` also matches the "Choose default social image" button; it needs `exact: true` (slice 113's area, not changed here).
- WebKit (Safari's engine) could not run: Playwright's WebKit here lacks libmanette-0.2, libevent-2.1-7, libbacktrace and libavif16 (needs an admin install). The iPhone check is Lex's.

**Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-117/{before,after}/` (main checkout, not committed): editing text, a picture, a video and the sheet open, at 390 and 768, light and dark, on the real starter with a photo and a short video added (`geometry.json` in each). Before at 390: a 144 px canvas and the bar over the selection by 33–90 px. After: a 543 px canvas and the bar clear (0 px) in every state; 768 identical.

**Review.** GPT-6.1 Sol, read-only (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-117/review-1`, `review-2`).
- Review 1: four P2s. Fixed 3 in db07562c: panes hidden during an opening drag; the scroll ignored the page's top and end; keys after a shrink used the remembered height. Rejected 1: keeping phones on their side (< 500 px tall) on the plain column. At 568×320 the wrapped top bar leaves the workspace about 135 px, so the rail and the handle would leave the page about 55 px and no room to open the sheet at all, and the panes would be unreachable; the column keeps its tested toggles there. Its gaps became specs (drag reveal and cancel, shrink then ArrowDown, component edit, 568×320).
- Review 2: one P2, fixed in 75a78075: opening or resizing the sheet could leave the bar over an existing selection. Its gaps became specs (the page's top, the sheet opening over a chosen picture, video Play at 390). Both runs: model gpt-6.1-sol, read-only sandbox.

**Bytes.** First paint 350 KB of 355 (cold median). Boot +0.93 KB gzip: CSS +468 B (sheet layout), JS +464 B (handle markup, the lazy mount, the edit bar's room nudge). Lazy: `phone-sheet` 1.42 KB JS plus 0.31 KB CSS gzip.

**Follow-ups.**
- On a phone the top bar still takes about 230 px (three rows); folding it while editing would give the page more.
- Inside the sheet the code grip only hides and restores the code; dragging the structure/code split is not offered.
- Check on a real iPhone: the sheet drag in Safari, and the keyboard covering the sheet while typing in the code.
