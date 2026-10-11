---
title: Research optimising every media kind in the browser
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

Every upload is optimised in the user's browser (settled). What is possible today, in current Chrome, Safari and Firefox, for each kind of media file? Images: WebP and AVIF encoding (native `canvas.toBlob`/`OffscreenCanvas` support versus WASM encoders such as jSquash, with speed and download size), HEIC/HEIF decoding (Safari native versus a WASM decoder), keeping or dropping EXIF (rotation, location), PNG and SVG minifying, GIF to video. Video: compressing and resizing in the browser (WebCodecs plus an MP4/WebM muxer versus ffmpeg.wasm), speed on a laptop and a phone, making a poster frame. Audio: re-encoding to a smaller format. PDFs: whether anything useful can be done. For each, give the size limits that matter for a site that lives in a GitHub repo: the editor's own `/api/blob` 20 MB cap, GitHub's 50 MB warning and 100 MB file limit, repo size advice, and what Git LFS would mean for a site served as plain files (it breaks GitHub Pages serving). Recommend a default per kind and the sizes above which the editor should warn or refuse.

## Resolution (2026-10-11)

Full findings: branch `research/mm-02-optimising-media` (commit 8842164b), file `docs/wayfinder/media-manager/research/02-optimising-media.md`. Speeds were measured in headless Chrome on a laptop, with "phone-class" meaning Chrome slowed to a quarter of its CPU speed; real-phone and real-Safari checks are open points in the file.

1. **Likely Safari bug:** Safari can't save canvas pictures as WebP and silently returns PNG; today's optimiser accepts that and never compares with the original, so Safari uploads are probably large PNGs (not confirmed on a real Safari). Fix: a small WebP encoder (about 120 KB) loaded only in Safari.
2. **Images:** keep WebP, quality 80, at most 2400 px, with responsive copies; Chrome's own encoder is fast and free. AVIF is about 40% smaller but takes about 5 s per image (over 20 s phone-class) and a 1.1 MB download: not the default, never in the fix-all.
3. **HEIC:** Safari 17+ opens it natively; Chrome and Firefox need a 480 KB decoder (libheif) loaded only when a HEIC file arrives. Optimised copies already drop location and camera data; Keep original does not and should.
4. **PNG, SVG, GIF:** PNGs that stay PNG get a lossless squeeze (oxipng). SVGs are minified (techies-reviews' 41 SVGs shrank 47%) and scripts stripped. Animated GIFs become looping muted MP4s (the 10.9 MB GIF became 190 KB in 0.3 s).
5. **Video:** the browser's own encoders through the Mediabunny library (17–70 KB), not ffmpeg.wasm (10 MB, about 25× slower). Default H.264 MP4 up to 1080p, a WebP poster frame, AAC sound. Firefox on Android can't encode video; files there upload as they are if under the cap.
6. **Audio:** AAC `.m4a`, 96 kbps stereo or 64 kbps for speech; files already below about 160 kbps are kept.
7. **PDFs:** keep the bytes. Real compression needs Ghostscript (AGPL, clashes with the editor's MIT licence). A first-page thumbnail is possible with pdf.js.
8. **Limits:** keep the 20 MB per-file cap (Cloudflare rejects files over 25 MiB; the Worker has 128 MB of memory). Warn at 10 MB for video, audio and PDFs and at 1 MB for an optimised image. Show the repo's size, warning at 500 MB and 900 MB (GitHub Pages stops at 1 GB); Git history keeps every deleted or replaced file. No Git LFS (GitHub Pages would serve placeholder files). Previewing video or audio in the editor needs `media-src 'self' blob:` in its security header.
