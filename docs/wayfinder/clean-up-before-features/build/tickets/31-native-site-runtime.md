---
title: "The native site runtime owns the open site's state"
type: task (AFK)
status: open
assignee: lead-31
builder: claude
blocked_by: [30-site-overlay-rule]
---

## Goal

Candidate #2, slice b (research 01 §2), the biggest `main.ts` cut (about −900). About 40 `native*` module variables (base sources, drafts overlay, file graph, style, asset and shown-file caches, unreadable files, text index) and `deactivateNative()` (which resets 22 of them by hand) move into one module with a small interface. The preview adapter stays in `main.ts`.

## Decided behaviour

- No visible change. [Ticket 05, item 3](../../tickets/05-grill-architecture-choices.md#resolution-2026-10-22) is prepared here (one owner of the effective source) and finished in slice 32.
- Rides along ([TD 10](../../../../work/tech-debt/issues/10-preload-and-structure-limits.md), lead decision): the stale-predicted-read test that passes with or without its fix gets a case that fails without it.

## Shape (lead's design, from research 01)

`src/native-site-runtime.ts` (no DOM): `source(path)`, `textSource(path)` (the media variant), `files()`, `newDraftPaths(options)` (slice 30's rule), `shownPaths(route)`, `adoptSaved(result)`, `reset()`. Ports: the workspace session, the draft store, GitHub reads and the mounted editor. If the interface grows past about ten members, stop and say so in `decide`.

## Files

- `src/main.ts` (1805–3060 at `89ac5e0e`, plus 3440–3480 and 4006–4060), new `src/native-site-runtime.ts`, `tests/native-site-runtime.test.ts`
- `src/editor-workspace.ts`, `src/file-changes.ts`, `src/media-batch.ts` (ports only)
- The preload test named above (`tests/native-save/` spec of p5-15)
- `tests/main-ts-ceiling.test.ts`, `docs/agents/code-map.md`

May split into 31a (state and `reset()`) and 31b (styles, assets, shown files, text index) if one session cannot finish it; say so in `decide` before starting 31b.

## Done when

- `deactivateNative()` is one `runtime.reset()`; no `native*` module variable left in `main.ts` except the preview adapter's.
- A moved function keeps its body (CODING_STANDARDS); runtime unit tests cover source layering, reset and `adoptSaved`.
- `kit size` at or under 355 KB; `npm run check`, `npm test`, `kit specs --affected` green; land with `kit pr --full`.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). May run beside one of 25, 26, 80, 81 or 82 (other `main.ts` regions).

- `kit doctor`; `kit bg slice-31 -- scripts/agents/kit slice --ticket docs/wayfinder/clean-up-before-features/build/tickets/31-native-site-runtime.md --builder claude-opus-5-5`; `kit wait job slice-31 --timeout 2h`.
- `kit unit --affected`, `kit specs --affected`, `kit size`.
- Review: `kit review --ticket <this ticket>` (GPT-6.1 Sol, medium, read-only). Land: `kit pr --ticket <this ticket> --full`.
- Report: the runtime's interface (one line per member), unit and specs `RESULT:` lines, `kit size` KB, review folder and decisions, PR and merge SHA, `main.ts` lines before and after and the new ceiling.

## Decide (for the lead)

- **Split.** This round is 31a; the ticket stays open for 31b: the style, asset, shown-file and text-index loaders (`readNativeShownFiles`, `readNativeStyleFiles`, `loadNativeComponentStyles`, `loadNativeAssets`, `forgetDraftedAssets`, `activateNativeSite`'s reads, `startNativeTextIndex`, `indexNativeTextFiles`, `ensureNativeTextIndex`, the paint gate, `nativeTextIndexGate`) move into the runtime and `state` goes private. 31a cut `main.ts` by 189 lines of the Goal's about 900; 31b carries the rest.
- **Interface past ten.** The runtime has 16 members (below), `state` among them with 24 mutable fields. Moving the loaders in removes `state`, `readPredicted` and `clearReads` but needs about six more (`activate`, the text index as one gate, the loaders the preview adapter calls, the preview's inputs, the paint note, the load counter for the boot memory). Grouping the text index and the loads would keep it near twelve. `site`, `engaged` and `base.files` are still set from `main.ts` (`activateNativeSite`, `refreshNativeRoutes`); they go read-only once activation moves in. Condition for closing 31b: `state` is private, `site`, `engaged` and `base.files` lose their setters (activation and route refresh move in), and the interface is counted again here.
- **The stale predicted read.** Its failing case is the unit test (`tests/native-site-runtime.test.ts`, "a predicted read let go at any of its awaits…"), not the browser spec. An instrumented run of `native-boot-requests.spec.ts` with the `live` checks removed (2026-10-23) showed why: the held predicted read of `main`'s `styles/site.css` does land in `feature`'s first load and writes the stale text, but that load is then superseded by a second `feature` load, which clears the base layer and reads the sheet again from the blob cache (no request, so `page.route` cannot hold it). What shows is always the second load's. A browser spec that fails without the fix needs a way to hold that cached read, or a flow with one load per switch. Accept the unit cases as this matrix row (then note it in TD 10), or ask for that spec.
- **Done when is not met yet.** `main.ts` still declares `native*` variables besides the preview adapter's (`nativePreview`, `nativePreviewBehind`). Proposed exceptions, for the lead to accept or reject: history (`nativeHistoryAliases`, `nativeMountListener`, `nativeHistoryShares`), inserts (`nativeAddPoints`), variants (`nativeVariantFiles`), Page Structure (`nativeLinkParents`, `nativeStructurePaintedSources`, `nativeStructurePaints`), component fields (`nativeComponentFieldToken`, `nativeComponentFieldSnapshot`), the Pages tab's title gate (`pendingNativePageTitles`, `nativePageTitlePointer`; DOM pointer state, cleared by `reset()` through `closed`) and the home-page resync (`nativeResyncing`, `nativeResyncDone`; snapshot reloading). `nativeTextIndexGate` holds no state and moves in with the text index in 31b.

## Done (2026-10-23)

31a (the state and `reset()`, with the source layering and `adoptSaved`); 31b is under Decide.

- `src/native-site-runtime.ts` (no DOM): `createNativeSiteRuntime(ports)` owns the open site's state: the site and whether the project is native, GitHub's layer (`base`: the branch texts and every file on the branch) and the read caches the loaders in `main.ts` still fill (`state`: component styles, style files, unreadable files, shown-file requests, assets, text index and first-paint flags, opaque media text). Ports: the session's scope (`scope`, `shown`), the draft store, GitHub's clean texts and reads (`clean`, `find`, `readTexts`), the mounted editor, the text index key, the preview's route, the open file and its page styles, and `changed` / `closed` back to the preview adapter.
- Interface (16): `site`, `engaged`, `base`, `state`, `source` (editor, then draft, then GitHub), `textSource` (the media variant), `files`, `newDraftPaths`, `sources`, `prefix`, `shownPaths`, `readPredicted`, `adoptSaved`, `begin` (a new load: the load counter moves on and nothing counts as indexed), `clearReads` (what a load read for its preview; `reset` and `activateNativeSite` both use it), `reset`. `state` is the transitional seam for the loaders 31b moves in; its `request` is read-only outside, moved only by `begin` and `reset`.
- Moved with their bodies, with `ports.` / `state.` prefixes: `nativeEffectiveSource`, `mediaTextSource`, `nativeFiles`, `nativeSources` / `nativeSiteSources`, `nativePrefix`, `nativeShownPaths`, `readNativePredicted`, `adoptNativeBaseSources`, `deactivateNative`, `scopeNewDraftPaths`. Named changes: `nativeSources` takes the plan's reader as an optional second argument (`nativeSiteSources`' one caller); `nativeShownPaths` reads the open file once into a local; `newDraftPaths` takes the rule's options and an explicit scope, none giving none (`nativeImagePaths` asks it for new images); `adoptSaved` asks for the preview update when a site is loaded (was `nativeModeActive()`); `reset` clears the state first and then the views (`closed`: page titles, gallery, picker, tabs, body styles, preview), where it interleaved them; `activateNativeSite` clears the same reads through `clearReads`, so `shownRequests` and the asset caches are now cleared before `noteNativeUnreadable(undefined)` instead of after (it reads none of them).
- `main.ts`: `deactivateNative()` is one `runtime.reset()`; the site's own state lives in the runtime, but Done when's `native*` item is not met yet (see Decide). The `native*` variables still in `main.ts` belong to the preview adapter (`nativePreview`, `nativePreviewBehind`) or to other features (history aliases and shares, add points, variant files, Page Structure paints, component fields, the Pages tab's title gate, the home-page resync), and `nativeTextIndexGate` reads the runtime's text-index state until 31b moves it in. 4,059 → 3,870 lines; ceiling 3890.
- Runtime methods reach controllers and other ports wrapped in arrows that pass only the arguments each port takes.
- Tests: `tests/native-site-runtime.test.ts` (19): source layering, the media text (an opaque draft's cached text only for its own blob; a text draft, deleted or edited, hides the wider index), files and new drafts, `reset`, `adoptSaved` (saved, removed and kept files; another branch or a non-native project leaves it; a native project whose site is not loaded takes the save without a preview update; an edited opaque file keeps its old text and is listed once), `reset` letting the state go before `closed` runs, every state field classified as emptied or kept by `reset`, `begin` and `clearReads`, `shownPaths` (the preview route's page, its components, the open file and the page styles; none without a site), `sources` through a plan's reader, and the stale predicted read: let go at each of its awaits (`forEachAwait`) it asks GitHub for nothing more, writes nothing and leaves no path marked; a failed read is left unread quietly; files GitHub cannot give as text go to the `unreadable` port and are not written; an earlier load's read never unmarks the next one's path. Each fails without its guard in `readNativePredicted` (checked by removing the guard). `native-boot-requests.spec.ts` names that unit case. `tests/main-media-preview.test.ts` binds the popup callback's `runtime`.
- Evidence: `RESULT: ok unit 27/27 (3 files)` (`kit unit --affected`); `npm test` 5278 passed, 0 failed; `npm run check` and `npm run lint` clean; `RESULT: ok specs 4/4 passed` (`kit specs --affected`); `RESULT: ok size boot 349 KB (+1 KB)`, budget 355 KB.

- 2026-10-23, lead: the remaining `native*` screen-bookkeeping variables in `src/main.ts` move to [slice 85](85-main-ts-wiring-only.md); this slice lands with the site runtime moved.
