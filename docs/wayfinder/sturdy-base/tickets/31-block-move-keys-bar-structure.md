---
title: "Alt+arrows, the edit bar's Section buttons and Page Structure rows through the Block move module"
type: task (AFK)
status: closed
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

## Done (2026-10-11)

- Alt+arrows (canvas, bar), the bar's Section Move buttons and Page Structure rows move through `createBlockMoves`: the controller's `moveBlock` (one `said` for refusal, error and the quiet repository drop) behind the bar's one `onMove` for any Block (stamp at render, model and still-selected guard) and main.ts's row `onMove` (stamp and mounted model held from the Structure paint). Gone: `moveNativeOpenFile/Block/TemplatePart/CanvasBlock`, `NATIVE_MOVE_STALE` in main.ts, `nativeStructureMoveActions` and its hand proof, `sectionMovePlan`, `moveNativeSection(AfterOpening)`, `SectionMoveOffer`, ports `moveBlock`/`itemsSlots` (`moveNativeSectionTo` reads items slots through `r`). B1-B5 built: template Sections by the template rules from canvas, bar and buttons; non-Section rows open their page and move; Undo reselects for every key, button and row move; Structure focus follows the real path (a settled pending move waits for the paint of the bytes it wrote, while the moved row keeps focus); Move buttons from `grip.steps`, `draggable` from `grip.drags`. Kept: one stale wording per row move ("Wait for the preview…"); a row whose mounted model changed no longer says "…or its editor is not open".
- Commit dffdf9e7 (incl. Sol review fixes: deferred focus kept with its row and bytes, the bar tested as drawn).
- Tests: `page-structure-controller.test.ts` keeps the bar's stale/selection guard, the drawn bar's Move buttons (edges, detached press), the non-section-during-wait, draft-during-open and quiet repository change, on the module; engine cases gone. `native-move-keys.spec.ts`: a heading row opens its page, moves and keeps focus at its new path (B2, B4); a template Section a named slot holds alone moves with its slot from the bar as from its row (B1). Unit 1,902/1,902; full native-save 878 passed, 1 failed (native-store-history:75, passed on rerun), 56 skipped; smoke 42/42; @actual 54/54. Entry chunk -2.3 KB raw / -0.6 KB gzip.
