---
title: WebP in Safari and the AVIF option, loaded on demand
type: task (AFK)
status: open
assignee: claude (mm-28 runner)
blocked_by: [25-image-recipe]
builder: sol
phase: 2
---

## What

Research [02](../../tickets/02-research-optimising-every-media-kind.md#resolution-2026-10-11) §1–2, ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13).

- Safari cannot make WebP from a canvas and silently returns PNG. Detect that (the blob type) and use a small WebP encoder (about 120 KB, for example jSquash) loaded only when needed.
- **Smallest files (slower)** uses an AVIF encoder (about 1.1 MB) loaded only when chosen; progress shows it is slower.
- Both run in the existing module worker; they must work under the production security policy (`public/_headers`: `worker-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'`), which differs from the test server's.
- Boot bytes unchanged.

## Done when

- `tests/media-encoders.test.ts`: the encoder chosen for a PNG-returning canvas, for AVIF, and the native path otherwise.
- A browser check under the production header that the WASM encoder loads (nightly spec or a scripted check named in the Done section).
- Byte budget: boot delta zero; the encoders are separate chunks.
