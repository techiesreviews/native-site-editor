---
title: A tapped tile does not stay lit on touch screens
type: task (AFK)
status: closed
assignee: claude (mm-87 runner)
blocked_by: [86-phone-list-view]
builder: claude
phase: 1
---

## What

Follow-up to slice [86](86-phone-list-view.md) (see its Done section, "Follow-ups"). In Media's grid view the tiles still light their usage number and selection circle with plain `:hover` and `:focus-within`, and open the usage words with plain `:hover`. On a touch screen `:hover` stays on whatever was tapped last, and a tapped checkbox keeps focus, so a tile keeps its soft background (and sometimes its usage words) after a tap, even after it is unticked. Slice 86 fixed the same leak for list rows.

Ticket [06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12) keeps its design: on touch screens file names are always visible on the tiles; with a mouse, names and the soft backgrounds show on hover, keyboard focus or selection.

- A tile's soft backgrounds (usage number, selection circle) and the usage words show only for a real hover with a mouse (`@media (hover: hover) and (pointer: fine)`) or keyboard focus (`:focus-visible`), never after a tap.
- The selection ring and tick show only while the tile is actually selected; unticking a tile on a touch screen leaves nothing lit.
- Names on tiles: always visible on touch screens; with a mouse they show on hover, keyboard focus or selection (a click that leaves focus behind does not keep them).
- The list view keeps slice 86's behaviour. Code stays in the lazily loaded Media chunk (CSS only).

## Done when

- `tests/native-save/native-media-screen.spec.ts`: in a touch context (hasTouch, isMobile, 390 px) tapping a tile's usage number (then closing its words) and ticking then unticking a tile leaves no usage or selection control lit, no usage words open and no selection ring; names stay visible. With a mouse at 1280 px, hovering a tile's usage lights only that control and opens its words, hovering its selection lights only that circle, and keyboard focus still lights the control.
- `npm run check`, `npm run lint`, units; the touched spec passes.

## Done (2026-10-14)

- **Cause.** Grid tiles lit their usage number and selection circle with plain `:hover` (usage) and `:hover`/`:focus-within` (selection), opened the usage words on plain `:hover`, and showed names on `:focus-within`. A touch screen keeps `:hover` on the last tap and a tapped checkbox keeps focus, so a tapped circle stayed lit, even once unticked. Reproduced on origin/dev c1c718b3: the new test failed with "images/placeholder.svg select" lit after a tap.
- **Behaviour.** A tile's soft backgrounds and usage words show only for a mouse hover (`@media (hover: hover) and (pointer: fine)`) or keyboard focus (`:focus-visible`, `:has(:focus-visible)` for the selection circle). Names on tiles: always visible on touch screens (unchanged); with a mouse on hover, keyboard focus or selection, so a click that leaves focus behind no longer keeps a name shown once the mouse leaves. The selection ring shows only while selected (unchanged). The list keeps slice 86's rules. CSS only, in the lazily loaded Media chunk (`media-picker.css`).
- **Kept as shipped.** The usage-words styling keeps its old specificity, so `.media-library__card.is-file .media-library__usage-label` (a light popup for file tiles, added in slice 12) still never applies; making it apply would change the file-tile look and is out of scope. Follow-up: decide whether file tiles should get that light popup, or delete the unused rule.
- **Commits.** 8a79d7a6 claim; d1e56792 tile hover gated on a mouse, new test; 5a55684e review follow-up (tests); close.
- **Tests.** New in `native-media-screen.spec.ts`: "on tiles a tap on a touch screen leaves nothing lit, and a mouse or keyboard lights only the control it is on" (hasTouch/isMobile at 390 px: tap usage and close it, tick and untick a tile, nothing lit, no usage words, the ring only while ticked, names visible; mouse at 1280 px: hover lights only that control and opens its words, keyboard focus lights the focused control and shows its name, click usage and close then leave the tile leaves nothing lit). `native-manager-action-fades.spec.ts` "keyboard focus on a Media tile's checkbox…" now reaches the checkbox by keyboard (Shift+Tab, Tab): its `focus()` after mouse clicks is not keyboard focus. Ran media screen, media tab and fades: CI fonts 56/57 before the follow-up (the fades test above), then the two changed tests 2/2 in both fonts, then all 57/57 with local fonts. `npm run check`, `npm run lint` clean; units 2590/2590.
- **Review (GPT-6.1 Sol).** Log: `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-87/review/run.log` (result.md beside it, `REVIEW_STATUS: complete`). No defects. Fixed both validation gaps (checks right after closing usage on touch; keyboard focus shows the name and a mouse click then leaving keeps nothing lit). No re-review: the follow-up changed tests only.
- **Bytes.** Boot unchanged (CSS is in the lazy Media chunk); byte budget 344 KB of 355 KB. Source `media-picker.css` +77 B gzip, mostly comments.
