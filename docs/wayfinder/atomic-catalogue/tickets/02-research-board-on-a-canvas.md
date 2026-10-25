---
title: Find how to build a zoomable board of live parts inside the editor
type: research (AFK)
status: open
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
