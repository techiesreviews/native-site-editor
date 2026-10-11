---
title: Research optimising every media kind in the browser
type: research (AFK)
status: open
assignee: claude (research subagent)
blocked_by: []
---

## Question

Every upload is optimised in the user's browser (settled). What is possible today, in current Chrome, Safari and Firefox, for each kind of media file? Images: WebP and AVIF encoding (native `canvas.toBlob`/`OffscreenCanvas` support versus WASM encoders such as jSquash, with speed and download size), HEIC/HEIF decoding (Safari native versus a WASM decoder), keeping or dropping EXIF (rotation, location), PNG and SVG minifying, GIF to video. Video: compressing and resizing in the browser (WebCodecs plus an MP4/WebM muxer versus ffmpeg.wasm), speed on a laptop and a phone, making a poster frame. Audio: re-encoding to a smaller format. PDFs: whether anything useful can be done. For each, give the size limits that matter for a site that lives in a GitHub repo: the editor's own `/api/blob` 20 MB cap, GitHub's 50 MB warning and 100 MB file limit, repo size advice, and what Git LFS would mean for a site served as plain files (it breaks GitHub Pages serving). Recommend a default per kind and the sizes above which the editor should warn or refuse.
