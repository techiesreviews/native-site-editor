---
title: "Preview link: one module matches replies and render versions and drops stale messages (fake frame for tests)"
type: task (AFK)
status: closed
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

## Done (2026-10-11)

- `src/components/preview-link.ts` (`createPreviewLink`, `iframeFramePort`) owns the render token, painted sources, request ids and timeouts, the stale-click carry-over and the load number; `onMessage` became typed `link.on` handlers with the old bodies; `probeDrop`, `inspect`, `finishTyping` and text patches use `link.ask`; native-preview.ts and card-grid-controls.ts (new `send` parameter) post only through `link.send`. Fixed: `inspect-result` and `ack` are matched by id, never dropped by a newer render; pending asks end on reload and destroy.
- Intended small differences: a stale press-drag start no longer cancels a press in progress; `clear-selection` (also from History) forgets a carried click; a refresh standing for a stale click closes the element menu as a click does; patch answers time out after 5 s (was a 64-entry cap); ids share one counter.
- Tests: `tests/preview-link.test.ts` (15) on `tests/fakes/fake-frame.ts`. Unit 1,840/1,840; full native-save 873 passed, 56 skipped; native-preview 17/17; smoke 42/42; @actual 54/54. Budget 336 KB of 355 KB. Review (Sol): one finding (the menu dismissal above) accepted as named; post-throw cleanup added.

