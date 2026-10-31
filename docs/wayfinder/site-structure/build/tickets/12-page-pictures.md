---
title: "Pictures of pages, taken in the browser and kept"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Every page gets a small picture, taken inside its own sandboxed frame and kept in the browser, for the site map and the project overview ([ticket 04](../../tickets/04-grill-map-behaviour.md#resolution-2026-10-26), [ticket 07](../../tickets/07-grill-project-overview.md#resolution-2026-10-26); research 01, sections "Taking a picture" and "Where pictures live"; research 03, section 1). Size: L.

## Decided behaviour

- **Engine:** snapdom (MIT), loaded only inside the frame that takes pictures, from a same-origin script URL like the preview runtime's, so the CSP stays as it is (Lex, 2026-10-26: snapdom now, the browser's HTML-in-Canvas once it ships everywhere). The engine sits behind one small function, so the switch later is one change.
- **A "picture" message** in the preview runtime (`src/components/native-preview-runtime.js`), beside `inspectWhenSettled`: draw the page at 1280×800 (its top screen, Lex's choice of same-size tiles), encode a 640×400 WebP, post it out as a Blob.
- **When pictures are taken:** after the visible preview has shown a page and editing has paused about 2 s; and on request from the map, through one reused helper frame that is on screen (tiny), because Chrome throttles hidden frames to about 2 s a page.
- **Store:** IndexedDB `native-site-editor-pictures`, keyed by project (as `WorkspaceScope`, `src/workspace-session.ts`), page path and a fingerprint of the page source, the shared CSS and the components it uses. A changed fingerprint keeps showing the old picture until the new one replaces it, with no marker. Same shape as `indexedDbUploadBytes` in `src/uploads.ts`.
- **Where it fails** (a browser that refuses, a page that won't draw), there is simply no picture: the map shows the name block and the overview the coloured letter. Pictures can always be taken again (Safari may clear storage).
- Never written into the repository.

## Files

Expected: `src/page-pictures/` (new: store, fingerprint, request queue), `src/components/native-preview-runtime.js` (picture message), `src/components/native-preview.ts`, the engine script entry, unit tests (keys, fingerprint changes, store), a spec that takes the home page's picture on the fake GitHub server.

## Done when

- A spec opens the starter, waits for the home page's picture, edits the page and sees a new picture with a new fingerprint.
- 60 pages through the helper frame take under 10 s on this machine (time in Done).
- The picture of a page with components shows them (checked in the spec's saved image).
- WebKit: the lead tries the picture in WebKit where Playwright's WebKit starts (it didn't on the research machine); the result is in Done.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-ss-12 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ss-12 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower (the 355 KB goal of [tech-debt 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md); everything here loads lazily).
- `kit size`: the engine is in its own chunk, loaded only by the picture frame.
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
