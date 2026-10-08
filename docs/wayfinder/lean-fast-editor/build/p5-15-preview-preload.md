# Phase 5.15: Preview frame attached early, parked; stylesheets read with the page

Base: `8003608` (dev), rebased onto `da31ccc`.

## What changed

- `src/components/preview-frame-state.ts` (new, pure): the frame's lifecycle behind ports. `attached` (pane in its host, once), `active` (the old `mounted`: shown, owns the page) and `ready` (the current frame document reported `ready`). `preload()` attaches parked and arms the ready watchdog; `activate()` attaches if needed, unparks and, when already ready, resyncs avoid/theme/focus; `markReady()` disarms the watchdog and reports whether the pane is active; `deactivate()` (only when active) parks, reloads the frame and re-arms the watchdog; `destroy()` disarms.
- `src/components/native-preview.ts` uses it. The pane is prepended to the host once and never moves. Parked means `.is-parked`, `inert` and `aria-hidden="true"`. A `ready` while parked only clears per-document state; the rest (theme, avoid, focus, pins, schedule) runs on `activate`. `deactivate()` no longer removes the pane: it parks it and navigates the frame to a fresh runtime document (`srcdoc` = runtime doc + `<!--n-->`), clearing `sentAssets`, `postedRoutes`, `lastAvoid` and any pending frame. Every gate that used `mounted`/`ready` reads `frameState.active`/`frameState.ready`, unchanged in meaning. New `preload()` method.
- `src/components/native-preview.css`: `.native-preview-pane.is-parked { position: fixed; inset: 0; visibility: hidden; pointer-events: none; z-index: -1 }` (never `display: none`, so the frame loads).
- `src/main.ts`: `nativePreview?.preload()` right after `nativeEngaged = true`, so repos that are not native never load the runtime. `mountWorkspace` destroys any previous preview before creating one. The master banner's preview lookup is `:scope.has-preview > .preview-pane`, so it never lands in a parked pane.
- `src/chunk-recovery.ts`: `hasEditableRecoveryState` skips iframes inside `[inert]`; a parked frame holds no edits, so a parked frame's watchdog failure may reload the page automatically. A shown frame still blocks it, as before.
- `src/page-builder/palette.ts` is unchanged: it matches `.native-preview-frame` by `contentWindow`, and a parked frame is inert, so it sends no keys.
- `tests/perf/cold-start.ts`: the waterfall also lists the preview runtime request.

### Stylesheets predicted into the first read

- Before, the first paint waited on serial reads: the page (with `.editor/config.json` and the component extras), then the stylesheet it links (`nativePageStylesheets`), then, on the real starter, the five files `site.css` imports (`expandStyleImports`). Each round trip cost about 110 ms.
- `src/native-boot.ts` `nativeBootStyleExtras(site, files, sizeOf, limit = 24 KB)`: every `.css` in the branch that is not a component's stylesheet and not under a dot-folder or `node_modules`, when every size is known and the total fits the cap (else none). `src/main.ts` appends them to the page's first read, beside `nativeBootExtras`; it uses the same size port (a draft counts as 0 and is never fetched; drafts still win through `nativeEffectiveSource`).
- A predicted sheet the page does not link is only read: the preview gets only the sheets the pages link. A linked sheet outside the prediction (over the cap, in a dot-folder, or new) is read afterwards, as before.
- Byte budget: 347 KB of 350 (was 346).

### Review fixes

- Agent pins: a frame reloaded in place (refresh, branch switch) usually turns ready while parked, and the pins' locators were then never sent to it (`agent-pins` skips an unchanged set). The `resync` port now calls `pins.reset()` when the pane is shown again.
- Predicted stylesheets are read in their own request in the same wave (`readNativePredicted` in `src/main.ts`), best effort: one that cannot be read (GitHub refuses non-UTF-8 text, which fails a whole batch) fails only that request, and a sheet a page links is then read in the next round as before. The page's own batch never carries a guess.
- Each frame load is numbered (`<meta name="ase-frame-load">` in the srcdoc; the runtime echoes it in `ready`), so a late `ready` from the replaced document cannot disarm the new load's watchdog. Other harnesses that load the runtime send no number and are unaffected.
- `canPost` removed (unused); the stylesheet prediction matches `.css` case-insensitively.

## Tests

- `tests/preview-frame-state.test.ts`: preload/activate/ready/deactivate in any order, reload resets ready and re-arms, deactivate while parked does not reload, post only when active and ready.
- `tests/chunk-recovery.test.ts`: an inert (parked) frame does not block reload.
- `tests/native-save/native-preview-preload.spec.ts`: the runtime is requested while page reads are held and the pane is parked (hidden, inert, `aria-hidden`, no `has-preview`), then shown; a branch switch shows none of the old page while the new one is read; a repo that is not native never requests the runtime; one opened after a native repo leaves the frame parked and empty.

- `tests/native-boot.test.ts`: style prediction (component CSS, dot-folders and `node_modules` excluded; over the cap or an unknown size gives none).
- `tests/native-save/native-boot-requests.spec.ts`: the read watcher reports response end. With each read delayed 150 ms, `styles/site.css` is read in a request that starts before any pre-paint read ends (this fails without the prediction). A drafted `styles/site.css` paints with the draft, and a drafted page that links a sheet the prediction skips (`.theme/late.css`, a draft) paints with it too.

- `tests/native-save/native-settings-final-proof.spec.ts` holds a stylesheet that "only the background text index reads". The prediction now read it in the boot wave, which blocked the first paint (6 failures). Its proof stylesheets are padded past the 24 KB cap so they stay index-only.

- `tests/native-save/native-mcp.spec.ts` (Ask agent pins): after the pins are shown, a commit on GitHub and Refresh, with the page's reads held until the reloaded frame is ready (so it turns ready parked); the new frame then reports pin places. Fails without the `pins.reset()` in `resync`.
- `native-boot-requests.spec.ts`: a predicted `styles/unused.css` whose reads fail (500) still lets the page paint, styled by `styles/site.css`, with no load error. Fails when the predicted sheets share the page's batch.

## Measurements

`tests/perf/cold-start.ts`, dist served by `tests/native-save/server.ts`, `ASE_COLD_NET=100/20`, median of 5, one sitting; each run checked that the server served its own `index-*.js`. Before = `2accccf` (parked frame only); after = style prediction.

| fixture | | cold paint | cold usable | warm paint | warm usable |
| --- | --- | --- | --- | --- | --- |
| default (`fixtures/native-starter`) | before | 1004 | 1011 | 635 | 635 |
| | after | 933 | 933 | 520 | 524 |
| real starter (`ASE_NATIVE_SAVE_FIXTURE=~/Projects/native-site-editor-starter`) | before | 1131 | 1167 | 760 | 787 |
| | after | 918 | 955 | 535 | 562 |

After the review fixes (default fixture, `53c73a2` → `d0fdafa`, same sitting): cold paint 934 → 936, warm paint 520 → 534 (one more request before paint, the separate prediction read). The gain over `2accccf` holds.

Cold waterfall on the real starter, before: page 685–797 and extras 690–802, then the linked sheet 807–915, then its imports 919–1029; paint 1131. After: one wave, page 685–792 and two `/api/files` batches 689–807 and 689–803; paint 922. The default fixture loses one round trip and the starter loses two. The targets (cold 1.0 s, warm 0.4 s): cold is met on both fixtures; warm is not (520–535 ms).

Now the runtime (694–821 cold) ends after the reads, so it sits on the critical path by about 15 ms. Signal A below (fetching it at boot) could take that back.

### Earlier signals for the runtime (tried, dropped)

Measured on top of the parked frame, before the style prediction:

| | cold paint | cold usable | warm paint | warm usable |
| --- | --- | --- | --- | --- |
| parked frame only | 1030 | 1038 | 632 | 632 |
| A only | 1029 | 1043 | 643 | 646 |
| B only | 1037 | 1058 | 630 | 638 |
| A + B | 1017 | 1037 | 636 | 638 |

- A: the main document fetches the runtime once a workspace link is seen. The sandboxed srcdoc frame reuses that cache entry (its request took 4 ms after the main fetch). `<link rel=preload>` also works but warns "preloaded but not used".
- B: a per-account localStorage list of repositories that opened as native calls `preload()` before the snapshot.
- Neither moved paint then, because serial stylesheet reads, not the runtime, held it back. The parked frame alone was also neutral (1020 → 1030 cold, within noise).

## Flaky tests (on dev too)

`native-shared-authoring-host.spec.ts:282` (same-bytes stylesheet replacement refuses Save shared) failed once in a native-static run. `--repeat-each=10`: branch 10/10 passed, `origin/dev` 9/10. It waits a fixed 1.5 s before asserting.

`native-canvas.spec.ts:195` (hover a code line, the canvas hint shows) failed once in the first full run. With `--repeat-each`: this branch 1/10, 0/30, plus 0/52 for the whole file; dev (`origin/dev`) 0/10, 3/30. It fails on dev as well and was there before this slice. The failure screenshot shows the code pane's lines rendered with no text, so the hover likely lands before Monaco has painted the line.

## Gates (`d0fdafa`)

check clean; `npm test` 1,100 passed; `build:ui` ok; byte budget 347 KB of 350. On port 5216: the focused set with boot-requests, conventions, draft-storage, MCP and final-proof 88 passed, 7 skipped; smoke 32 passed; native-static 40 passed, 13 skipped; full native-save 728 passed, 85 skipped, 0 failed.
