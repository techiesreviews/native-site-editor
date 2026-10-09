---
title: "Starter: move the skip link into each page"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 1
---

## What

Repository: `~/Projects/native-site-editor-starter` (a separate project; see the [spec](../spec.md) flow for starter slices and open point 1).

Ticket [02](../../tickets/02-masters-become-components.md) §1:

- Every page (`index.html`, `about/`, each `work/*/`, `404.html`) carries `<a class="skip" href="#main">Skip to content</a>` right before `<site-header>`.
- The link leaves `components/site-header/site-header.html:2`; the `.skip` rules leave `components/site-header/site-header.css:21-35` for the shared CSS (`styles/`).
- `AGENTS.md`: the note "the header's Skip to content link points there" says where the link is now.

## Done when

- With JavaScript off, Tab on any page shows the skip link and it jumps to `<main>`; with JavaScript on the page looks as before.
- One commit in the starter repo; screenshots of the focused skip link on the real starter.
