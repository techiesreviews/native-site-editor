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
- The page must look and behave the same after making it. Check the plan and its copied CSS (`component-css.ts`, ticket 64) on a page header that is `position: sticky` (or `fixed`) with `top`/`z-index`, as site headers commonly are: wrapped in the new instance (a block host as tall as the header), a sticky header would stop sticking. If so, the made component keeps it working (for example, the positioning moves to the host), or the plan's notes say what changed. Same for rules that reach the header through its place on the page (`body > header`): the plan's notes list what was not carried, as for other elements.
- The banner/contentinfo landmark: confirm the header inside the instance is still exposed as the page's banner (and the footer as contentinfo) in the preview; if not, note it in the ticket's Done.
- Docs: spec decision 10's amendment and the Phase-2 bullet (`docs/wayfinder/components-and-builder/build/spec.md`), `docs/page-builder/components.md`, and the Components chapter of `worker/site-conventions.ts` if it says the page's header/footer is refused (copy into the starter's AGENTS.md and refresh the fixture if the chapter changes).

## Files

Read the whole ticket (What above) first.

- `src/page-builder/component-model.ts` (`makeComponentOffered`, `makeComponentContainers`)
- `src/page-builder/components.ts` (`makeFromAgent`, only if its refusal changes)
- `src/page-builder/component-css.ts`, `src/page-builder/component-plans.ts` (only for the sticky/fixed header)
- `worker/mcp.ts` (the `make_component` description), `worker/site-conventions.ts` (only if the chapter says it)
- `tests/make-component-offer.test.ts`, a new or existing `tests/native-save/native-make-component*.spec.ts` and its fixture page, `tests/native-save/native-mcp.spec.ts` or a unit test
- `tests/native-save/native-components.spec.ts` (the obsolete page header/footer refusal assertion, explicitly requested in review round 1)
- `docs/wayfinder/components-and-builder/build/spec.md`, `docs/page-builder/components.md`, this ticket

## Done when

- `tests/make-component-offer.test.ts`: the page's header and footer (`[]`, `html > body`, `html > body > div` ancestors) are offered; a header/footer inside an instance or in head is still refused.
- A browser spec on a page with a plain `<header>` and `<footer>` (sticky header): Make component on the edit bar and in Structure turns the header into an instance on that page only, a second page with the same header is unchanged, one Undo restores it, and the header still sticks after scrolling.
- `native-mcp.spec.ts` (or its unit equivalent): `make_component` on the page's header succeeds and writes the component; the existing refusals (heading, image, component) still hold.
- `kit specs --affected` passes.

## Done (2026-10-20)

- The page's plain header and footer are offered by Make component, including outside sectioning content. Document elements, head content, components and instance contents keep their refusals. Only this page becomes an instance; other pages retain their copies.
- Sticky/fixed header and footer positioning, offsets and z-index move to the component host, including inline positioning and conditional stylesheet rules. Full-width declarations (`width: 100%` and `inline-size: 100%`) also size the host so fixed headers retain their width. The inner element stays in normal flow, even against highly specific important rules. State-dependent and variable-based positioning remain in place with a plan note explaining the sticky limitation.
- Browser checks confirm the header remains a banner and the footer remains contentinfo in the preview after conversion.
- `RESULT: ok doctor 7/7 checks passed`; `RESULT: ok unit 2436/2436 (165 files)`. `npm run check` and `npm run lint` passed. All nine focused offer/CSS unit checks passed, including stylesheet and inline variable positioning.
- All seven header/footer browser checks passed: edit bar and Structure conversion, sticky/fixed scrolling, host height and z-index, fixed full-width measurements before and after conversion, page isolation, landmarks, one Undo and the variable-positioning limitation note. The fixture verifies the header's original position before conversion. The MCP spec's 19 checks passed, including component files, page isolation, one Undo and existing refusals.
- `tests/native-save/native-components.spec.ts` now expects Make component on the page's plain header and footer; all 19 checks passed. Focused header specs: `RESULT: ok specs 1/1 passed` (7 tests). Full affected run: `RESULT: ok specs 118/118 passed`, including default, actual-starter, native-static and preview fixture groups. Evidence: `.scratch/kit-specs/run-Iv1FJL/`.
- Commits: `df21404e` contains the initial implementation. Follow-up changes are left unstaged for the runner.
