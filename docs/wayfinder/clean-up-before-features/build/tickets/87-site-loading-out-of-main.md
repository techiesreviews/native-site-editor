---
title: "Site loading and the text index leave main.ts"
type: task (AFK)
status: closed
assignee: lead-87
builder: claude
blocked_by: [70-pass-throughs-and-discard]
---

## Goal

`main.ts` towards about 500 lines ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). Split out of [85](85-main-ts-wiring-only.md) on 2026-10-25: after slice 70 `src/main.ts` was 2,863 lines, not the planned about 1,350, so the lead split the last cut into 86–89 plus a short 85.

Lines at `8d85f59d`: reading and loading a native site's style, shown and asset files (`readNativeStyleFiles` to `forgetDraftedAssets`, 1489–1730), component styles, the site's files and `activateNativeSite` (1929–2128), the text index, first-paint gating and page titles (`nativeTextIndexScopeKey` to `ensureNativeTextIndex`, 2129–2316), the current page label, file readers and unreadable-file warnings (2317–2418) move into one site-loading module that owns their state (among the `native*` variables in [85](85-main-ts-wiring-only.md)'s comment: `nativeTextIndexGate`). The builder may make it two modules (loading, text index) if one would pass about 600 lines. About −730 lines.

## Decided behaviour

No visible change. Boot order, first paint and the boot-memory specs stay as they are.

## Files

- `src/main.ts` (those regions), the new module(s) (names are the builder's), their unit tests
- `tests/main-ts-ceiling.test.ts`, `tests/workspace-session-guard.test.ts` (entries follow moved functions), `docs/agents/code-map.md`

## Done when

- A moved function keeps its body (CODING_STANDARDS "Controllers"); ports are live (getters for `let` state) and typed with `satisfies` in tests; "Module order holds".
- `tests/main-ts-ceiling.test.ts` set to the new count rounded up to 10; `docs/agents/code-map.md` names the new module and the moved functions.
- `kit size` at or under 355 KB (report the delta); `npm run check`, `npm test`, `kit specs --affected` green.
- `native-boot-memory.spec.ts`, `native-lazy-panels.spec.ts` and the text-search specs green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). May run beside 86; at most two slices in `main.ts` at once.

- `kit doctor`; `kit bg slice-87 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/87-site-loading-out-of-main.md --builder claude-opus-5-5`; `kit wait job slice-87 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5 kit review --ticket <this ticket>` (read-only). Land: `kit pr --ticket <this ticket>`.
- Report: `main.ts` lines before and after and the new ceiling, the module created, unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA.

## Done (2026-10-25)

No visible change: boot order, first paint and the text index behave as before.

- `src/site-loading.ts` (`createSiteLoading`): reading the page on show's files and stylesheets (`readNativeShownFiles`, `readNativeStyleFiles`, `loadNativeShownFiles`, `loadNativeStyleFiles`), assets (`loadNativeAssets`, `readBlob`, `forgetDraftedAssets`), component styles, `listRepositoryFiles`, `nativeSiteFiles`, `activateNativeSite`, the top bar's `updateCurrentPageLabel`, the file readers (`readFile`, `readFiles`, `readNativeTexts`) and unreadable-file warnings (`noteNativeUnreadable`, `nativePreviewUnreadable`, `showNativeWarnings`).
- `src/site-text-index.ts` (`createSiteTextIndex`): the text index (`nativeTextIndexScopeKey`, `startNativeTextIndex`, `wantNativeTextIndex`, `ensureNativeTextIndex`, `nativeTextIndexGate`), the first-paint wait (`afterNativePaint`, `noteNativePainted`), the Pages titles held while a row is in use (its pointer listeners, `flushPendingNativePageTitles`, `clearPendingTitles`, which replaces main.ts's two writes of `pendingNativePageTitles`) and `isNativeTextFile`.
- Bodies moved as they were plus `ports.` prefixes; the one other change is the `scope` parameter type of `startNativeTextIndex` and `indexNativeTextFiles`, now `DraftScope | undefined` (was `ReturnType<typeof draftScope>`). `setCurrentPage` and `options` stay in main.ts: they drive the editor, History and linked styles, not site loading.
- main.ts makes both right after the site runtime, before anything hands their functions on; later consts and `let` state (`repositoryIndex`, `previewSelection`, `versions`, `mediaController`, `pagesAndFiles`, `pagesController`, `nativePreview`, `pageStructure`, `componentTools`, `nativePreviewBehind`) go in as getters (a setter for `nativePreviewBehind`), the text index's start as an arrow.
- main.ts 2,863 → 2,181 lines; ceiling 2,190. `kit size`: boot 354 KB (+1 KB; the main chunk +0.8 KB gzip, port names), budget 355 KB.
- Tests: `tests/site-loading.test.ts` (no home page, the first read of what the page on show needs, an unreadable needed page, unreadable stylesheet warnings, component styles, the page label, one fetch per blob) and `tests/site-text-index.test.ts` (what the index reads, its key, unreadable files, a commit changing mid-read, the deferred start, titles held while a row is busy), ports typed with `satisfies`; `tests/main-ts-ceiling.test.ts` also checks both factories get `let` state through accessors and later consts through arrows. `docs/agents/code-map.md` names both modules and the moved functions.
