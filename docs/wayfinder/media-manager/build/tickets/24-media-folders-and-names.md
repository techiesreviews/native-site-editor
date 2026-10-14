---
title: media/ kind folders and tidy names
type: task (AFK)
status: open
assignee:
blocked_by: [23-one-preparation-path]
builder: sol
phase: 2
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13) "Storage and names".

- New files go to `media/images/`, `media/videos/`, `media/audio/` and `media/downloads/` by the resulting kind. Existing files are not moved.
- Names: keep the incoming basename only, lowercase, spaces and punctuation to hyphens, collapse and trim hyphens, keep letters and numbers from other languages, `media` if nothing usable is left, extension from the actual output.
- Conflicts get a number; never replace a file. Choose a base free across the whole family (copies, originals folder, previews).
- Copies beside the main image as `holiday-480.webp`.
- Amend [ADR 0001](../../../../adr/0001-the-repository-is-the-site.md) for the `media/` folders (existing `images/` paths stay valid); update the conventions' folder line in the Media chapter in slice 37.

## Done when

- `tests/media-names.test.ts`: every naming rule, other languages, empty names, path segments dropped, conflicts across a family and the originals folder.
- `native-media-adding.spec.ts` nightly: two files named `Holiday Photo.JPG` become `holiday-photo.webp` and `holiday-photo-2.webp`.
