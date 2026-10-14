---
title: File details
type: task (AFK)
status: open
assignee:
blocked_by: [12-usage-badges-and-list, 13-descriptions-and-decorative, 08-media-undo-without-page]
builder: claude
phase: 1
---

## What

Ticket [06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12) "Supporting-screen refinement" and the Shopify-style detail card from research [01](../../tickets/01-research-mobbin-patterns.md#resolution-2026-10-11); [tiles.html](../../prototype/tiles.html) details screen.

- Big complete preview beside grouped information on wide screens, stacked on phones (own screen with Back).
- Name, **Description** and **Decorative** (slice 13), collections (editable once slice 16 lands), usage with page names, the Image family (copies and original, expand/collapse), size and dimensions, **Always keep** toggle (stored now; clean-up honours it in phase 4).
- Save and Cancel after the fields; the phone footer never covers labels.
- **Remove file** uses today's delete, which refuses while pages use the file, until phase 4 brings Recently removed ★.
- Replaces today's detail sheet.

## Done when

- Nightly cases in `native-media-screen.spec.ts`: edit a description and see it on the placed image; mark Decorative; Always keep stays after reload; phone width shows Back.
- The old detail sheet's specs in `native-media-library.spec.ts` are ported or removed with reasons.
