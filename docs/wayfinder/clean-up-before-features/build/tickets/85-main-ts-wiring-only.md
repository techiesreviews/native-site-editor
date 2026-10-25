---
title: "Workspace mount, palette, component tools and rail: main.ts is wiring"
type: task (AFK)
status: closed
assignee: lead-85
builder: claude
blocked_by: [11-lazy-media-and-pages, 25-boot-and-snapshot, 26-github-retries-and-toast, 31-native-site-runtime, 32-one-overlay-for-agents-and-media, 41-is-a-file-rule, 53-agent-wiring-out-of-main, 70-pass-throughs-and-discard, 80-version-and-history-out-of-main, 81-code-panes-out-of-main, 82-setup-and-login-out-of-main, 83-repositories-and-account-out-of-main, 84-files-and-pages-out-of-main, 86-workspace-mount-out-of-main, 87-site-loading-out-of-main, 88-media-wiring-out-of-main, 89-page-builder-wiring-out-of-main]
---

## Goal

The last `main.ts` slice: Lex's **about 500 lines** ([ticket 05, item 1](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22); [TD 01](../../../../work/tech-debt/issues/01-main-ts-size.md)). What is left besides wiring: `mountWorkspace` (about 330 lines), the palette, component tools, rail typing and block moves (about 400), preview selection, variants, the CSS workspace and the Page Structure controller wiring (about 250), and module state and lazy-module loaders. They move into modules that own their state; `main.ts` keeps imports, construction in order, and `boot()`.

**Re-planned 2026-10-25** (lead): after slice 70 `src/main.ts` was 2,863 lines, not about 1,350. The big moves are split out: 86 workspace mount, 87 site loading and the text index, 88 media wiring, 89 page-builder wiring (together about −2,360). This slice keeps what is left: the lazy-module loaders (`lazyModule`, about line 186), the remaining module state, and `main.ts` as imports, construction in order and `boot()`. It sets the final ceiling, closes TD 01 and lands with `kit pr --full`.

## Decided behaviour

No visible change.

Before starting, the lead re-reads `main.ts` and the earlier slices' Done notes; if the count after slice 84 is far from the estimate (about 1,350), the lead re-plans this slice (and may split it) and tells Lex in the two-line note.

## Files

- `src/main.ts`; new modules for the workspace mount (`src/workspace-mount.ts`), the component tools and rail wiring, the preview selection and CSS workspace wiring (names are the builder's)
- `src/controllers/command-palette-controller.ts`, `src/controllers/preview-selection-controller.ts`, `src/controllers/page-structure-controller.ts` (ports only)
- Tests: unit tests for each new module; `tests/main-ts-ceiling.test.ts` set to the final count; `docs/agents/code-map.md`; `docs/work/tech-debt/issues/01-main-ts-size.md` closed with the final count

## Done when

- `src/main.ts` at about 500 lines (at most 600; if more is left, the Done section lists each remaining block and why it stays).
- A moved function keeps its body; ports are live; "Module order holds" (CODING_STANDARDS).
- `kit size` at or under 362 KB (Lex, 2026-10-25; [TD 12](../../../../work/tech-debt/issues/12-boot-back-under-355-kb.md)) (report the delta); `npm run check`, `npm test`, `kit specs --affected` green; land with `kit pr --full`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Runs alone in `main.ts`.

- `kit doctor`; `kit bg slice-85 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/85-main-ts-wiring-only.md --builder claude-opus-5-5`; `kit wait job slice-85 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket> --full`.
- Report: `main.ts` lines before and after and the final ceiling, the modules created, unit and specs `RESULT:` lines, `kit size` delta, review folder and decisions, PR and merge SHA.

## Comments

- 2026-10-23, lead: moved here from slice 31 (its last P1, review lead-31/20261023T185931Z): the remaining `native*` module variables in `src/main.ts` that are screen bookkeeping rather than site data, among them `nativeHistoryAliases`, `nativeMountListener`, `nativeHistoryShares`, `nativeAddPoints`, `nativeVariantFiles`, `nativeLinkParents`, `nativeStructurePaintedSources`, `nativeStructurePaints`, `nativeComponentFieldToken`, `nativeComponentFieldSnapshot`, `nativeTextIndexGate`. Each moves to the controller or module that uses it.

## Done (2026-10-25)

No visible change: the preview, the toast and its Undo, new, uploaded and deleted drafts, the agent menu, setup's panels, Media and the settings dialogs behave as before.

- `src/main.ts` 855 → 531 lines (−324); ceiling 860 → 540. What left it, each to a new module whose bodies moved as they were plus `ports.` prefixes:
  - `src/site-preview.ts` (`createSitePreview`, `SitePreviewPorts`): `nativeModeActive`, `nativeRouteForPath`, `nativeRouteInfo`, `nativeTitles`, `nativeLinkedSheets`, `nativePageStyles`, `withSiteConfig`, `nativePreviewSources`, `updateNativePreview`, `updateNativePreviewSources`, `updateNativePreviewAssets`, `nativeComponentTagForPath`, `nativeFallbackPage` and the `nativePreviewBehind` flag (the text index reads and writes it, the workspace reads it, through `sitePreview`'s accessor). Made right after the runtime, before site loading, which takes its functions; site loading's readers go in as arrows, the preview, the version view and preview selection as getters.
  - `src/announce.ts` (`createAnnounce`): `announce`, `showToast`, `undoAction` and the toast's lazy load; made first, so every host takes them by value.
  - `src/draft-views.ts` (`createDraftViews`, `DraftViewsPorts`): `openNewDraft`, `showUpload`, `showDeletedFile`; made before Pages & files, which takes `openNewDraft`; `fileGeneration` goes in with a getter and setter.
  - `src/agent-menu-host.ts` (`createAgentMenuHost`, `AgentMenuHostPorts`): `agentContext`, the agent site host and `agentController`; made right after the agent's commands, which it takes by value.
  - `src/lazy-loaders.ts` (`createLazyLoaders`, `LazyLoadersPorts`): every `lazyModule(...)` loader and the `agentPrompts` and `onboardingCopy` state (the setup host reads them through `lazyLoaders`). Changes beyond prefixes: `guardedEdits` written out as `guardedEdits: ports.guardedEdits` in the settings' ports, and setup's actions' port object stays in `main.ts` as the `setupActions` arrow, read when they first load.
  - `src/lazy-module.ts` (`lazyModule`), `src/browser-storage.ts` (`storage`), `src/ui/select-options.ts` (`options`): unchanged bodies.
- What stays in `main.ts`, and why:
  - Imports (about 55 lines): one per module the boot builds.
  - Host handles (about 45): `app`, `element`, the GitHub reads, `editorModule`, `appStore`, `workspaceSession`, `cleanSources`, `agentPresence`, `runtime`; every host reads them.
  - The guarded edit adapter `editorWorkspace` (about 40): its ports reach nearly every host (versions, preview, component tools, agent commands, Pages & files, linked styles, the workspace); a module would take the same names through one more port object.
  - The host and controller constructions with their port lists (about 300): wiring, in construction order.
  - Small hoisted functions that hosts take by value before the host consts exist (about 45): `currentLoad`, `nextLoad`, `stampOf`, `entryAt`, `findEntry`, `shownScope`, `draftScope`, `deactivateNative`, `setCurrentPage`, `imagesSignature`, `updateAgentContext`.
  - Module `let` state shared by several hosts through accessors, each with more than one reader or writer: `componentTools`, `nativeMountListener` (set by the guarded edit adapter, read by linked styles and the workspace), `nativePreview`, `pageStructure`, `deactivatingAway`, `repositories`, `info`, `fileGeneration`. The other variables the 2026-10-23 comment names already live in `src/workspace-mount.ts`, `src/page-builder-host.ts` and `src/site-text-index.ts`.
  - Chunk recovery, the draft baseline, the boot controller and the start-up listeners (about 60): `boot()`.
- `tests/main-ts-ceiling.test.ts`: ceiling 540; the site preview's and lazy loaders' members, and those destructured straight from `createAnnounce`, `createDraftViews`, `createAgentMenuHost`, `createSiteLoading`, `createSiteTextIndex` and `createRepositoryList` (a fixture shows an early hoisted call reaching `openNewDraft` is named), are checked not to be used before their line, and `createSitePreview`, `createDraftViews` (with `fileGeneration`'s getter and setter), `createAgentMenuHost` and `createLazyLoaders` to get no `let` by value or later const by name. `tests/workspace-session-guard.test.ts`: the `openNewDraft` allowlist entry follows it to `src/draft-views.ts`. `docs/agents/code-map.md` names the new modules, redraws the `main.ts` sections and replaces `lazyModule` in Main entry points with `lazyLoaders` and `openNewDraft`. TD 01 closed with the final count.
- Tests (real runtime, app store and drafts where used; ports typed with `satisfies`):
  - `tests/site-preview.test.ts`: without a site, no route, component, fallback or update; a file's route and component, a page's title and description, the titles by route; the page shown after one is gone (nearest folder page, never itself, else home); the stylesheets pages link and the shown page's with their imports (the home page's when none is open); a page update with the route, the component, the editable template, the unreadable files, the version on show in place of its file and the site's settings, clearing the behind flag; a source update without a route, with the assets, loading assets, style files and shown files; updates waiting while no preview exists. The preview's stylesheet lookup is a stub (the module needs a browser).
  - `tests/announce.test.ts`: said in #status, shown as the toast once it loads, a quiet one only said; a toast said over before it loads not shown; the toast imported once per announcer however often it is asked for before it arrives, and shown at once after; Undo running only while its step is the newest, else refusing.
  - `tests/draft-views.test.ts`: a new draft of the open repository and branch mounting with the stamp, a counted file selection and its options, closing the explorer unless kept; another repository's or branch's draft, or none open, not opened; moved and copied files whose text is not held; an uploaded picture with its size, its image from the held bytes and Discard opening what is left; a non-picture upload without an image; a deleted file and Restore.
  - `tests/agent-menu-host.test.ts`: the menu mounting for the signed-in account (none before); its connection, requests, questions, a shown request, commands and reload reaching the editor; the context waiting for the whole site's index and describing the repository, branch, commit, drafts, site, route info, sources, existing files, the page open and the selection with the preview's route; nothing built once its stamp no longer holds or with no draft scope; the files agents read (the open repository and snapshot, the clean cache's blobs, none with no snapshot); work pinned for Media carrying the media ports' pin; before the preview exists, requests and a shown request waiting and the selection carrying no route.
  - `tests/lazy-loaders.test.ts`: setup's actions made once with their ports read on first load, the checklist and wizard waiting for them and the wizard bringing the agent prompt; Get started and Start your site loading with setup's actions (made once), the confirm dialog, History and the agent's site on their own; the agent copy after the spotlight; the settings after Pages' actions, with the guarded edits held when they load (not when the loaders were made), the load number, page labels, setup scope and a restore through the load's stamp; the media picker reading the shown and pinned workspaces and the usage check; the agent menu with the browser's records; a failed chunk import handed to chunk recovery and retried; a refused browser store keeping nothing. The lazily loaded modules are stubs.
  - `tests/select-options.test.ts`: a select's options replaced in order.
- Validation: `kit unit --affected` `RESULT: ok unit 45/45 (8 files)`; the neighbouring host and guard tests (code map, component mode, guarded reads, media kinds, exports, the page-builder, workspace, media, site loading, text index and Pages & files hosts, agent text commits, editor workspace, review findings) 401/401; `npm test` 5584/5584; `npm run check` and `npm run lint` green; `kit specs --affected` `RESULT: ok specs 61/61 passed`; `kit size` `RESULT: ok size boot 358 KB (+1 KB) vs dev@da78179, budget 362 KB`.
