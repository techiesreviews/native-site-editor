---
title: Make component from Structure and right-click
type: task (AFK)
status: closed
assignee:
blocked_by: [22-make-component-creates-at-once]
builder: sol
phase: 3
---

## What

Ticket [04](../../tickets/04-prototype-making-components.md) §1: besides the edit bar, Make component is offered, on any element it is offered for (slice 02's rule), in the Structure row's ⋯ menu (`src/components/row-menu.ts`) and on right-click on an element in the preview or on a Structure row. Each entry does the same as the edit bar's (slice 22): it creates the component at once, with no dialog, and lands in Edit component mode on the new instance. The preview has no context menu yet; add a small one with the same entries as the row menu (slice 66 adds slot items to it in Edit component mode).

## Done when

- Nightly spec: the row menu and a right-click each make the component at once from the right element and open Edit component mode on it; neither offers it on `<main>` or inside an instance.

## Done (2026-10-10)

- One element menu (`src/components/element-menu.ts`, providers composed in `elementMenuItems` in `main.ts`; slice 66 adds its slot provider there) feeds a ⋯ button on Structure rows, right-click and Shift+F10/ContextMenu on a row, and right-click in the preview (the runtime selects the element and sends the menu's point with that selection). Its entry, Make component, uses the edit bar's rule (`makeComponentOfferedFor`: containers only, not in Edit component mode) and `openMakeComponent` (opening the page first when a stylesheet is the open file), so it creates at once and lands in Edit component mode. Stale Structure rows refuse; typing and History keep the browser's menu.
- Commits "Make component from the Structure row menu and right-click (slice 26)" (Sol built) and "Slice 26 review: …".
- Tests: `tests/element-menu.test.ts`, `tests/preview-files.test.ts`; `native-make-component-menus.spec.ts` (each entry point, refusals on `<main>`, a heading, the page's header/footer and inside an instance, dismissal, stale row, typing/History, after following a link, a stylesheet open, folding kept).
