---
title: Replacing inside picture cleans it up
type: task (AFK)
status: open
assignee: claude (mm-34 runner)
blocked_by: [33-placed-image-markup]
builder: sol
phase: 2
---

## What

Ticket [08](../../tickets/08-responsive-image-output.md#resolution-2026-10-13) "Replacing inside `<picture>`"; research 03's bug: today the old `<source>` tags stay, so visitors keep seeing the old picture.

- Replacing an image wrapped in `<picture>` removes the `<picture>` and its `<source>` tags and writes the new file as an ordinary placed image (classes and attributes on the `<img>` kept).
- If any `<source>` had `media` (art direction), a short note tells Lex the new picture is now used on all screens.
- One Undo step.

## Done when

- `tests/media-markup.test.ts`: plain picture, picture with type sources, art-directed picture (note raised), attributes kept.
- Nightly in `native-image-markup.spec.ts`: replace inside a `<picture>`; no `<source>` remains.
