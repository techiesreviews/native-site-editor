---
title: "Starter: a second card look"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 6
---

## What

Repository: `~/Projects/native-site-editor-starter` (on its `dev` branch, never `main`; see the [spec](../spec.md) flow for starter slices).

So the gallery has something to show ([09](../../tickets/09-prototype-add-existing-page.md) §9): add a second card component (for example `card-quote`: a title and text, no image), and a variant on an existing card component written `:host([data-x="v"])`. Card components start with `card-` and have a heading slot.

## Done when

- Both looks render in a grid alongside `card-project`; the variant works when set by hand.
- One commit on the starter's `dev` branch; screenshots.

## Done (2026-10-09)

- Starter `dev` commit `b670408`: new `components/card-quote/` (heading slot `title`, slot `body`, no image or link slot; accent edge, larger italic quote, fills its grid cell, `:host { position: relative; }`); `card-project` gains `:host([data-layout="centered"])`; `AGENTS.md` mentions both, and its "add a component" example now names `card-person`. Real pages unchanged.
- Checked in Chromium (Sol's throwaway page on the starter): card-quote and card-project mixed in one `.cards` grid with equal row heights, the centred variant set by hand, light and dark bands, 1280 and 390px, card-quote's title link stretched with a visible focus ring; the six real pages are pixel-identical. Screenshots in `.scratch/cb-build-shots/58/`. Sol review: no defects.
