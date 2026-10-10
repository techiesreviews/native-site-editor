---
title: "Typed preview protocol: message unions and one reader, no casts in onMessage"
type: task (AFK)
status: closed
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

## Done (2026-10-10)

- `src/components/preview-protocol.ts`: `FrameMessage` (30) and `HostMessage` (21) unions, `FRAME_SOURCE`/`HOST_SOURCE`, `FRESHNESS` (press-drag by phase) and `readFrameMessage`, which does every shape check and limit; a field a branch acts without (select's path, a press start's node) reads as undefined instead of dropping the message. `onMessage` reads once, keeps its branches, order and host-state checks (site paths, page on show, context, probe, painted sources), no casts; senders are checked with `satisfies HostMessage`. No behaviour change.
- Sol stalled after drafting the protocol file; Claude finished the slice. Review (Sol): no spec defects; the eager reader throws earlier than before on forged arrays with shadowed methods (rejected: page-script-only input, the message is ignored either way); two limit tests added.
- Commits: see `git log --grep "preview protocol\|preview-protocol"` on dev. Tests: `tests/preview-protocol.test.ts`. Unit 1,730/1,730; full native-save 873 passed, 56 skipped; native-preview 17/17; smoke 42/42; @actual 54/54. Budget 335 KB of 355 KB.
