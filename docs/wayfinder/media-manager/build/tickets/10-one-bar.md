---
title: One bar - search, Collections dropdown, More
type: task (AFK)
status: open
assignee: claude (mm-10 runner)
blocked_by: [09-media-tab-and-tiles]
builder: claude
phase: 1
---

## What

Ticket [06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12) "Search and Collections simplification" and "One bar and automatic adding".

- One row, even on phones: search, the **Collections** dropdown and **More**; 44 px heights, 8 px gap. No Media heading and no separate Add button.
- Collections is a real native `<select>`, progressively enhanced with customizable-select styling, the editor's Phosphor Regular arrow and checkmark; plain native control where unsupported. Long names shorten in the closed control.
- More: **Add new file** first, then kinds (All, Images, Video, Audio, Documents), grid/list, and Manage collections (wired in slice 16).
- Search respects the kind, with a way back to all media when nothing matches. Uses slice 03's filter.

## Done when

- `tests/media-library-filter.test.ts` gains kind-plus-search and recovery cases.
- Nightly cases in `native-media-tab.spec.ts`: search narrows, kind in More narrows, no-results offers All.
- Keyboard: Tab order search → Collections → More; the dropdown works with arrows and Enter.
