---
title: Remove the legacy media-workspace members
type: task (AFK)
status: in-progress
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
