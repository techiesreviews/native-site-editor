---
title: "Phone layout fixes the kit shots layout check found"
type: task (AFK)
status: closed
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

## Done (2026-10-16)

**Behaviour.** A new `--size-tap` token in `src/theme.css` is 0 by default and `--size-touch`
(44 px) under `(hover: none), (pointer: coarse), (width <= 768px)`; components take
`max(<desktop size>, var(--size-tap))`, so the touch-or-narrow rule lives in one place.

1. Publish and its "More publish actions" arrow are 44 px tall on phones, the arrow 44 px wide; still
   one split button.
2. Files rows and Pages rows are 44 px tall on touch and up to 768 px; desktop stays 32 px. Pages'
   other touch-only behaviour (one ⋯ per row) is unchanged.
3. The three device buttons are 44x44 px on phones (real sizes, not spaced 24 px buttons); their
   hover now sits inside `(hover: hover) and (pointer: fine)` with an `:active` state for touch.
4. The "Original" badge on a pressed Image button mixes `--pressed` toward `--text` (20%):
   8.1:1 light, 14.5:1 dark (was 3.7:1 light). The badge is the only change on desktop.

**Commits.** 3258919b (ticket), 315ebe8f (Sol build).
**Tests.** `npm run check` (types, specs, colours) and `npm run lint` pass. Sol's full `npm test`
inside its sandbox had two kit-tool failures (`kit-preview`, `kit-wait`); both files pass 40/40
outside the sandbox. Affected specs run in `kit pr`.
**Proof.** `kit shots editor files pages image-popup --compare dev` (390, 768, 1280 px, light and
dark): the four findings are gone from every after shot; the six findings left (code-pane
"body elements" chip, "Move image" handle, Pages' Change URL buttons at 768 px) are in the dev
shots too. 1280 px shots match dev except the badge. Contact sheet:
`/home/ubulex/Projects/native-site-editor/.scratch/shots/ak-40/contact.webp`.
**Review.** Sol, `.scratch/reviews/ak-40/20261016T215350Z` (main root): no defects, no nits.
**Noticed.** `kit shots --compare` prints before and after findings in one list, so fixed findings
still show in the printed summary; `index.json` splits them (compare.mjs, ticket 35's file).
