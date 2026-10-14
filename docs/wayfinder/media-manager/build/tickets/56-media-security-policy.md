---
title: The editor's security policy for media and video frames
type: task (AFK)
status: closed
assignee: claude (mm-56 runner)
blocked_by: [01-bring-dev-level]
builder: sol
phase: 5
---

## What

Ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13) "Build checks"; research [02](../../tickets/02-research-optimising-every-media-kind.md#resolution-2026-10-11) §8.

- Add `media-src 'self' blob:` and YouTube/Vimeo frames (`https://www.youtube-nocookie.com`, `https://www.youtube.com`, `https://player.vimeo.com`) to `public/_headers:5`, and the same to the test server (`tests/native-save/server.ts:1116-1118`).
- Note in the Done section the remaining known difference (`worker-src 'self' blob:` on the test server only) and keep it unless a slice needs otherwise.
- Nothing else widens here; outside pictures are slice 71.

## Done when

- A unit test (for example `tests/editor-csp.test.ts`) reads both policies and checks `media-src` and the frame hosts are present and equal.
- A nightly spec plays a short MP4 from a blob in the canvas.

## Done (2026-10-14)

- Production and test policies now allow exactly `media-src 'self' blob:` and frames from `https://www.youtube-nocookie.com`, `https://www.youtube.com` and `https://player.vimeo.com`. The test policy lives in the side-effect-free `tests/native-save/test-csp.ts`, imported by the server and unit test.
- Existing differences remain: test-only `worker-src 'self' blob:` (production has `worker-src 'self'`), production's avatars image host, the differing connect sources, and production's workers.dev frame host. No other directive was widened.
- `tests/editor-csp.test.ts` parses both policies and checks the exact media sources and matching video frame hosts. `tests/native-save/native-media-policy.spec.ts` records a one-second MP4 in Chromium, creates its blob URL in the canvas frame, and polls for advancing playback without a media-src violation; no fixture or new tools were needed.
- Red: temporarily removing media-src from the server's imported policy made the spec fail with one media-src violation; playback also rejected with `NotSupportedError`. Green: restoring the policy made the same spec pass (1/1), with playback advancing and zero media-src violations.
- Validation: `npm run check`; `scripts/agents/unit.sh tests/editor-csp.test.ts tests/asset-headers.test.ts` (3 passed); `npm test` (2,293 passed); `npm run lint`; `scripts/agents/port.sh npx playwright test --project=native-save --workers=1 tests/native-save/native-media-policy.spec.ts` (1 passed).
- Runner re-check: `npm run check`; `scripts/agents/unit.sh` (2,293 passed); `npm run lint` (281 tickets); `native-media-policy.spec.ts` plus `native-canvas.spec.ts` (14 passed).
- Commits: 248985d8 (claim), ecb76cdc (policy, unit test, nightly spec; built by GPT-6.1 Sol).
- Review (GPT-6.1 Sol, read-only): no defects, gaps or nits; nothing fixed or rejected.
- Byte budget: 340 KB of 355 KB; delta 0 (no app code changed).
