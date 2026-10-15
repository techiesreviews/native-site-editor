---
title: Pictures from other websites
type: task (AFK)
status: open
assignee: claude (mm-71 runner)
blocked_by: [70-improve-images-scan]
builder: sol
phase: 6
---

## What

Ticket [11](../../tickets/11-fix-all-existing-images.md#resolution-2026-10-13) "Pictures from other websites".

- The editor's browser code fetches them; no new Worker route. Widen the security policy only for what images need (`img-src` and `connect-src` for `https:` image fetches), in `public/_headers` and the test server alike. Outside pictures then also show in the canvas.
- Only hosts that allow cross-site reading can be brought in. Brought-in pictures follow the adding rules (recipe, copies, `media/images/`, tidy names numbered on conflict), named with the source site first (`mobbin-og-image.webp`).
- A link around the picture stays; only the picture's address changes.
- Pictures that cannot be brought in stay as they are and are listed as **website gone** or **not allowed**; Lex can drop in an own copy to replace one.

## Done when

- `tests/outside-pictures.test.ts`: naming, link kept, gone vs not allowed, the policy widened only for images.
- `tests/editor-csp.test.ts` updated.
