---
title: Audio preparation; PDF first-page previews
type: task (AFK)
status: open
assignee: claude (mm-58 runner)
blocked_by: [23-one-preparation-path]
builder: sol
phase: 5
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13) "Audio" and "PDFs and other downloads".

- MP3/AAC below 160 kbps that fit the cap are kept unchanged, whatever the setting. Others become AAC-LC M4A: Balanced 96 kbps, Higher quality 128 kbps (mono/stereo kept), Speech 64 kbps mono only when chosen. Files over the cap are tried first, then refused if still over. Lossless M4A is not "already compressed".
- PDFs and other downloads keep their bytes. PDFs get a first-page preview (pdf.js, on demand) in the family; other downloads get a file-type picture.
- Audio and PDFs go to `media/audio/` and `media/downloads/`.

## Done when

- `tests/audio-prepare.test.ts`: the 160 kbps rule, each preset, Speech only when chosen, over-cap path.
- `tests/pdf-preview.test.ts`: preview made, PDF bytes unchanged.
- Byte budget: boot delta zero.
