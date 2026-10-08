# Phase 5.15: Preview frame attached early, parked

Base: `8003608` (dev).

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

`tests/perf/cold-start.ts`, dist served by `tests/native-save/server.ts`, `ASE_COLD_NET=100/20`, median of 5, same machine and session:

| | cold paint | cold usable | warm paint | warm usable |
| --- | --- | --- | --- | --- |
| before (8003608) | 1020 | 1040 | 630 | 633 |
| after | 1030 | 1047 | 634 | 638 |

No gain; the difference is noise. The waterfall shows why: the runtime request starts at about the same moment in both (cold run 1: 725 ms before, 704 ms after), right after `/api/snapshot`. `nativeEngaged` needs the snapshot's tree (it checks for `index.html`), and in the baseline the placeholder `activate()` already ran at that point, in parallel with the page reads. Preloading only moves the start earlier than that if the signal comes before the snapshot (for example, a cached "this repo is native" hint), which is out of scope here. Targets (cold 1.0 s, warm 0.4 s) are not met.
