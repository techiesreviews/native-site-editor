---
title: "Move applyNativeOperation and applyNativeChange behind the guarded edit seam"
type: task (AFK)
status: closed
assignee:
blocked_by: [11-guarded-edit-block-insert, 12-guarded-edit-cards, 13-guarded-edit-components, 14-guarded-edit-page-structure, 15-guarded-edit-pages-and-files, 16-guarded-edit-media-agents-save]
builder: claude ★
phase: 1
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/guarded-edit-design.md, sections 5-7.

- The body of `applyNativeOperation` (`main.ts:3798-4075`: `.github` protection, existence checks, branch bases, the text-only and structural branches, receipt, history record, aliases, late pane adoption, refresh/open, selection on undo/redo) moves into the module's commit (`src/guarded-edit/commit.ts`); `applyNativeChange` (`page-structure-controller.ts:644`, wrapper `main.ts:1652`) becomes the module's range path.
- `NativeOperation`, the `operation`/`change` ports of cards, components, pages, file ops and agent site, and any remaining `revision` strings are deleted; MCP/agent operations (`agent-site.ts`, `main.ts:4965`) are plans.
- Expected sources are no longer auto-filled at apply time (3865-3867): an unread write throws.
- The `EditorWorkspace` port narrows to primitives (section 6); the memory adapter follows. The module suite does not change.

- Restore the interim gaps earlier slices accepted: Undo/Redo of a range-path edit (block insert/move from slice 11, open-page settings from slice 15) reselects the "before" element and announces "Undid …" again.
- Plain repositories (no `index.html`): Files-tab rename, move and delete work again with no file open, as before slice 15 (which made them refuse with "Open a page before changing these files."). The stamp works without an open anchor; keep the undo step and the refusal when the file changed.
- Undo of Make component / New component (receipt path since slice 13b) closes the new component's stylesheet pane, as the old companion did; cover it in a browser spec.
- `native-boot-requests.spec.ts` (slices 13b, 23) and `native-branch-menu.spec.ts` (slice 23) failed in full runs and passed on rerun: find the flakes while the full suite runs here.

## Done when

- `grep -n "applyNativeOperation\\|NativeOperation\\|applyNativeChange" src` finds nothing; `main.ts` shrinks by roughly 300 lines.
- `tests/guarded-edit.test.ts` unchanged and green; `tests/native-operation-history.test.ts` green.
- A browser spec checks both: Undo after a block insert reselects and announces; a plain-repo rename with no open file succeeds and undoes.
- `npm run check`, `npm test`, full `native-save` suite green; nightly groups run once.

## Done (2026-10-11)

- `applyNativeOperation` moved into the module's commit (`src/guarded-edit/commit.ts`); the `EditorWorkspace` port is the editor's primitives (drafts, branch reads, models, receipt sources, history, mounts, refresh), with `src/editor-workspace.ts` and `tests/fakes/memory-workspace.ts` as its adapters; `tests/guarded-edit.test.ts` unchanged (65 green). No expected source is filled in at commit: an unread write throws. `applyNativeChange` is the edit bar's `editOpenPage` (`edits.now`); Add section, the agent's add/remove section, write_file and draft writes, and site settings are plans (`addSectionStep` in component-plans.ts); `NativeOperation` and the agent site's `change`/`replaceMounted`/`template` ports are gone. main.ts −294 lines.
- Restored: range edits' Undo/Redo select `before`/`after` and say `undone`/`done` (per-step draft-store companions, one per typing group); open-page settings reselect; with no file open, a structural step runs without an anchor and the page it opens takes the step (plain-repo Files-tab rename/move/delete work again; rename's Undo and Redo, refusal after an edit, refusal when a file opens meanwhile); Undo of Make component closes its stylesheet pane (already so; now in a spec).
- Flakes: `native-boot-requests` had two (an `unroute` racing a delayed `continue`; the text index reading the injected unreadable sheet after the paint, which shows the preview alert); fixed in the spec. `native-branch-menu` did not fail in three full runs and 5 repeats. `native-canvas.spec.ts:382` (120 ms budget) failed once under load.
- Tests: `tests/native-save/native-guarded-history.spec.ts` (3), file-operations (+2 plain-repo cases), editor-workspace and draft-store (per-step companion) updates.
