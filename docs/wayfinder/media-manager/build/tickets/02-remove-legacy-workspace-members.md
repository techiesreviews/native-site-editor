---
title: Remove the legacy media-workspace members
type: task (AFK)
status: closed
assignee: claude (mm-02 runner)
blocked_by: [01-bring-dev-level]
builder: sol
phase: 0
---

## What

Pure deletion of the dead code research 04 found ([04](../../tickets/04-research-media-code-today.md#resolution-2026-10-11) §8; `git show 2d97d703:docs/wayfinder/media-manager/research/04-media-code-today.md`, "Dead"). Find code by symbol; line numbers are from 2026-10-11.

- `MediaWorkspaceContext.write`, `changed`, `rename`, `remove` (`src/page-builder/media-workspace.ts:63-68`) and the throwing host stubs ("Use the atomic image transaction.", `src/controllers/media-controller.ts:111-114`).
- Optional `applyBatch?` and `assetVersion?` become required (`media-workspace.ts:59-62`); remove the "unavailable, refresh" checks at `:93`, `:108` and `media-library-view.ts:433`.
- The uncalled `rewrite(from, to)` (`media-workspace.ts:221-226`) and `MediaPickerHost.rewrite` (`media-picker.ts:21`).
- The test-only `upload(file, result, folder)` (`media-workspace.ts:186`) and `MediaPickerHost.upload` (`media-picker.ts:17`), with the tests that call it (`tests/media-workspace.test.ts:117`, `:124`).
- The view's duplicate Keep original branch (`media-library-view.ts:447-449`) once the worker's own branch covers it (`image-optimise.worker.ts:8-10`).

## Done when

- `grep -n "Use the atomic image transaction\|rewrite(\|applyBatch?\|assetVersion?" src` finds none of these members.
- `tests/media-workspace.test.ts` and `tests/media-controller.test.ts` pass without the removed cases; no new behaviour.
- The media e2e specs (`native-images-tab`, `native-media-pane`, `native-media-library`, `native-media-transaction`, `native-upload`, `native-asset-references`, `native-image-alt-refusal`) and the full suite pass; byte-budget delta reported (should shrink).

## Done (2026-10-14)

- Behaviour: none changed. Removed `MediaWorkspaceContext.write`/`changed`/`rename`/`remove` and the controller's throwing stubs; the uncalled `rewrite` and test-only `upload` on the workspace and `MediaPickerHost`. `applyBatch`, `assetVersion` and the picker's `import` are required, so their "unavailable, refresh" guards and non-null assertions are gone. Keep original: the worker's `keepOriginal` branch now returns exactly what the view's branch built (same bytes, `bin` extension fallback, note "Original bytes and metadata are kept. Unsupported formats may not display on the web."), checked before the SVG/GIF case; the view's duplicate is deleted. Keep original now loads the worker; options are validated first, and the view's inputs already enforce the same ranges.
- Commits: 3f36c2a9 (claim), e065cdc5 (deletion, built by Sol), b14e86e8 (review follow-up test).
- Tests: `media-workspace`/`media-controller` unit tests trimmed (the "missing atomic host" case removed; the `upload` cases now call `import`); `frame-guard` worker post count 3 → 4. `native-media-library` real-worker test now pins Keep original's output and its precedence over SVG. `npm run check`, lint, unit 2292/2292; the seven media specs 49/49 (one trace ENOENT from an overlapping run in the same worktree passed on rerun); full suite 888 passed, 0 failed, 60 skipped.
- Review (GPT-6.1 Sol, read-only): no defects; one validation gap (Keep original result and precedence not pinned) fixed in b14e86e8. Nothing rejected.
- Byte budget: 341 → 340 KB gzip before first preview paint (budget 355 KB); total 1400 → 1399 KB. Build: entry JS gzip −61 B, all JS gzip −253 B.
