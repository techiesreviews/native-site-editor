# Phase 5.15: Preview frame attached early, parked

Base: `8003608` (dev), rebased onto `da31ccc`.

## What changed

- `src/components/preview-frame-state.ts` (new, pure): the frame's lifecycle behind ports. `attached` (pane in its host, once), `active` (the old `mounted`: shown, owns the page) and `ready` (the current frame document reported `ready`). `preload()` attaches parked and arms the ready watchdog; `activate()` attaches if needed, unparks and, when already ready, resyncs avoid/theme/focus; `markReady()` disarms the watchdog and reports whether the pane is active; `deactivate()` (only when active) parks, reloads the frame and re-arms the watchdog; `destroy()` disarms.
- `src/components/native-preview.ts` uses it. The pane is prepended to the host once and never moves. Parked means `.is-parked`, `inert` and `aria-hidden="true"`. A `ready` while parked only clears per-document state; the rest (theme, avoid, focus, pins, schedule) runs on `activate`. `deactivate()` no longer removes the pane: it parks it and navigates the frame to a fresh runtime document (`srcdoc` = runtime doc + `<!--n-->`), clearing `sentAssets`, `postedRoutes`, `lastAvoid` and any pending frame. Every gate that used `mounted`/`ready` reads `frameState.active`/`frameState.ready`, unchanged in meaning. New `preload()` method.
- `src/components/native-preview.css`: `.native-preview-pane.is-parked { position: fixed; inset: 0; visibility: hidden; pointer-events: none; z-index: -1 }` (never `display: none`, so the frame loads).
- `src/main.ts`: `nativePreview?.preload()` right after `nativeEngaged = true`, so repos that are not native never load the runtime. `mountWorkspace` destroys any previous preview before creating one. The master banner's preview lookup is `:scope.has-preview > .preview-pane`, so it never lands in a parked pane.
- `src/chunk-recovery.ts`: `hasEditableRecoveryState` skips iframes inside `[inert]`; a parked frame holds no edits, so a parked frame's watchdog failure may reload the page automatically. A shown frame still blocks it, as before.
- `src/page-builder/palette.ts` is unchanged: it matches `.native-preview-frame` by `contentWindow`, and a parked frame is inert, so it sends no keys.
- `tests/perf/cold-start.ts`: the waterfall also lists the preview runtime request.

## Tests

- `tests/preview-frame-state.test.ts`: preload/activate/ready/deactivate in any order, reload resets ready and re-arms, deactivate while parked does not reload, post only when active and ready.
- `tests/chunk-recovery.test.ts`: an inert (parked) frame does not block reload.
- `tests/native-save/native-preview-preload.spec.ts`: the runtime is requested while page reads are held and the pane is parked (hidden, inert, `aria-hidden`, no `has-preview`), then shown; a branch switch shows none of the old page while the new one is read; a repo that is not native never requests the runtime; one opened after a native repo leaves the frame parked and empty.

## Measurements

`tests/perf/cold-start.ts`, dist served by `tests/native-save/server.ts`, `ASE_COLD_NET=100/20`, median of 5, all in one sitting on one machine. "Before" is this slice's parked frame (`4068e53`, rebased on dev); A and B are the earlier signals tried on top of it.

| | cold paint | cold usable | warm paint | warm usable |
| --- | --- | --- | --- | --- |
| before (parked frame only) | 1030 | 1038 | 632 | 632 |
| A only | 1029 | 1043 | 643 | 646 |
| B only | 1037 | 1058 | 630 | 638 |
| A + B | 1017 | 1037 | 636 | 638 |

- A: once boot sees a workspace link (`#repo=` or a link kept across sign-in), the main document fetches the runtime URL. The sandboxed srcdoc frame does reuse that HTTP cache entry: in the cold waterfall the frame's request took 4 ms (688–692) after the main fetch (393–522), against 726–846 without it. `<link rel=preload>` also worked but warns "preloaded but not used" in the console.
- B: a per-account list of repositories that opened as native (localStorage) calls `preload()` when the workspace opens the repository, before the snapshot. The warm frame then requested the runtime at 271 ms instead of after the snapshot.
- Neither moved paint. The runtime is off the critical path: paint waits for the page's reads, which are serial. Cold: snapshot (566–676), then the page and its first files (681–794), then a second `/api/files` for what those reveal (798–907), then the render (~95 ms). The runtime already finished by 846 in the baseline. Both signals were dropped; the code is not in this commit.
- Note: an earlier pair of measurements (cold 1020/1030) left a server from one checkout on port 5293, so one of those runs may have measured the wrong build. The table above was re-measured with each run checked to serve its own `index-*.js`.

The targets (cold 1.0 s, warm 0.4 s) are not met. The next lever is that second serial `/api/files` round trip (about 110 ms cold and warm): read the open page's stylesheets and components with the page itself, or from the snapshot.

## Flaky test

`native-canvas.spec.ts:195` (hover a code line, the canvas hint shows) failed once in the first full run. With `--repeat-each`: this branch 1/10, 0/30, plus 0/52 for the whole file; dev (`origin/dev`) 0/10, 3/30. It fails on dev as well and was there before this slice. The failure screenshot shows the code pane's lines rendered with no text, so the hover likely lands before Monaco has painted the line.
