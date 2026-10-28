---
title: "The preview mock-ups copy only images a mock-up uses"
type: task (AFK)
status: closed
assignee: am-38
builder: claude
blocked_by: [37-mockups-on-preview]
---

## Goal

Slice 37 (PR #246) copies every image in `docs/wayfinder/*/prototypes/` to the public preview site, including two no mock-up uses. One is a screenshot of a third-party product (`styling/prototypes/03-unblockwp-panel-reference.png`), now public at preview-editor.techies.tools/mockups/. Reference screenshots are for planning, not for publishing (lead, 2026-10-28, easy to undo; listed in the Tuesday pack).

## Decided behaviour

- `vite-mockups.ts` copies an image only when an HTML mock-up in the same map references it (`src`, `href`, `url(...)`, `srcset`), by its file name in the same folder.
- Unused images stay in the repo and are left out of the build; the next preview deploy removes the two from the site.
- Also fix ticket 37's two Done follow-ups (its missing `Commits:` line and review-round lines; the "byte-identical except `_headers`" wording).

## Files

- `vite-mockups.ts`, `tests/vite-mockups.test.ts`
- `docs/wayfinder/agents-and-multiplayer/build/tickets/37-mockups-on-preview.md` (Done only)

## Done when

- A test with a used and an unused image in one map copies only the used one; fails before the fix.
- After `kit preview`, `/mockups/styling/03-unblockwp-panel-reference.png` answers 404, and every mock-up still loads its images (the existing browser check over all real mock-ups passes).
- `kit unit --affected`, `npm run check`, lint pass.

## Kit commands and evidence

`kit doctor`, `kit slice --ticket <this> --builder claude-opus-5-5`, `kit unit --affected`, `kit review`, `kit pr`, `kit preview`; report the RESULT lines and the 404 check.

## Done (2026-10-28)

- `vite-mockups.ts`: `mockupFiles` still lists every HTML mock-up, but an image beside them only when an HTML mock-up in the same map points at it by file name (`src`, `href`, `srcset` and `url(...)`, quoted or bare; `./`, query, fragment and `%20`-style escapes ignored; paths into other folders don't count). Unused images stay in the repo and out of the build. No real mock-up uses an image today, so both reference images (`styling/…/03-unblockwp-panel-reference.png`, `agents-and-multiplayer/…/12-caret-circle-reference.png`) leave `/mockups/` at the next preview deploy.
- Tests (`tests/vite-mockups.test.ts`): `referencedFiles` over every reference form; a Vite build of a map with a used image, one named only in notes and the map file, and one used only from another map copies only the used one (failed on the old code with all three copied). The browser check over all real mock-ups now also fails on any image request that errors or answers non-2xx, keeps the sandbox's same-site image check with a stand-in `probe.png`, and asserts on the built site that `/mockups/styling/03-unblockwp-panel-reference.png` answers 404 and the caret reference no longer loads.
- Ticket 37's Done: `Commits:` line, one line per review round, and the `_headers` exception in the byte-identical sentence.
- `RESULT: ok unit 11/11 (1 files)`; `npm run check` and `npm run lint` exit 0.
- `kit preview` not run here (lead's step); the 404 for `/mockups/styling/03-unblockwp-panel-reference.png` is shown locally by the browser check.
- Feature list: no change (planning pages on the preview site, not an editor feature).
