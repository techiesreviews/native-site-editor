---
title: The canvas shows sub-folder sites
type: task (AFK)
status: closed
assignee: claude (mm-77 runner)
blocked_by: [76-site-path-prefix]
builder: sol
phase: 7
---

## What

The canvas srcdoc resolves against `https://site.invalid` and assumes the repository root is the site root (`src/components/native-preview-runtime.js:111-147`). With a prefix, `/my-site/media/…`, `/my-site/about/` and `/my-site/styles/site.css` must resolve to the repository's files, as must unprefixed root links already in the site.

- Also the preview's asset scanner and page navigation inside the canvas.

## Done when

- A unit test of the runtime's address mapping with and without a prefix.
- Nightly spec: a fixture site with a project-site address shows its styles, images and component in the canvas; clicking a link opens the right page.
- Full suite green.

## Done (2026-10-15)
- **Behaviour.** A site whose Site address is in a sub-folder (`https://user.github.io/my-site/` → `/my-site`, via slice 76's `sitePathPrefix`) shows on the canvas: `/my-site/…` and plain root addresses both name the repository's files for images and video posters, stylesheet `<link>`s, `@import`s and CSS `url()`s (fonts included), the current-page mark on links, Ctrl/Cmd-click and "Follow link" navigation, the files read for a shown page, the canvas asset scanner, Text size's site sizes and the Add panel's component thumbnails. Changing the Site address in Site settings updates the canvas without a reload. Domain-root sites (no address, the starter, techies.review) run the old code: every new `prefix` argument is `""` there and guarded.
  - `src/components/canvas-path.ts` (`canvasRoute`, `canvasPath`): the runtime's address mapping, shared by the runtime and thumbnails. `shared/site-path-prefix.ts` gains `siteRouteOf`, `sitePathOf` as a root route, so readers need no source-guard allowlist entries.
  - The prefix reaches the preview by adding `.editor/config.json` to the preview's sources only (`withSiteConfig` in `src/main.ts`); `nativeSources()` used elsewhere is unchanged. `resolveImportPath`, `expandStyleImports`, `nativePageStylesheets`, `nativeShownFiles`, `nativeLinkTarget` and `mediaResolvePath`/`scanMediaReferences` take an optional prefix; only canvas callers pass it (writers and the general scanner stay with slice 78).
- **Commits.** e39073e8 claim; 764760ff build (Sol, runner changes); 4203cb2f review fix; this close.
- **Tests.** New `tests/canvas-sub-folder.test.ts` (address mapping with and without a prefix, routes, navigation, sheets/imports/url()s, opt-in scanning, shown files, thumbnails); `tests/site-path-prefix.test.ts` +1 (`siteRouteOf`). Fixture `fixtures/native-subfolder` (a copy of native-conventions with the project-site address, prefixed links/stylesheets/import, one SVG; repo 532). Spec `tests/native-save/native-subfolder-canvas.spec.ts` (3: styles, image, components and both link forms; a live address change; Text size from a prefixed import). Ran `npm run check`, `npm run lint`, unit 3,300/3,300; conventions, canvas, site settings, sub-folder and text-size specs green; full suite (`full-suite.sh 3`) 1,049 passed, 0 failed, 60 skipped, 0 flaky.
- **Review (GPT-6.1 Sol, read-only), 1 round.** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-77/round-1/` (run.log: model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`). Fixed 1 (P2): `nativePageStyles` passed no prefix, so Text size missed a sub-folder site's imported sizes; `routeStylesheets` now takes the prefix explicitly, and the suggested regression test was added (it fails without the fix). Rejected 0. Not re-reviewed: a one-argument fix with its test.
- **Bytes.** `test:budget` 352 KB gzip of 355 KB. Boot delta about +0.7 KB gzip against origin/dev (preview runtime +0.42 KB, native-project chunk +0.37 KB, main −0.07 KB): the shared helper now ships with the canvas.
- **Follow-ups.** Slice 78: the general media scanner, rename and Replace everywhere can pass the same optional prefix to `mediaResolvePath`; writers still write unprefixed root addresses. Full own-origin addresses (`https://user.github.io/my-site/…`) on the canvas are not mapped yet.
