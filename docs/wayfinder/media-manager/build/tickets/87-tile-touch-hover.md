---
title: A tapped tile does not stay lit on touch screens
type: task (AFK)
status: open
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
