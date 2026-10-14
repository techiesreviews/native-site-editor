---
title: The shared Media picker
type: task (AFK)
status: open
assignee:
blocked_by: [14-file-details, 16-collections-in-media]
builder: claude
phase: 1
---

## What

Ticket [06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12) "Page picker" and research [01](../../tickets/01-research-mobbin-patterns.md#resolution-2026-10-11)'s thumb-friendly picker.

- One picker built from the Media screen: the same search, Collections, views and records in a smaller window; only files compatible with the place can be chosen.
- Full-screen on phones; status above one row of **Cancel** and **Use**. Adding files and details work inside it; adding never places a file without Use.
- It replaces today's modal for every entry: the edit bar's Choose image…, Structure's Choose image… (`src/controllers/page-structure-controller.ts:517`), canvas double-click, component fields, Site settings.
- Placing still uses today's markup until slice 33.

## Done when

- `@smoke` `tests/native-save/native-media-picker.spec.ts`: from the edit bar on an image, open the picker, search, pick, Use; the page shows the new image; Cancel leaves it unchanged.
- `native-media-pane.spec.ts` ported to the picker; nightly: phone width is full-screen with Cancel/Use reachable.
