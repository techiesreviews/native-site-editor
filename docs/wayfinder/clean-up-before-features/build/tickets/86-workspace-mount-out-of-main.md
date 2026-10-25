---
title: "Workspace mount and close leave main.ts"
type: task (AFK)
status: open
assignee: lead-86
builder: claude
blocked_by: [70-pass-throughs-and-discard]
---

## Goal

`main.ts` towards about 500 lines ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). Split out of [85](85-main-ts-wiring-only.md) on 2026-10-25: after slice 70 `src/main.ts` was 2,863 lines, not the planned about 1,350, so the lead split the last cut into 86–89 plus a short 85.

Lines at `8d85f59d`: the code panes wiring and `openCodeEditor` (258–340), `mountWorkspace` (340–635), `closeWorkspace` and `showDirectory` (2419–2524) and the checklist's account, repository and branch (2471–2528) move into `src/workspace-mount.ts`, which owns their module state. About −480 lines.

## Decided behaviour

No visible change.

## Files

- `src/main.ts` (those regions), `src/workspace-mount.ts` (new), `tests/workspace-mount.test.ts` (new)
- `tests/main-ts-ceiling.test.ts`, `docs/agents/code-map.md`

## Done when

- A moved function keeps its body (CODING_STANDARDS "Controllers"); ports are live (getters for `let` state) and typed with `satisfies` in tests; "Module order holds".
- `tests/main-ts-ceiling.test.ts` set to the new count rounded up to 10; `docs/agents/code-map.md` names the new module and the moved functions.
- `kit size` at or under 355 KB (report the delta); `npm run check`, `npm test`, `kit specs --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). May run beside 87; at most two slices in `main.ts` at once.

- `kit doctor`; `kit bg slice-86 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/86-workspace-mount-out-of-main.md --builder claude-opus-5-5`; `kit wait job slice-86 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `ASE_REVIEW_MODEL=claude-opus-5-5 kit review --ticket <this ticket>` (read-only). Land: `kit pr --ticket <this ticket>`.
- Report: `main.ts` lines before and after and the new ceiling, the module created, unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA.

## Done (2026-10-25)

- New `src/workspace-mount.ts` (`createWorkspaceMount`, `WorkspaceMountPorts`) holds the code panes' wiring (`codePanes`, the unmounted-Undo hook, the Monaco view loader), the source editor's state and `nativeHistorySession`, `closeEditor`, `openCodeEditor`, `mountWorkspace`, `closeWorkspace`, `setupScope` and `showDirectory`. Each moved function keeps its body with `ports.` prefixes on host values; `announce` and `cards`, shorthand in the old body, read `announce: ports.announce` and `cards: ports.cards`. Most of the main.ts functions it uses come in a few short-named groups, so their bodies read `ports.site.update()` for `updateNativePreviewSources()`, and so on: `site` (the open site's loading and preview: `active`, `deactivate`, `update`, `painted`, `assets`, `shown`, `routeSources`, `styles`, `files`, `route`), `builder` (the Add panel and rail, block drags, element menus and component tools: `choices`, `addPoint`, `addPoints`, `insert`, `drag`, `dropTree`, `loadDrag`, `loadInsert`, `insertPorts`, `finishTyping`, `menuItems`, `fields`, `moveItems`, `tools`), `page` (`meta`, `writeMeta`, `settings`, `navigation`, `siteSettings`) and `account` (`reload`, `switchTo`, `signOut`, `choose`, `load`). `mountExplorer`, `loadPagesActions` and `filesTreeController` are read from the `pagesAndFiles` host, and `setupController`, `setupEntry` and `startSitePanel` from the `setup` host.
- The module owns the workspace's controls (`repositorySelect`, `branchSelect`, `refreshButton`, `content`, `files`, `explorerDropdown`, `repositoryMenu`, `siteActions`, `sidebarResize`, `blockRail`), `primaryHistoryScope`, `activeFileContext`, `editorRequest`, `nativeHistoryAliases` and `nativeHistoryShares`. It also takes what only the moved code used: the preview's element menu `previewElementMenu` and its window-blur close, `nativeStructurePaintedSources`, `nativeStructurePaints` and the four stale-move and still-updating messages. `main.ts` reads the controls through the host's getters (`workspace.content`, …) and destructures its functions after the call.
- Ports are live: `info`, `repositories`, `fileGeneration`, `nativePreview`, `pageStructure`, `componentTools`, `nativePreviewBehind` and `nativeMountListener` go in as getters (with setters where the module writes them); `boot`, `agentController` and `workspaceBoot`, declared after the host, as getters, and the `account` group's repository list and workspace boot functions as arrows. The host is made after the Pages & files host, so `main.ts` hands `setupScope` and `nativeHistorySession` to earlier factories (version view, editor workspace, media cleanup, settings) and `closeWorkspace` and `showDirectory` to the setup and Pages & files hosts through arrows.
- `nativeMountListener` stays a `let` in `main.ts`: the guarded edit module sets it while `main.ts` is still loading, before the host exists.
- `src/main.ts`: 2,863 → 2,399 lines (−464); ceiling 2,870 → 2,400. `tests/main-ts-ceiling.test.ts` also checks that the workspace host's destructured members are not used before their line, and that main.ts hands it no `let` by value or later const by name. `tests/workspace-session-guard.test.ts`'s `showDirectory` allowlist entry now names `src/workspace-mount.ts`.
- Tests: new `tests/workspace-mount.test.ts` (ports checked with `satisfies`, the workspace's components stubbed) covers: `mountWorkspace` hands the preview, Page Structure and component tools to the host's setters, and a remount destroys the old preview, row menu and tools; a window blur closes the row menu; choosing a branch sets it before the snapshot loads and hands over to the explorer; the repository menu's switch, reload and sign-out reach the ports when run; `closeWorkspace` closes everything and clears the host's state (`repositories` [], `fileGeneration` +1, `nativePreview` gone); `showDirectory` writes a folder's summary and moves `fileGeneration`; Start your site shows only if no other file opened meanwhile; `openCodeEditor` mounts with a live share's journal, records `primaryHistoryScope` and tells the mount listener, and mounts nothing signed out; the journal order (share, alias, own key); the unmounted-Undo hook reads the component tools at call time; `setupScope` reads the scope shown; Refresh loads the snapshot and hands over to the explorer; a rail pick before typing lands is refused with "The page is still updating. Try again in a moment."; a source that changed while its editor opened shows "The source changed while its editor opened. Select it again." and mounts nothing; a code editor chunk that fails to load (a failing URL served for that import alone) shows Retry editor and one error for the editor open, and nothing for one replaced or closed; a Structure row painted from "A" offers no actions once the source is "B" and announces why, and its moves pass the open page's, the section's or the element's stale words. A finished-elsewhere note opens its scope and hands over to the explorer, the repository menu's panel loads the agent connection and the Setup checklist only when it opens, and Site settings reaches `page.siteSettings`; `closeWorkspace` also destroys the site actions. The controllers the workspace calls are typed with `satisfies` (the file type-checks clean under `tests/tsconfig.json`); `fake<T>()` is left for DOM elements, records the workspace only reads or hands on, and the component tools. A page shown by following a link redraws the preview only while `nativePreviewBehind` reads true when it shows; a rail block dropped before typing lands is refused as still updating, and one dropped after Edit component mode ended says "Edit component mode was left meanwhile: nothing was added."; a page URL change answers "The repository changed meanwhile. Try again." once the repository stamp no longer holds. The `versions` port is narrowed to `view` and `history.destroy`, and `pagesAndFiles.loadPagesActions` to a promise the workspace only waits for (types only). and each `setup()` clears the window listeners of earlier tests. `tests/main-ts-ceiling.test.ts` checks the ports inside a group (`site`, `builder`, …) as the top-level ones: a `let` by value or a later const by name in a group is named. `docs/agents/code-map.md` names the module and the moved functions.
- Validation, on the code with the port groups: `kit unit --affected` `RESULT: ok unit 38/38 (3 files)`; `npm test` 5479/5480, the one failure `tests/kit-fix.test.ts` "kit fix refuses a branch change while its builder is held", which ran beside the specs and passed 34/34 three times alone; `kit specs --affected` `RESULT: ok specs 142/142 passed` (before the types-only port narrowing; after it, `kit specs native-page-urls.spec.ts native-block-rail.spec.ts native-site-settings.spec.ts` `RESULT: ok specs 3/3 passed`); `npm run check` and `npm run lint` green.
- `kit size` `RESULT: fail size boot 355 KB over budget 355 KB`: 363,878 bytes before first paint against the budget's 363,520 and `dev`'s 361,472 (+2,406 bytes; 358 over). The port groups saved 63 bytes (from 363,941). The cost is the wiring between the two files, not the names: with one-letter port names the boot measured 102 bytes over, taking the ports apart once at the top was worse (+429 over), and the folder summary's whole body is about 415 bytes, so loading it lazily would not reach the budget either. This item needs the lead's waiver or a byte budget for slices 86–89; the ticket stays open until then.
