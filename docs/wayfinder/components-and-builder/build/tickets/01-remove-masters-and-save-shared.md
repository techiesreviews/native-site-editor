---
title: Remove the masters code and Save shared
type: task (AFK)
status: closed
assignee:
blocked_by: []
builder: sol
phase: 1
---

## What

Pure deletion, before anything else ([02](../../tickets/02-masters-become-components.md) §2). No real site has masters ([01](../../tickets/01-research-masters-and-components.md) §1), so nothing is converted.

- The inventory is research 01 §2a–2c (`git show research/cb-01-masters-and-components:docs/wayfinder/components-and-builder/research/01-masters-and-components.md`). Its `main.ts` line numbers predate the controller split; find the hooks by symbol.
- Modules that go: `src/page-builder/` `static-sections.ts`, `native-page-parts.ts`, `native-section-links.ts`, `native-section-master-controller.ts`, `native-shared-section.ts`, `native-page-part-controller.ts`, `sidecar-pages.ts`, `native-section-save.ts`, `static-section-defaults.ts`, `source-target.ts`, `page-builder-document.ts`; `src/components/` `native-shared-authoring.*`, `native-master-preview.ts`, `native-page-part-preview.ts`, `master-banner.*`; `src/controllers/shared-sections-controller.ts`.
- Hooks that go: `nativeSharedRoot` and the master sessions in `src/main.ts`; `nativePageActions: nativeSectionSaveControls` (`src/main.ts:633`, `:658`) and its use in `src/page-builder/components.ts:440-447` (leave the place empty: slice 02 fills it); the shared-root offer and form in `src/components/page-structure.ts`; `masterEdit` in `src/components/native-preview.ts`; master refusals in `src/controllers/preview-selection-controller.ts`; the private-master guard in `src/controllers/media-controller.ts`; `.editor/page-builder.json` re-keying when pages move or are deleted.
- Tests that go: the unit files `section-masters`, `page-builder-document`, `native-shared-section`, `static-section-defaults`, `native-master-preview`, `native-section-master-controller`, `native-section-save`, `native-page-parts`, `static-sections`, `sidecar-pages`, `native-page-part-controller`, `native-section-links`, `shared-sections-controller`; the browser specs `native-master-*`, `native-shared-*`, `native-static-section*-host`, the helper `tests/native-save/static-sections.ts`; the Playwright projects `native-shared-authoring`, `native-shared-structure`, `native-page-part-preview` (`playwright.config.ts`), their harness folders under `tests/` and `package.json` scripts.
- Partial edits: `native-components.spec.ts`, `native-asset-references.spec.ts`, `native-add-catalog-actual.spec.ts` (research 01 §2c).
- Docs under `docs/page-builder/` that describe masters, page parts or Save shared are trimmed to match.

## Done when

- `grep -rn "\.editor/sections\|\.editor/page-parts\|page-builder\.json\|reusableSections\|Save shared" src worker shared tests` finds nothing.
- A plain section's edit bar shows no Save shared or Update saved section.
- `npm run check`, `npm test`, the smoke slice and the full native-save suite pass; the byte-budget delta is reported (it should shrink).

## Done (2026-10-09)

- Masters, page parts, section links, Save shared / Update saved section, `.editor/page-builder.json` and sidecar re-keying are gone with their hooks, 13 unit files, 16 browser specs, three Playwright projects and five docs (90 files, about 12.4k lines removed). With `nativePageActions` gone, the old "Make component…" fallback for containers shows again; slice 02 adds its refusals.
- Commits 70fed15 (Sol), af4d148 and the test/ticket commit after it. No new unit tests (pure deletion); `native-components.spec.ts` asserts no Save shared / Update on a plain section.
- Byte budget: 351 KB to 317 KB gzip before first paint (index.js 277 KB to 244 KB). Full native-save suite, smoke, `@actual` and `@native-static` green.
