---
title: Rename a file everywhere
type: task (AFK)
status: open
assignee:
blocked_by: [46-wide-use-scanner, 06-image-families]
builder: sol
phase: 4
---

## What

Ticket [15](../../tickets/15-collections-and-file-names.md#resolution-2026-10-14) "Renaming a media file".

- One name: the real file name. Renaming renames the whole family (copies, kept original, and from phase 5 the still and subtitles) and fixes every mention the scanner counts as a use, not only `.html`/`.css`.
- The file stays in its folder and keeps its type; the new name is tidied as at adding (slice 24). Collections, description and Always keep follow; Trimmed copies keep their names and remember the renamed source.
- A taken name is refused with the next numbered suggestion (`lisbon-tram-2`); nothing is replaced.
- **Keep the old address working**: forwarding lines in the root `_redirects`, as Change URL does (`src/native-page-moves.ts:201-236`); ticked by default for Always keep files; the copies' old addresses forward too.
- The Files tab's rename and agent `move_file` use the same plan for media files ★.

## Done when

- `tests/media-rename.test.ts`: family renamed, mentions in every file kind, numbered suggestion, redirects for main and copies, records follow, trimmed copy source updated.
- Full suite green.
