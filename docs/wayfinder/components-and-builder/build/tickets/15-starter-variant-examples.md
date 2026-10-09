---
title: "Starter: variants on its components"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 2
---

## What

Repository: `~/Projects/native-site-editor-starter` (on its `dev` branch, never `main`; see the [spec](../spec.md) flow for starter slices).

Show the variant contract ([07](../../tickets/07-variant-contract.md) §1, §6) on the starter's own components, with the suggested names:

- `data-layout` (`content-left`, `image-left`, `centered`) where a component has a layout to switch (for example `section-split`, `section-hero`), written `:host([data-layout="…"])` in the component's CSS; the absent attribute keeps today's look.
- A yes/no variant somewhere it makes sense (`:host([data-x])`).
- No `data-tone` yet (phase 7) and no annotation comments.

## Done when

- Each variant renders as intended when set by hand in a page; the default look is unchanged.
- One commit on the starter's `dev` branch; screenshots of each variant.

## Done (2026-10-09)

- Starter `dev` commit `ef6ffb7`: `data-layout="centered"` on `section-hero` and `section-intro`; `data-layout="content-left"` (inside `@media (width > 720px)`, so the editor shows it as wide screens only; the image stays above the text on narrow screens) and `"centered"` (one column, image at the text's measure) on `section-split`, whose default stays image-left, so no `image-left` value; yes/no `data-featured` on `card-project` (accent edge, same size). All `:host([data-…])`, no tone, no annotations.
- Checked: `componentVariants` from `shared/variants.ts` finds exactly these with no warnings; in Chromium each variant set by hand on the real home page renders as intended at 1280 and 390px, featured cards keep equal row heights and the stretched title link; `/`, `/about/`, `/work/fern-and-kettle/` are pixel-identical to before. Sol review: no defects; its note on fractional widths between the 720/721px queries led to `width > 720px`.
