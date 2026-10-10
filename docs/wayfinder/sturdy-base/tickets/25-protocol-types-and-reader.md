---
title: "Typed preview protocol: message unions and one reader, no casts in onMessage"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 2
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/frame-protocol-design.md (sections 2, 4.3). Editor side only; the wire format does not change (browser specs post raw messages). No behaviour change. Does not need sturdy slice 10. Order: after 21-24 by preference (native-preview.ts is shared with 20 in one line), not by dependency.

- `src/components/preview-protocol.ts`: `FrameMessage` (the 30 types the runtime sends: the 28 `onMessage` reads, `shortcut`, `refusal-note-action`) and `HostMessage` (the 21 the editor sends, including card-grid-controls.ts' `scroll-by` and `item-grid-track`) as discriminated unions; `FRAME_SOURCE`/`HOST_SOURCE`; `FRESHNESS` per frame type (`action` / `render` / `whole` / `reply` / `lifecycle`, press-drag by phase) as in section 4.3, used by slice 26.
- `readFrameMessage(data: unknown): FrameMessage | undefined`: every check and limit `onMessage` does today moves here (indexes, 500-step paths, 100 000-char text, 2000 structure items at depth 12, 500 insert points, 200 pins, `readRect`, `readItemGrid`, `readHost`, `readHostChain`, `readTextSelection`, `parseDropReport` input, slot-ghost and cascade readers by reference). Checks that need host state (a path in `nativeSitePaths(site)`, the route's page, `viewing`) stay in native-preview.ts.
- `onMessage` reads once and switches on `message.type`; the branch bodies keep their order and logic (a moved function keeps its body), with no `as` casts on message data.

## Done when

- `tests/preview-protocol.test.ts`: per type, a valid message reads and a malformed one (wrong types, too long, out of limits, missing `source`) does not.
- `rg " as \{" src/components/native-preview.ts` finds no cast of message data.
- `npm run check`, `npm test`, full `native-save` and `native-preview` suites green.
