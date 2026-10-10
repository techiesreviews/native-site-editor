---
title: "Move applyNativeOperation and applyNativeChange behind the guarded edit seam"
type: task (AFK)
status: open
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

## Done when

- `grep -n "applyNativeOperation\\|NativeOperation\\|applyNativeChange" src` finds nothing; `main.ts` shrinks by roughly 300 lines.
- `tests/guarded-edit.test.ts` unchanged and green; `tests/native-operation-history.test.ts` green.
- `npm run check`, `npm test`, full `native-save` suite green; nightly groups run once.
