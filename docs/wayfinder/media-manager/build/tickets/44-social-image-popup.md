---
title: The Social image popup
type: task (AFK)
status: open
assignee: claude (mm-44 runner)
blocked_by: [39-image-button-and-popup, 36-social-sharing-copy]
builder: claude
phase: 3
---

## What

Ticket [09](../../tickets/09-prototype-crop-and-focus.md#resolution-2026-10-13): the Social image in settings gets the same Image button and popup, fixed to the 1200 × 630 sharing shape, adjusting the sharing copy from slice 36.

- Focus and trim move the sharing copy's frame; Done rewrites the copy under a fresh name and points `og:image` at it.
- No other shapes; previews show a link card.

## Done when

- Nightly spec: in Site settings, open the Social image popup, move the frame, Done; `og:image` points at a new copy.
