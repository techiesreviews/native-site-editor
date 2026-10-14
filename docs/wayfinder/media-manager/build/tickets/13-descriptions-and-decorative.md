---
title: Descriptions and Decorative
type: task (AFK)
status: open
assignee: claude (mm-13 runner)
blocked_by: [05-media-records]
builder: sol
phase: 1
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "Descriptions (alt text)".

- A file's **Description** is written once and used by every new place; a place can have its own words.
- Changing a file's description updates every place that uses it, except places with their own words (one Undo step).
- **Decorative** per file or per place writes `alt=""` and is remembered in `.editor/media.json`, since `alt=""` alone cannot tell the two apart.
- Old empty descriptions count as **not described yet** until marked Decorative; the gap shows on the file and the place. Today's alt warning fires only when `alt` is absent; extend it to empty, unmarked alt (`native-image-alt-refusal.spec.ts`).
- Text an agent writes carries the **by-agent** mark; it clears when Lex presses OK or edits it, and survives saving.

## Done when

- `tests/media-descriptions.test.ts`: description flows to places; own words kept; Decorative per file and per place; old `alt=""` reads as not described; the by-agent mark set, kept on save, cleared on OK or edit.
- `tests/media-markup-alt.test.ts` and `native-image-alt-refusal.spec.ts` updated and passing.
