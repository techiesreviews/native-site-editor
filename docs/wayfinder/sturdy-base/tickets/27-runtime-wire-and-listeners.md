---
title: "Runtime and host listeners on the shared wire names; dead messages go"
type: task (AFK)
status: open
assignee:
blocked_by: [20-runtime-bundle, 26-preview-link]
builder: sol
phase: 2
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/frame-protocol-design.md (sections 2, 4.3, 6). Does not need sturdy slice 10.

- A small wire module (`src/components/preview-wire.ts`: `FRAME_SOURCE`, `HOST_SOURCE`, no editor imports) that preview-protocol.ts re-exports and the runtime imports; the runtime's `emit` and its listener use it.
- The runtime's two host `message` listeners (:3605 and :3693) become one; `theme` is handled once (today both run).
- The dead `canvas-spacing` message, `canvasSpacing` and its overlay boxes (from :3372, drawn at :3540) go (the control went in 7aab54e6; `native-canvas.spec.ts` "the removed spacing control…" stays green).
- palette.ts (:697-705, `shortcut`) and refusal-note.ts (:89-103, `refusal-note-action`) subscribe through the preview link (a `link.on` handed in, or an `onFrameMessage` the preview exposes) instead of their own `window` listeners that scan `.native-preview-frame`s.

## Done when

- `tests/preview-wire.test.ts`: every `emit("…")` type in the runtime source is a `FrameMessage` type, and every type the runtime's listener handles is a `HostMessage` type (read from the source text; the guard fails on an unknown name).
- `npm run test:budget` passes; report the runtime's byte delta.
- `npm run check`, `npm test`, full `native-save` and `native-preview` suites green.
