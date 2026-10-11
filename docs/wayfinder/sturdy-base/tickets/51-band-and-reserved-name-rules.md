---
title: "Page-band tags and reserved custom-element names live once in rules/"
type: task (AFK)
status: closed
assignee:
blocked_by: [28-frame-guard-test]
builder: sol
phase: 2
---

## What

Found by slice 28's review: two lists are still copied, outside the tag groups its guard watches.

- `["article", "aside", "main", "nav", "section"]` (where header/footer count as page bands) in `component-model.ts`, `variant-fields.ts` and `remove.ts`.
- `component-model.ts` `RESERVED` duplicates the custom-element reserved names in `rules/movable.ts` (slice 23 also left a copy in `shared/native-project.ts`; move the rule to `shared/` if `shared/` can't import `src/`).

One home each in `src/page-builder/rules/` (or `shared/` for the reserved names), and the frame guard (`tests/frame-guard.test.ts`) gains both groups so a new copy fails. No behaviour change.

## Done when

- The guard's new groups have a broken example and a near-miss each; `rg` for the band list and the reserved names finds only the rule files.
- `npm run check`, `npm test`, the specs touching remove / variant fields / make component, smoke and `@actual` green.

## Done (2026-10-11)

- `src/page-builder/rules/page-bands.ts` (`PAGE_BAND_ANCESTORS`, `isPageHeaderFooter`) is the one band list, used by `makeComponentOffered` (and the `makeComponentContainers` text, built from it), `pageRemovable` and `isToneBand`; `shared/custom-element-names.ts` (`RESERVED_CUSTOM_ELEMENT_NAMES`) is the one reserved list, used by `rules/movable.ts`, `tagNameProblem` and `isNativeComponentTag`. No behaviour change.
- `tests/frame-guard.test.ts` gains `copied-band-set` (all five ancestors in any literal form outside rules/; 7 other-meaning lists allowlisted, count 1 each) and `copied-reserved-set` (three or more reserved names outside the shared home), each with broken examples and near-misses (four of five; two names).
- Built by Sol, headers and review fix by Claude; reviewed by Sol (no defects; one allowlist reason corrected). Unit 1,907/1,907; touched specs (make component, menus, delete key, tone, variants, code variants) 28/28; smoke 42/42; @actual 54/54.
