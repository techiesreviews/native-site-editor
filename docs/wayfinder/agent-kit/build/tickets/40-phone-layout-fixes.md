---
title: "Phone layout fixes the kit shots layout check found"
type: task (AFK)
status: open
assignee: ak-40
blocked_by: []
builder: sol
---

## What

The `kit shots` layout check (ticket 07, 2026-10-16; see its Done notes and
`/home/ubulex/Projects/native-site-editor/.scratch/shots/ak-07/final/index.json`) found four
real problems. Lex approved the fixes (2026-10-16). Desktop must look the same, except item 4.

1. The "More publish actions" arrow (29x32 px) sits right against Publish on phones. Make it a
   comfortable tap target: 44 px on touch, or 24 px+ with enough gap (the WCAG 2.2 target-size
   rule the check uses: a 24–43 px target fails when the 44 px zone centred on it reaches a
   neighbour).
2. Files and Pages tab rows are 32 px tall with no gap on phones. Raise them to at least 44 px on
   touch widths (coarse pointer or width up to 768 px); keep the desktop density.
3. The three device-size buttons (28x24 px) in the top bar are packed together on phones.
4. The image popup's "Original" badge text is 3.7:1 in light mode (#fbfbfd on #5a81d5); raise it
   to 4.5:1 or more through theme tokens.

Rules: reuse theme tokens (`src/theme.css`), no raw colours (the colour check enforces it),
modern CSS (pointer/hover media queries, logical properties), per the good-css skill.

## Files

- `src/theme.css`
- `src/components/publish-menu.css`
- `src/components/files-tree.css`
- `src/components/pages-tree.css`
- `src/components/canvas-bar.css`
- `src/components/edit-bar.css`

## Done when

- `scripts/agents/kit shots editor files pages image-popup --compare dev` (390, 768 and 1280 px,
  light and dark): the four findings are gone and no new finding appears; the 1280 px shots look
  the same as dev except the badge.
- `npm run check`, `npm run lint`, `scripts/agents/unit.sh` and the affected specs pass.
- Sol review on the PR; merged into `dev` through `kit pr`.
