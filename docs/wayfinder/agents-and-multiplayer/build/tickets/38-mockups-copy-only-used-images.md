---
title: "The preview mock-ups copy only images a mock-up uses"
type: task (AFK)
status: open
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
