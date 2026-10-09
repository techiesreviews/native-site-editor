---
title: "Starter: add the .btn class"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 1
---

## What

Repository: `~/Projects/native-site-editor-starter` (on its `dev` branch, never `main`; see the [spec](../spec.md) flow for starter slices).

The builder writes only `flow`, `cards` and `btn` ([10](../../tickets/10-block-set.md) §3); the starter has the first two and gains `.btn`.

- A `.btn` rule in the shared CSS (`styles/`), from the design tokens, readable in light and dark.
- Existing button-looking links may switch to `.btn` only where their look stays the same.
- `AGENTS.md` lists `.btn` among the shared classes.

## Done when

- `<a class="btn" href="#">Button</a>` inside a `<section class="flow">` looks like a button in light and dark.
- One commit on the starter's `dev` branch; a screenshot.

## Done (2026-10-09)

- Starter `dev` commit `32eff78`: `.btn` in `styles/sections.css` (sections layer, so it beats the elements layer's `p a, li a` colour), pill on `--accent` with a new `--on-accent` token for its text; `AGENTS.md` lists `.btn` (and `.skip` in `utilities.css`). No existing links switched: the pages' buttons are component slots.
- Checked in Chromium: a `.btn` directly in a `.flow`, in a `<p>` and in an `<li>`, on the light page and on a dark band, with hover and keyboard focus. Sol review: no defects; sharing one rule with `.cta a` was left for slice 60, which reworks both.
