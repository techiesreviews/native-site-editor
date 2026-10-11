---
title: "Page-band tags and reserved custom-element names live once in rules/"
type: task (AFK)
status: open
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
