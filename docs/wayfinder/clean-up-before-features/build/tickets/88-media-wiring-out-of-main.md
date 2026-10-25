---
title: "Media wiring leaves main.ts"
type: task (AFK)
status: closed
assignee: lead-88
builder: claude
blocked_by: [86-workspace-mount-out-of-main]
---

## Goal

`main.ts` towards about 500 lines ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). Split out of [85](85-main-ts-wiring-only.md) on 2026-10-25: after slice 70 `src/main.ts` was 2,863 lines, not the planned about 1,350, so the lead split the last cut into 86–89 plus a short 85.

Lines at `8d85f59d`: image paths, uploads, discard and media text (`nativeImagePaths` to `readMediaText`, 1731–1795), `mediaOrigins` (1796–1899), the media controller construction, `mediaIdentity`, the lazy media batch and `applyMediaBatch` (1900–1923) move into a media host module beside `src/controllers/media-controller.ts`. About −200 lines.

## Decided behaviour

No visible change.

## Files

- `src/main.ts` (that region), the new media host module (name is the builder's), its unit tests
- `tests/main-ts-ceiling.test.ts`, `tests/workspace-session-guard.test.ts` (entries follow moved functions), `docs/agents/code-map.md`

## Done when

- A moved function keeps its body (CODING_STANDARDS "Controllers"); ports are live (getters for `let` state) and typed with `satisfies` in tests; "Module order holds".
- `tests/main-ts-ceiling.test.ts` set to the new count rounded up to 10; `docs/agents/code-map.md` names the new module and the moved functions.
- `kit size` at or under 362 KB (Lex, 2026-10-25; [TD 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)) (report the delta); `npm run check`, `npm test`, `kit specs --affected` green.
- The `native-media-*` specs green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Starts after 86; may run beside 87 or 89.

- `kit doctor`; `kit bg slice-88 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/88-media-wiring-out-of-main.md --builder claude-opus-5-5`; `kit wait job slice-88 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5 kit review --ticket <this ticket>` (read-only). Land: `kit pr --ticket <this ticket>`.
- Report: `main.ts` lines before and after and the new ceiling, the module created, unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA.

## Done (2026-10-25)

No visible change: Media, the pickers, uploads, discarding an upload and the usage check behave as before.

- New `src/controllers/media-host.ts` (`createMediaHost`, `MediaHostPorts`), beside the media controller, holds `nativeImagePaths`, `uploadFilesTo`, `discardUpload`, `readMediaText`, `mediaOrigins`, the background pages, the media controller's ports (`mediaPorts`) and `mediaController`, the usage check's pause after typing, `mediaIdentity`, the lazy media batch and `applyMediaBatch`. Each body moved as it was plus `ports.` prefixes; the other changes are the import paths (one folder down), shorthand properties written out (`findEntry: ports.findEntry`, …) and `mediaPorts` typed by the imported `MediaControllerPorts`. `main.ts` destructures `mediaPorts`, `mediaController`, `nativeImagePaths`, `uploadFilesTo`, `discardUpload`, `readMediaText` and `mediaOrigins` from `media`.
- `main.ts` makes the host where the region was, before Pages & files and the workspace, which take its functions. Ports are live: `nativePreview`, `pagesController` and `workspace` go in as getters; `setupScope`, `afterFileChanges`, `openAfter` and `restoreFile`, declared further down, as arrows.
- `src/main.ts` 1,717 → 1,533 lines (−184); ceiling 1,720 → 1,540. Rebased by the lead onto slice 89 (2026-10-25): 1,039 → 855 lines, ceiling 1,040 → 860; `nativeImagePaths` goes to the page-builder host as an arrow (declared later now). `tests/main-ts-ceiling.test.ts` also checks that the media host's members are not used before their line and that `createMediaHost` gets no `let` by value or later const by name. `tests/main-media-preview.test.ts` reads the image popup's `picture` from the new module. `tests/workspace-session-guard.test.ts` needed no change (no allowlist entry was in the moved code). `docs/agents/code-map.md` names the module and the moved functions and shifts the `main.ts` section lines.
- Tests: new `tests/media-host.test.ts` (ports typed with `satisfies`, the real runtime, app store and drafts; five modules stubbed (listed at the end)) covers: the images an Address suggests (branch and drafted images, sorted, deleted ones left out); media text read at once when held, read from the branch once and kept, dropped when the text index's key moves on during the read, none for a deleted file, a moved file's blob text; the site's own origins from its Site address and CNAME; discarding an upload (removed, "Discarded photo.png." and a file resync), nothing for a draft that is not an upload, nothing once its stamp (the default one, as before the move) no longer holds; no files added with no repository open; the controller's ports reading load, scope, page label and Media tab at call time, `restoreFile` with the epoch's stamp and `linkDefaultStyle: false`; an image measured in the preview only while it shows that page; a media batch going to the page asked for, else the page open, with the repository stamp, and its refresh (the edit bar only with a selection); files added speaking only while their workspace shows and counting as finished there after a switch, and sending pictures to Optimise only with Files' tabs on show; sources kept with the site (pages, stylesheets and media records as the site's, the rest in the text index) and nothing without one; media text dropped and not kept when its draft is replaced or the text index's key moves on at any await (`forEachAwait`, for an upload, a moved file and a branch file); an upload left as it was when its draft or records change, or its stamp stops holding, while the discard rules load; draft changes clearing the usage check each time and running it once after a 400 ms pause; Improve images opening a page only when another is open and waiting until the canvas shows it, giving up after 5 s; work away from its workspace measuring in one background page of its site, and in none with no site; the gallery's host dropping Media's hint and the gallery visible only on Media's open explorer; discard asking the default stamp; work pinned to a workspace no longer shown reading its entries from its own snapshot, seeding the index first; the usage check's key only once the text index is for it; Media listing the branch's files and asking for a repository with none open; files that fail to be added saying why and adding nothing; a placed image selected after the canvas updates and flashed. The upload bytes, the media batch's step, the Files adding and the background pages are stubbed modules.
- Specs: `native-media-*` and `native-improve-images`: `RESULT: ok specs 22/22 passed`.
- Unit: `kit unit --affected` `RESULT: ok unit 41/41 (3 files)` (`tests/media-host.test.ts` 27/27); `npm test` 5540/5540; `npm run check` and `npm run lint` green; `kit specs --affected` `RESULT: ok specs 1/1 passed`.
- Commits: the move, its tests and review rounds 1–3 squashed by the lead into one commit before the rebase onto slice 89, then the rebase fixes (imports, `nativeImagePaths` as an arrow, ceiling 860).
- `kit size` after the rebase onto slice 89: `RESULT: ok size boot 357 KB (±0 KB) vs dev@7a2cd4c, budget 362 KB` (the move itself added about 1 KB against dev before 89).

### Follow-ups

- Test that `viewingVersion` reads `versions.view` when called: a media-host test with `versions` as a mutable `{ view?: unknown }`; `mediaPorts.viewingVersion()` false, set `view = {}`, then true.
- Test the Optimise `review` callback (`tests/media-host.test.ts`, today only checked to be a function): with the pin current, `review(images, "images", reasons)` calls `workspace.explorerDropdown.open`, `pagesController.selectTab("media")` and `mediaController.reviewInGallery`; after `session.next(...)` it calls none of them.
- One table-driven test for the forwarding ports: `refreshDescriptions` (edit bar only with a selection), `change` (`pageStructureController.editOpenPage` with its arguments), `finishedAway` (`finishedWork.add(scope, "media")`), `stamp` (`guardedEdits.stamp("repository")`) and `cleanUp.place` (`setupScope()` when called).
- Test `imagePopup.frame`, `imagePopup.bar` and `mediaPlay` (`send`, `box`, `frame`, `watch`): stub `late.elements.main.querySelector(".native-preview-frame")` and a `late.preview` recording `playMedia`; `frame()` returns the rect, `send` reaches `playMedia`, `watch` fires on `appStore.selection` changes.
- Fewer media-host ports (`src/controllers/media-host.ts`, CODING_STANDARDS "Controllers"): group the forwarded reads (`entryAt`, `findEntry`, `readFile`, `readBlob`, `listRepositoryFiles`) under one `reads` port; `setupScope` and `cleanUp` duplicate data the controller already gets. Fold into TD 12.
- `tests/media-host.test.ts`: each `setup()` leaves an `effect` and a 400 ms timer running; return a `dispose` from `createMediaHost` or stub `refreshUsage` in `setup()`.
- Kit: `kit fix` writes each follow-up cut off at a fixed length; write them in full (seen on slice 88).
- Standards (P3): 0f6ad38a:src/controllers/media-host.ts:139 — P3: CODING_STANDARDS "Controllers" says ports cost bytes and asks for few, short port names. `MediaHostPorts` adds 
- Standards (P3): 0f6ad38a:src/controllers/media-host.ts:356 — P3: CODING_STANDARDS "Controllers" (unit tests assert behaviour through the real controller). The usage-check `effe
- Validation gaps (gap): `viewingVersion` read at call time: pass `versions` as a mutable `{ view?: unknown }`. Assert `mediaPorts.viewingVersion()` is false, set `view = {}`, then asse
- Validation gaps (gap): The Optimise `review` callback in `uploadFilesTo` (`media-host.ts:206-210`): today the test only checks it is a function (`tests/media-host.test.ts:1029`). Call
- Validation gaps (gap): The `context` option handed to `addFilesTo` (`media-host.ts:204`): capture `given.context` in `stubs.adding`. Assert `context()` returns `mediaController.worksp
- Validation gaps (gap): The `own.text` fallback in `measureAway` (`media-host.ts:267`): make the background-page stub's `work` call `own.text("other.html")` for a file the pin doesn't 
- Validation gaps (gap): The forwarding ports, as one table-driven test: `refreshDescriptions`: renders the edit bar only with a selection. `change`: calls `pageStructureController.edit
- Validation gaps (gap): `imagePopup.bar`, `imagePopup.frame` and `mediaPlay` (`send`, `box`, `frame`, `watch`): stub `late.elements.main.querySelector(".native-preview-frame")` and a `
- Validation gaps (gap): `mediaPorts.workspace()` with no snapshot: set `appStore.snapshot.value = undefined` and assert it returns `undefined`.
