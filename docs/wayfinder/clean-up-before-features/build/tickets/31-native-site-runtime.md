---
title: "The native site runtime owns the open site's state"
type: task (AFK)
status: closed
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

## Done (2026-10-23)

Split as allowed: this is 31a (the state and `reset()`, with the source layering and `adoptSaved`); 31b (the style, asset, shown-file and text-index loaders moving in) is left.

- `src/native-site-runtime.ts` (no DOM): `createNativeSiteRuntime(ports)` owns the open site's state: the site and whether the project is native, GitHub's layer (`base`: the branch texts and every file on the branch) and the read caches the loaders in `main.ts` still fill (`state`: component styles, style files, unreadable files, shown-file requests, assets, text index and first-paint flags, opaque media text). Ports: the session's scope (`scope`, `shown`), the draft store, GitHub's clean texts and reads (`clean`, `find`, `readTexts`), the mounted editor, the text index key, the preview's route, the open file and its page styles, and `changed` / `closed` back to the preview adapter.
- Interface (14): `site`, `engaged`, `base`, `state`, `source` (editor, then draft, then GitHub), `textSource` (the media variant), `files`, `newDraftPaths`, `sources`, `prefix`, `shownPaths`, `readPredicted`, `adoptSaved`, `reset`. `state` is the transitional seam for the loaders 31b moves in.
- Moved with their bodies, with `ports.` / `state.` prefixes: `nativeEffectiveSource`, `mediaTextSource`, `nativeFiles`, `nativeSources` / `nativeSiteSources`, `nativePrefix`, `nativeShownPaths`, `readNativePredicted`, `adoptNativeBaseSources`, `deactivateNative`, `scopeNewDraftPaths`. Named changes: `nativeSources` takes the plan's reader as an optional second argument (`nativeSiteSources`' one caller); `nativeShownPaths` takes the route (the preview's by default); `newDraftPaths` takes the rule's options; `adoptSaved` asks for the preview update when a site is loaded (was `nativeModeActive()`); `reset` clears the state first and then the views (`closed`: page titles, gallery, picker, tabs, body styles, preview), where it interleaved them.
- `main.ts`: `deactivateNative()` is one `runtime.reset()`; no site-state module variable is left. The `native*` variables still in `main.ts` belong to the preview adapter (`nativePreview`, `nativePreviewBehind`) or to other features (history aliases and shares, add points, variant files, Page Structure paints, component fields, the Pages tab's title gate, the home-page resync). 4,059 → 3,881 lines; ceiling 3890.
- Tests: `tests/native-site-runtime.test.ts` (8): source layering, the media text, files and new drafts, `reset`, `adoptSaved` (saved, removed and kept files; another branch or no site leaves it), and the stale predicted read: a read whose texts land after the next load began writes nothing, and the case fails without `readNativePredicted`'s `live` check (checked by removing it). `native-boot-requests.spec.ts` names that unit case. `tests/main-media-preview.test.ts` binds the popup callback's `runtime`.
- Evidence: `RESULT: ok unit 15/15 (2 files)` (`kit unit --affected`); `npm test` 5271 passed, 1 failed (`main-media-preview`, fixed above; 1/1 after); `npm run check` and `npm run lint` clean; `RESULT: ok specs 4/4 passed` (`kit specs --affected`); `RESULT: ok size boot 349 KB (+1 KB)`, budget 355 KB.

