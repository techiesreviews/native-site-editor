---
title: "Add card appears right after Make component, without a reload"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 6
---

## What

From slice 54 (see its Done note): on the starter, after Make component (and Done) on Recent work, hovering the new section's cards shows no Add card until the page is reloaded, although the template is correct (the slot's fallback is `card-project`). Find why the card-slot/grid report isn't refreshed after the template and page change (probably the items-slot/card-component cache or the grid tracking from slices 40/50 not seeing the new template) and fix it.

## Done when

- Nightly @actual spec: Make component on Recent work, Done, hover a card → Add card shows; adding works; no reload.

## Done (2026-10-10)

- Not a stale report: on a short frame (1440×900), Edit component mode leaves the page scrolled ~26px further than a load, so the next-row ghost of a full row lands just past the frame's bottom and was hidden (`box.top > frameRect.height`); after a reload it peeked in. Now a ghost below its grid whose item is in view is cut at the frame's bottom edge, at least a strip (`ghostInView`, `src/components/card-ghost-view.ts`), so Add card stays in the frame on any such grid.
- Commit "Add card stays in view below a grid at the frame's bottom (slice 95)".
- Tests: `tests/card-ghost-view.test.ts`; nightly `native-add-card-after-make-actual.spec.ts` (@actual, 900px tall: Make component, Done, hover, the button hit-tests, Add card adds and opens Link to a page…; red before the fix).
