---
title: "Page Structure (section moves, attribute fields, text edits) through the guarded edit"
type: task (AFK)
status: closed
assignee:
blocked_by: [10-guarded-edit-module]
builder: sol
phase: 1
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/guarded-edit-design.md. In `src/controllers/page-structure-controller.ts`:

- `SectionMoveProof`/`sectionMoveProof` (677-685) go: `moveNativeSection` (687), `moveNativeSectionAfterOpening` (707) and `moveNativeSectionTo` (728) are plans with `since: stamp`, `anchor: path` and `guard` for "the selection is still the one asked for". The open-then-move path uses the module's anchor open instead of its own `restoreFile` + `beforeMount` proof.
- **Gap:** `isNativeSectionTag` (666) reads a component template through `nativeSources()` untracked; inside a plan it takes `r` and the template is proved.
- Media and form attribute fields (402-430: their own epoch, scope and `captureFileModelState` proof, grouped writes while typing) and text edits (`replaceActiveRanges` at 849) go through `edits.now` with `group` (consecutive keystrokes stay one undo step). The text-edit queue (`nativeTextEditQueue`) stays; each queued edit is one plan.
- `main.ts` `moveNativeCanvasBlock` (1642) and the template-part moves (1630, 1639) use `edits.now`.

## Done when

- `tests/page-structure-controller.test.ts` on the memory workspace; adds: a section template made non-section during an Alt+Up wait refuses.
- No `SectionMoveProof` or `generation` compare left in the controller.
- `npm run check`, `npm test`, full `native-save` suite green.

## Done (2026-10-10)

- Section moves (bar, Structure rows, open-then-move, MCP `move_section`), media/form attribute fields (typing grouped per field), preview text edits (queue kept, one plan each; a left page's text through `edits.run`) and main.ts canvas/Structure/template-part block moves are guarded edits; `SectionMoveProof`, `sectionMoveProof` and every generation/scope compare left the controller (the edit bar's `revision` token stays). `isNativeSectionTag` reads the template through `r` in plans.
- Module addition: `RunOptions.openOnlyIfCurrent` (the anchor mounts only while stamp and guard hold), so a page whose painted bytes changed during the open stays unmounted as before. Retained offers (bar move, field session) keep the editor model in their guard; open-then-move ignores route and Edit component mode (`loadStamp`), as the old proof did.
- Tests: `tests/page-structure-controller.test.ts` on the memory workspace (19, incl. a template made non-section during the Alt+Up wait, a foreign draft during the open, leaving Edit component mode during the open, a remount refusing a bar offer, text edits); `tests/guarded-edit.test.ts` +1 (`openOnlyIfCurrent`).
