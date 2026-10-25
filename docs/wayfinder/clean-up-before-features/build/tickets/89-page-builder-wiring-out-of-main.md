---
title: "Page-builder wiring leaves main.ts"
type: task (AFK)
status: closed
assignee: lead-89
builder: claude
blocked_by: [87-site-loading-out-of-main]
---

## Goal

`main.ts` towards about 500 lines ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). Split out of [85](85-main-ts-wiring-only.md) on 2026-10-25: after slice 70 `src/main.ts` was 2,863 lines, not the planned about 1,350, so the lead split the last cut into 86–89 plus a short 85.

Lines at `8d85f59d`: the command palette, `componentPorts`, `insertNativeComponent`, the editor workspace, block moves and `dragPageBlock` (635–1022), preview selection, `nativeCssWorkspace`, Page Structure, instance content, page meta and the page-builder site controls (1023–1488), and the card grids (2529–2615) move into one or two page-builder host modules that own their state (from [85](85-main-ts-wiring-only.md)'s comment: `nativeAddPoints`, `nativeVariantFiles`, `nativeLinkParents`, `nativeStructurePaintedSources`, `nativeStructurePaints`, `nativeComponentFieldToken`, `nativeComponentFieldSnapshot`). About −950 lines; the builder may split it into palette and component tools, and selection and structure.

## Decided behaviour

No visible change. Click-to-type (ticket 28) and drag-moves-the-block behave as now.

## Files

- `src/main.ts` (those regions), new host module(s) (names are the builder's), their unit tests
- `src/controllers/command-palette-controller.ts`, `src/controllers/preview-selection-controller.ts`, `src/controllers/page-structure-controller.ts` (ports only)
- `tests/main-ts-ceiling.test.ts`, `tests/workspace-session-guard.test.ts`, `docs/agents/code-map.md`

## Done when

- A moved function keeps its body (CODING_STANDARDS "Controllers"); ports are live (getters for `let` state) and typed with `satisfies` in tests; "Module order holds".
- `tests/main-ts-ceiling.test.ts` set to the new count rounded up to 10; `docs/agents/code-map.md` names the new module and the moved functions.
- `kit size` at or under 362 KB (Lex, 2026-10-25; [TD 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)) (report the delta); `npm run check`, `npm test`, `kit specs --affected` green.
- The page-builder, click-to-type and Page Structure specs green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Starts after 87; may run beside 88.

- `kit doctor`; `kit bg slice-89 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/89-page-builder-wiring-out-of-main.md --builder claude-opus-5-5`; `kit wait job slice-89 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5 kit review --ticket <this ticket>` (read-only). Land: `kit pr --ticket <this ticket>`.
- Report: `main.ts` lines before and after and the new ceiling, the module created, unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA.

## Done (2026-10-25)

No visible change: click-to-type, drags, inserts, the palette, Page Structure and the settings dialogs behave as before.

- `src/page-builder-host.ts` (`createPageBuilderHost`, `PageBuilderHostPorts`): the command palette (`paletteController`), component tools' ports (`mountComponentTools`, `componentPorts`), section inserts (`nativeSectionChoices`, `nativeAddPoints`, `nativeElementAddPoint`, `nativeComponentLoaderPlan`, `insertNativeComponent`, `finishRailTyping`), block moves and drags (`blockMoves`, `blockInsertPorts`, `loadBlockDrag`, `structureDrop`, `dragPageBlock`, `loadBlockInsert`), `previewSelection`, the Variant lookup's files (`nativeVariantFiles`, `readVariantFiles`), `nativeCssWorkspace`, the edit bar and Page Structure controller with its helpers (`pageStructureController`, `nearestLink`, `wholeWrapper`, `nativeLinkParents`, `nativeInstanceContent`, `nativeNamedDescendant`, `nativePictureSources`, `nativeComponentFieldsRevision` with its token and snapshot), `elementMenuItems`, page meta (`nativePageMeta`, `writeNativePageMeta`), the site controls (`nativeNavigationTarget`, `openNativePageSettings`, `openNativeSiteSettings`, `openNativeNavigation`, `refreshNativeRoutes`, `nativeMoveItems`) and `cards`. The host owns their state.
- Bodies moved as they were. Consts and functions main.ts never reassigns are read once at the top of the host, so those bodies are unchanged; `let` state and later consts stay `ports.` reads. Two other changes, both to save bytes: Page Structure controller ports that were getters for consts or functions now pass them by value, and preview selection's `scope`, `componentTag`, `instanceContent`, `locateTag`, `agentContext` and cards' `siteRead` take the function itself instead of an arrow that only forwarded to it.
- Stays in main.ts: the editor workspace, `guardedEdits` and `parkedSteps` (main.ts owns transactions), `componentTools`, `nativePreview` and `pageStructure`. The Page Structure rows' paints, their stale words, `STILL_UPDATING` and `previewElementMenu` went to `src/workspace-mount.ts` with slice 86, the only reader.
- main.ts makes the host right after `parkedSteps`, before anything hands its members on (the workspace host takes them by value further down). `let` state (`nativePreview`, `pageStructure`, `componentTools`, `fileGeneration` with a setter) and later consts (`workspace`, `codePanes`, `nativeHistoryShares`, `versions`, `linkedStyles`, `mediaController`, `pagesController`, `pagesAndFiles`, `agentController`) go in as getters, later functions (`setupScope`, `nativeHistorySession`, `restoreFile`, `ensureExplorer`, `openCreate`, `nativeSiteReadForCreate`) as arrows. The palette and page meta read `workspace.explorerDropdown` and `workspace.sidebarResize`, as on dev, through one `workspace` port.
- main.ts, rebased on dev after slices 86 and 87: 1,717 → 1,039 lines (−678, against the Goal's about −950: the editor workspace, guarded edits and parked steps stay); ceiling 1,040. `kit size`: boot 357 KB (+1 KB; exactly +527 bytes before first paint, 364,582 → 365,109 of 370,688), budget 362 KB.
- Tests: `tests/page-builder-host.test.ts` (making the host reads no later const, page meta, the navigation target, an add point refused once the workspace loads again, the component fields revision, a new page routing at once, a title written as one guarded edit, the Variant lookup's site, clearing the selection writing `fileGeneration` through its setter and throwing without one, a template's open intent read against the setup scope at call time), ports typed with `satisfies`. `tests/main-ts-ceiling.test.ts` also checks the host gets `let` state through accessors (`fileGeneration` with a setter) and later consts through arrows, and that its members are used before their destructuring only inside functions. `docs/agents/code-map.md` names the module and the moved functions.
- Tests also cover History's version shown after a place was planned refusing the insert, the rail building in a template Edit component mode opened after the host was made, and the Variant lookup's background read (one read for two asks, refreshes once read, none once the workspace loads again), a rail click ending when the page did not answer its typing, Navigation's opener writing nothing once the workspace loads again at either wait (`forEachAwait`), and CSS code intelligence reading History's version at call time.
- Commits: the move and review rounds 1–3 (04a72ca4, 473c60aa, 0fbda602, 5816c509), squashed and rebased onto dev as one commit.

### Follow-ups

- Tests (lead-89/20261025T031601Z): `forEachAwait` races for `openNativePageSettings` and for `openNativeSiteSettings` (race `ensureNativeTextIndex` and `loadSiteSettings`, `workspaceSession.next()` at each wait; `.page` / `.site` never called, no errors).
- Test: `writeNativePageMeta` on the open, mounted page goes through `guardedEdits.now` with group `page-meta:<path>:<field>`, and `group = false` passes `undefined`.
- Test: `componentPorts().openFile` opens again when a shared history session differs (`shareHistory`, then `openFile` with the file mounted under another session calls `restoreFile`; disposing the share empties `nativeHistoryShares`).
- Validation gaps (gap): `tests/page-builder-host.test.ts:1952`: the test "making the host reads none of main.ts's later consts" only makes the late getters throw. The arrows for functi
- Validation gaps (gap): `writeNativePageMeta` refreshing the Pages tree goes untested: the fixture's `workspace.explorerDropdown` is always `undefined`. Add a case where `workspace` re
- Validation gaps (gap): The ticket's Follow-ups already list three more: `forEachAwait` races for `openNativePageSettings` and `openNativeSiteSettings`; `writeNativePageMeta` going thr
