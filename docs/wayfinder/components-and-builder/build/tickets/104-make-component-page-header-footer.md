---
title: "Make component on the page's own header and footer, this page only"
type: task (AFK)
status: closed
assignee: claude-release-lead
blocked_by: [80-make-component-containers-only]
builder: sol
phase: 3
---

## What

Lex (2026-10-20), amending decision 10 and ticket 80: Make component is also offered on the page's own `<header>` and `<footer>` (the ones not inside article, aside, main, nav or section). It works as it does for a section: the element on **this page only** becomes an instance of the new component; other pages keep their own copies. The remaining refusals stay (document elements, `<main>`, `<body>`, head content, components, anything inside an instance; the starter's `<site-header>`/`<site-footer>` are components and keep Edit component).

- `makeComponentOffered` (`src/page-builder/component-model.ts`): a header/footer is offered wherever a section would be; `isPageHeaderFooter` stays the one rule for Remove and tone bands (`src/page-builder/rules/page-bands.ts`, unchanged). Update `makeComponentContainers` so agent refusals name header and footer without the "inside …" condition.
- Everything that uses it follows: the edit bar, the Structure ⋯ menu and right-click, and the `make_component` MCP tool (`makeFromAgent` in `src/page-builder/components.ts`; the tool description in `worker/mcp.ts` stops saying it refuses the page's own header/footer).
- The page must look and behave the same after making it. A page-owned header/footer gets `:host { display: contents; }`, so the host makes no box and the inner band keeps its positioning, offsets, width, states, custom properties and media rules. Do not transfer positioning declarations to the host. Sectioning headers/footers retain the ordinary block host. Keep the normal copied page CSS and notes for rules that cannot follow (ticket 64).
- A page-owned band's anchor ID stays on the instance. Copied rules whose root compound matched that ID target the inner band (`:host > header` or `:host > footer`), retaining the compound's classes/states, the rest of the selector and its conditional wrappers. Copied band rules must not style the boxless host instead of the visible band.
- Selection from canvas and Structure, selection/hover outlines, the label and edit bar measure a boxless instance by what it shows, reusing ticket 34's band bounds. Tone still works. Remove and drag keep their existing protection for page headers/footers outside main.
- The banner/contentinfo landmark: confirm the header inside the instance is still exposed as the page's banner (and the footer as contentinfo) in the preview; if not, note it in the ticket's Done.
- Docs: spec decision 10's amendment and the Phase-2 bullet (`docs/wayfinder/components-and-builder/build/spec.md`), `docs/page-builder/components.md`, and the Components chapter of `worker/site-conventions.ts` if it says the page's header/footer is refused (copy into the starter's AGENTS.md and refresh the fixture if the chapter changes).

## Files

Read the whole ticket (What above) first.

- `src/page-builder/component-model.ts` (`makeComponentOffered`, `makeComponentContainers`, page-band host display)
- `src/components/native-preview-runtime.js` (boxless instance measurements, explicitly requested in round 2)
- `src/page-builder/components.ts` (`makeFromAgent`, only if its refusal changes)
- `src/page-builder/component-css.ts`, `src/page-builder/component-plans.ts` (only for the sticky/fixed header)
- `worker/mcp.ts` (the `make_component` description), `worker/site-conventions.ts` (only if the chapter says it)
- `tests/make-component-offer.test.ts`, a new or existing `tests/native-save/native-make-component*.spec.ts` and its fixture page, `tests/native-save/native-mcp.spec.ts` or a unit test
- `tests/native-save/native-components.spec.ts` (the obsolete page header/footer refusal assertion, explicitly requested in review round 1)
- `tests/component-css.test.ts` (page-band ID selectors, explicitly requested in round 3)
- `docs/wayfinder/components-and-builder/build/spec.md`, `docs/page-builder/components.md`, this ticket

## Done when

- `tests/make-component-offer.test.ts`: the page's header and footer (`[]`, `html > body`, `html > body > div` ancestors) are offered; a header/footer inside an instance or in head is still refused.
- A browser spec on a page with a plain `<header>` and `<footer>` (sticky header): Make component on the edit bar and in Structure turns the header into an instance on that page only, a second page with the same header is unchanged, one Undo restores it, and the header still sticks after scrolling.
- `native-mcp.spec.ts` (or its unit equivalent): `make_component` on the page's header succeeds and writes the component; the existing refusals (heading, image, component) still hold.
- `kit specs --affected` passes.

## Done (2026-10-20)

- Page headers/footers are offered by Make component on this page only; document elements, head content, components and instance contents retain their refusals. The legacy browser assertion expects the new offers.
- Page-owned header/footer hosts use `display: contents`. Inner positioning, custom properties, hover states and responsive widths stay as written; sectioning headers/footers retain block hosts. Normal copied page CSS and its notes are unchanged.
- Boxless instances use the existing band bounds for selection/hover outlines, labels, edit-bar placement, reveal and inspection. Page-header/footer Remove and drag protection is unchanged.
- All seven focused browser cases pass: edit bar/Structure conversion, sticky scrolling with variable-based positioning and hover-dependent offsets, fixed full-width and narrow `width: auto` sizing before/after conversion, canvas/Structure selection and outlines, hover label/highlight, edit bar, inherited Tone, Remove/drag protection, page isolation, landmarks and one Undo. `RESULT: ok specs 1/1 passed`; evidence: `.scratch/kit-specs/run-8OcFOV/`.
- `RESULT: ok doctor 7/7 checks passed`; `RESULT: ok unit 2435/2435 (165 files)`. All eight focused offer/CSS unit checks pass. `npm run check` and `npm run lint` pass.
- Commits: `df21404e` contains the initial implementation; `17995618` contains the first follow-up. These changes are left unstaged for the runner.

## Done (2026-10-21)

- Revalidated the unchanged implementation: `RESULT: ok doctor 7/7 checks passed`; `RESULT: ok unit 2435/2435 (165 files)`. `npm run check` and `npm run lint` passed.
- Full affected browser validation passed: `RESULT: ok specs 127/127 passed`, with 952 tests passed, no failures or skips, across default, actual-starter, native-static and preview groups. This includes all seven band cases, the MCP header creation/refusals and the legacy page-landmark offer check. Evidence: `.scratch/kit-specs/run-KAv332/`; command log: `.scratch/104-round2-affected-retry.log`.
- Earlier attempts hit the Watch spec's immediate WebSocket-frame assertion. An unchanged focused rerun and a clean committed-baseline run each passed all nine Watch tests; the full affected retry passed too. No Watch source or test changes were made.
- No new commits; changes remain unstaged for the runner.

## Done (2026-10-21)

- A page-owned header/footer retains its anchor ID on the instance. Copied ID rules target the inner band rather than the boxless host, retaining states, descendant selectors and media/supports conditions; ordinary block-component rewriting is unchanged.
- New header/footer unit cases reproduce the lost ID styles and pass with the fix. The new browser case preserves an ID-styled sticky header's scrolled position, background, padding and responsive width before/after conversion, resting and hovered at wide and narrow viewports. All eight band browser cases pass: `RESULT: ok specs 1/1 passed`; evidence: `.scratch/kit-specs/run-NzxBxr/`.
- `RESULT: ok doctor 7/7 checks passed`; focused CSS units: `RESULT: ok unit 24/24 (1 files)`; affected units: `RESULT: ok unit 2437/2437 (165 files)`. `npm run check` and `npm run lint` pass.
- Full affected browser validation: `RESULT: ok specs 127/127 passed`, with 953 tests passed across default, actual-starter, native-static and preview groups. Evidence: `.scratch/kit-specs/run-hA5RgY/`; command log: `.scratch/104-round3-affected.log`.
- No new commits; changes remain unstaged for the runner.
