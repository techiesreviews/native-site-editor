---
title: "Preview link: one module matches replies and render versions and drops stale messages (fake frame for tests)"
type: task (AFK)
status: open
assignee:
blocked_by: [25-protocol-types-and-reader]
builder: claude ★
phase: 2
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/frame-protocol-design.md (sections 2, 4.3). Does not need sturdy slice 10.

- `src/components/preview-link.ts`: `createPreviewLink(port: FramePort)` → `send`, `stale`, `render`, `ask`, `on`, `drawn`, `reload` (section 4.3). It owns what native-preview.ts keeps today: `context`/`renderVersion` (:511, :676), `sentStructureSnapshot` (:533, painted sources per render token), `staleClick` (:538), the probe (:512-531), `inspections` (:615-617), `typingFinishes` (:702-717), `patchMisses` (:601), `postedRoutes`/`messageId` (:602, :642-659) and the `ready` load check (:862). Messages reach `on` handlers only when fresh by `FRESHNESS`, with the painted sources for render messages; host-state checks (viewing, alone, page on show) stay with the callers.
- Adapters: `iframeFramePort(frame)` (posts with `HOST_SOURCE`; one `message` listener filtered by `event.source === frame.contentWindow`); `tests/fakes/fake-frame.ts` (records posted `HostMessage`s; `emit(type, fields, { context })` answers as the runtime; `context()` gives the token of the last `update`).
- native-preview.ts: `onMessage` becomes `link.on(...)` registrations; `probeDrop`, `inspect`, `finishTyping`, `patchText` use `link.ask`; `post`/`schedule` use `link.render`/`link.stale`; every `frame.contentWindow?.postMessage` there and in card-grid-controls.ts goes through `link.send`.

**Bugs this fixes:** `inspect-result` and `ack` are replies matched by id, never dropped by the render token (today an agent's inspection is lost, and times out after 8 s, when any render is requested while the runtime waits for fonts; an `ack` for a render followed by an unposted one never reports the route shown). Pending asks end on `reload` (the `patchMisses` leak).

## Done when

- `tests/preview-link.test.ts` on the fake frame with `node:test` mock timers: a stale `select`/`structure`/`insert-points` is dropped and a fresh one delivered with its painted sources; a stale click becomes the next refresh's click and `clear-selection` forgets it; an action from an old render is delivered; `inspect-result` survives a render requested meanwhile (the bug); `ack` after a newer `stale()` still reports the route; a probe answered after `stale()` gives undefined; each ask times out to undefined; a late `ready` from the replaced document is ignored; `reload` ends pending asks.
- No `postMessage` or `addEventListener("message"` left in native-preview.ts or card-grid-controls.ts.
- `npm run check`, `npm test`, full `native-save` and `native-preview` suites green.
