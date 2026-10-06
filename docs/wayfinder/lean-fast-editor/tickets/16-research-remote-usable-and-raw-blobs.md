---
title: Research why remote "usable" takes 17 s and how image blobs are served
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

The signed-in remote baseline (ticket 01, added section) shows paint at 2.7–4 s but "usable" (first Page structure row) at 17–20 s, and 4.5 MB of `/api/raw` image blobs fetched before paint on every load, warm too. Why is usable so late remotely when locally it equals paint? What is the cheapest way to serve blob bytes by SHA with immutable private caching (raw bytes instead of base64 JSON) and to keep images off the critical path? Does any of this change the budget or the phase order?

## Resolution (2026-10-06)

Full findings: branch `research/16-remote-usable-and-raw-blobs` (commit 6b321a7), file `docs/wayfinder/lean-fast-editor/research/16-remote-usable-and-raw-blobs.md`. Budget and placement decided with Lex.

1. Root cause: each arriving image redraws the whole preview (`src/native-assets.ts:24` → `updateNativePreviewSources`, `main.ts:4056`), which makes the pending Page structure report stale (`native-preview.ts:546`) so it is discarded (`:759`), until all 171 images are in (`main.ts:4647`, `:4172`). The main thread is the limit (6.7–9 s of long tasks), not the network. Without the redraws, usable ≈ paint + 0.1 s.
2. `/api/raw` returns uncached base64 JSON from five call sites; boot fetches 43 images before paint (up to the 4 s wait) and 128 after, 13 MB per load. Fix: `/api/blob?repo&sha&type` returning raw bytes with `private, max-age=31536000, immutable`, `nosniff` and a CSP sandbox (so a repository SVG can't run script in the editor origin); the preview gets plain URLs built from SHAs (blob: URLs for uploads), no image fetch before paint, one draw.
3. Remote budget (on preview with Lex's site): usable ≤ paint + 0.5 s, no image bytes before paint, cold paint ≤ 2.5 s, warm ≤ 1.5 s.
4. Placement: phase 2, a ★ Claude slice right after the `/assets/*` cache header. It also covers phase 4.3's image-wait cap.
