---
title: "Alt+arrows, the edit bar's Section buttons and Page Structure rows through the Block move module"
type: task (AFK)
status: open
assignee:
blocked_by: [30-block-move-module]
builder: claude ★
phase: 3
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/block-move-design.md (sections 2.1 rows 2a-3, 6, 8).

- `main.ts`: `moveNativeOpenFile`, `moveNativeBlock`, `moveNativeTemplatePart`, `moveNativeCanvasBlock`, `NATIVE_MOVE_STALE` (1664-1706) and the pass-throughs `moveNativeSection*` (1714-1719) go; the canvas's Alt+←/→ (536-540) calls `moves.move(selection, { step })`. Page Structure's `onMove` (591-607) is one call for page and template rows; `nativeStructureMoveActions` and its hand proof (520-529, 1612) become a stamp taken at the Structure paint with the model in `guard`.
- `page-structure-controller.ts`: `sectionMovePlan`, `moveNativeSection`, `moveNativeSectionAfterOpening`, `SectionMoveOffer`, the ports `moveBlock` and `itemsSlots` (704-762, 74, 78) go; the bar builds one `onMove` for any Block (`moves.move(selection, { step }, { since, guard, stale })`); Section Move up/down `disabled` from `grip.steps`; `draggable` from `grip`. `moveNativeSectionTo` stays for slice 33.
- `page-structure.ts`: `onMove` returns the moved path or a promise of it; focus follows the settled path while the row moved is still focused (replaces the `node ± 1` guess at 895-898).
- Stale wording stays per way in through `options.stale` (`main.ts:594, 600`, `SECTION_MOVE_STALE`, `SECTION_OPEN_STALE`, `NATIVE_MOVE_STALE`).
- Behaviour, if the lead agrees (design section 8): B1 template Sections move by the template rules from the canvas, the bar and its buttons; B2 a non-Section row opens its page first, as Sections do; B3 Undo reselects the block where it was; B4 Structure focus follows the real path; B5 Section buttons disabled at a slot's edge. Without a decision, keep today's behaviour for that item.

## Done when

- `grep -n "moveNativeSection\\|moveNativeBlock\\|moveNativeCanvasBlock\\|moveNativeTemplatePart\\|nativeStructureMoveActions\\|SectionMoveOffer" src` finds only `moveNativeSectionTo` (slice 33).
- `page-structure-controller.test.ts` keeps its contract cases (detached button's selection guard, template made non-section during the wait) on the module; its engine cases go. A browser spec covers focus after a pending Section move; with B1, one covers a template Section a named slot holds alone (bar Alt+↑ = row Alt+↑).
- `native-move-keys`, `native-move-host`, `native-page-sections`, `native-structure` specs green; `npm run check`, `npm test`, full `native-save` suite green; budget delta reported.
