---
title: HEIC, SVG and PNG
type: task (AFK)
status: open
assignee:
blocked_by: [25-image-recipe]
builder: sol
phase: 2
---

## What

Research [02](../../tickets/02-research-optimising-every-media-kind.md#resolution-2026-10-11) §3–4, ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13).

- **HEIC/HEIF**: Safari 17+ decodes natively; other browsers load a decoder (libheif, about 480 KB) only when a HEIC file arrives. An undecodable HEIC is never presented as a usable website image. Before shipping, record the decoder's licence and the HEVC patent question in the Done section and stop for the lead if unclear.
- **SVG** stays SVG: minified, artwork kept, scripts and other executable content removed; needs no raster copies; placed with `width`/`height`.
- **PNG** that stays PNG gets a lossless squeeze (oxipng, on demand).
- The file chooser accepts `.heic,.heif` everywhere.

## Done when

- `tests/media-svg.test.ts`: scripts, event attributes, `javascript:` links and foreign objects removed; artwork kept.
- `tests/media-heic.test.ts`: decoder chosen only for HEIC in non-Safari browsers; the failure message.
- Byte budget: boot delta zero.
