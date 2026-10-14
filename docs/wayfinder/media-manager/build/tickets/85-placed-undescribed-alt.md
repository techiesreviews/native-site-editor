---
title: Placing an undescribed file leaves it not described yet
type: task (AFK)
status: in progress
assignee: claude (mm-85 runner)
blocked_by: [21-agents-place-describe-collect]
builder: sol
phase: 1
---

## What

Follow-up found by slice [21](21-agents-place-describe-collect.md) (6c7fca63). Placing a media file that has no description, through the shared placing code of slice [18](18-media-picker.md) (`placeMediaImage` / `swapPlaceImage`, used by the picker's Use and by the agent tool `place_media`), writes the file **name** as the image's alt text. That contradicts map ticket [13's resolution](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) and CONTEXT.md **Description**: a file's description is written once and used by every place; a place has its own words only when someone gives it words; an empty description counts as not described yet unless Decorative. Today the file name counts as own words, so a description added to the file later never reaches that place.

- Placing (or swapping in) an undescribed, non-Decorative file writes `alt=""` with no Decorative mark, so the place shows **Not described yet** (slice [13](13-descriptions-and-decorative.md)'s Edit bar warning). Described files still give their description, Decorative files `alt=""` as Decorative; own words and Decorative places are kept as slice 18 decided.
- A description saved on the file later (Media details, To check, or the agent's `describe_media`) reaches every place of that file that has no own words, including these.
- Places already placed with the name fallback before this fix (★): a place whose alt equals its file's name fallback (`mediaNameAlt`, for example "hero image" for `hero-image.jpg`), its base name (`hero-image`) or its file name (`hero-image.jpg`), and that has no recorded own words (`places[page].agentText` is not that text), counts as not described: it follows the file's description and Decorative mark, and the Edit bar warns **Not described yet**.

## Done when

- `tests/media-descriptions.test.ts`: swapping in an undescribed file gives `alt=""` (not the name); a later file description reaches those places; name-fallback, base-name and file-name alts follow the file and read as not described; agent words equal to the name stay own words; own words and Decorative places unchanged.
- `tests/native-save/native-media-picker.spec.ts`: Use on an undescribed file writes an empty alt and the Edit bar shows Not described yet; describing the file in File details then reaches the place.
- `tests/native-save/native-mcp-media.spec.ts`: an agent places an undescribed file (empty alt, Not described yet), then `describe_media` on the file reaches the place.
- `npm run check`, the unit suite and `npm run lint` are green; touched browser specs pass.
