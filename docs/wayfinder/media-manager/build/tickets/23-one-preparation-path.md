---
title: One preparation for every way of adding
type: task (AFK)
status: open
assignee:
blocked_by: [17-drop-to-add, 08-media-undo-without-page]
builder: sol
phase: 2
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13) "Adding and settings"; research 04 finding 1 (two upload paths share no code).

- One preparation in the browser for Media, the picker, Structure slots, component fields, Site settings, Files drops and canvas drops. `uploadFilesTo` (`src/main.ts:2443`) and its callers (`:431` Files drop, `:682`, `:1922`, `:3986` Upload files…) go through the media import batch (`applyMediaBatch`, `:2522`).
- Each addition is one Undo step, including choosing an image with a new upload (two steps today).
- A specific folder chosen by dropping in Files wins for the website file.
- Adding starts at once; nothing is placed without the picker's Use.
- Images keep today's Optimise defaults until slice 25; other kinds are stored as they are until phase 5.

## Done when

- `tests/media-prepare.test.ts`: every entry point builds the same batch; Files folder wins; one Undo step.
- `@smoke` `tests/native-save/native-media-adding.spec.ts`: upload into a Structure image slot; the file is prepared (WebP with copies) and placed; one Undo removes both.
- `native-upload.spec.ts` updated; full suite green.
