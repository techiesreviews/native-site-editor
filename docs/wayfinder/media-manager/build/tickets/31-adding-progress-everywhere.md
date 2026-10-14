---
title: Adding progress at every entry point
type: task (AFK)
status: open
assignee: claude (mm-31 runner)
blocked_by: [30-limits-and-repo-size]
builder: claude
phase: 2
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13): "Adding starts automatically, with a short progress summary and cancellation". Research [01](../../tickets/01-research-mobbin-patterns.md#resolution-2026-10-11) §4.

- One short progress summary with Cancel, shared by every way of adding (Media, picker, Structure slot, component field, Site settings, Files, canvas drop), following the Media tray from slice 17.
- Large download notes, failures with their advice, partial success and Retry shown there.
- The Optimise sheet's per-file before/after stays reachable from it for images.

## Done when

- Nightly in `native-media-adding.spec.ts`: add three files from the Files tab, cancel one, see a Large download note on a big PDF.
- Screens checked at 390 and 1280 px.
