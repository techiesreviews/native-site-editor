---
title: "Starter: move the skip link into each page"
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 1
---

## What

Repository: `~/Projects/native-site-editor-starter` (a separate project), on its `dev` branch, never `main`; see the [spec](../spec.md) flow for starter slices.

Ticket [02](../../tickets/02-masters-become-components.md) §1:

- Every page (`index.html`, `about/`, each `work/*/`, `404.html`) carries `<a class="skip" href="#main">Skip to content</a>` right before `<site-header>`.
- The link leaves `components/site-header/site-header.html:2`; the `.skip` rules leave `components/site-header/site-header.css:21-35` for the shared CSS (`styles/`).
- `AGENTS.md`: the note "the header's Skip to content link points there" says where the link is now.

## Done when

- With JavaScript off, Tab on any page shows the skip link and it jumps to `<main>`; with JavaScript on the page looks as before.
- One commit on the starter's `dev` branch; screenshots of the focused skip link on the real starter.

## Done (2026-10-09)

- Starter `dev` commit `4b07b09`: every page carries `<a class="skip" href="#main">` right before `<site-header>`; the `.skip` rules moved from `site-header.css` to `styles/utilities.css` (z-index above the sticky header); `AGENTS.md` updated.
- Checked in Chromium on all six pages, JavaScript on and off: Tab shows the link above the header, Enter goes to `#main`; the unfocused home page is pixel-identical to before. Sol review: no defects.
- Left open: the editor's Page Structure now lists "Skip to content" as a top-level row above Site header.
