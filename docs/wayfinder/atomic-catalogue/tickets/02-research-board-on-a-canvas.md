---
title: Find how to build a zoomable board of live parts inside the editor
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

The board lives inside the editor on the preview editor only, built from real parts (Lex, 2026-10-25). How do canvas tools (Figma, Paper, Framer, tldraw, Storybook's canvas, Ladle and similar) lay out live components on a zoomable board, and what is the cheapest sound way here?

- CSS transforms, `zoom`, or a canvas library; what stays crisp and clickable when zoomed.
- How parts are registered (one list file?) so a new part shows up by itself.
- How each part shows its states: hover, pressed, focus, disabled, loading, light and dark side by side, and phone width.
- How it loads only on the preview editor without adding to the editor's boot size (`kit size`, `src/main.ts`).
- How a mock-up page could reuse the same parts.

## Resolution (2026-10-25)

Findings: `docs/wayfinder/atomic-catalogue/research/02-board-on-a-canvas.md` on branch `research/ac-02-board-on-a-canvas` (commit `f0d4dbe4`, never merged).

- **How live-part boards work:** Paper, Framer, tldraw, Storybook, Ladle and Histoire draw real parts as page elements and zoom with a CSS transform (tldraw and Storybook confirmed from source). Anything needing its own width or page goes in an iframe. Figma's canvas is not live parts.
- **Zoom:** a CSS transform on one board element. Text stays crisp at rest when `will-change` is set only during a pinch or drag. CSS `zoom` is always crisp, but slow while zooming and it changes layout. tldraw needs React and a paid licence key, so it is not advised.
- **Frames where needed:**
  - Popovers and dialogs (`showPopover`, `showModal`) leave the board.
  - Anchor names collide when a part appears twice.
  - 16 CSS files use fixed positioning, and the phone layout reads the window width.
  - So simple parts sit on the board directly, and menus, big panels, phone-width views and mock-ups sit in small same-origin iframes.
- **One parts list:** `src/catalogue/parts.ts` calls the editor's real functions.
- **States:**
  - Hover, pressed and focus are forced by copying the stylesheet rules (as Storybook does).
  - Disabled, loading and open use real options.
  - Light and dark side by side need dark mode moved to `light-dark()` in `theme.css` and three other CSS files; Safari ignores the parent's colour scheme inside iframes.
- **Loading:** a separate `catalogue.html`, built only for the preview editor with `CATALOGUE=1`, at 0 boot bytes.
- **Mock-ups** are entries beside the parts, using the same frames.
- **Open for ticket 07:** the address (`/catalogue.html`, recommended, versus `/?catalogue`, which costs a few boot bytes), and doing the `light-dark()` theme change first (recommended).
