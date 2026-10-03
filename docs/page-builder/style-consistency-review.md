# Style pane consistency review

## Baseline

This review compares the Style pane with the existing editor at `900aa98`, not a new visual system. Sources: Page structure/sidebar, code pane splitters, component properties, `src/theme.css`, the existing style writer/host, and the page-builder UX research. Real starter screenshots were inspected before changes.

- Classless component: `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-muscwyfn-c47aba50.png`.
- Native `.eyebrow` class: `/home/ubulex/.t3/userdata/browser-artifacts/browser-screenshot-localhost-musd0a46-bfc64d3d.png`.

## Findings and changes to verify

| Area | Existing baseline | Style discrepancy | Intended correction |
| --- | --- | --- | --- |
| Pane size | Page structure has remembered drag width; component properties has remembered drag height | Fixed296/264px Style width | Same shared grip/press behavior, constrained remembered width |
| Folding | Splitter click and keyboard fold/restore | Independent vertical opener and close button | One fold state shared by grip, opener and Escape |
| Classes | Native source and selection remain visible | Only the first class appears; additional classes cannot be chosen | Show all decoded native class tokens; choose one explicit editing target |
| Adding a class | Source changes preserve unrelated attributes/content | Existing host replaces the entire class attribute | Append one token, deduplicate, retain order and source safety |
| Edit scope | Component identity and shared-edit context are explicit | Target path is only a tooltip | Visible selector, stylesheet path and shared-class explanation |
| Controls | Existing theme tokens, compact inputs and foldable sections | Style has separate spacing/header rhythm | Match existing pane density and tokens without changing the CSS writer |
| Responsive scope | Canvas width and style breakpoint share one contract | Easy to confuse class selection with viewport changes | Keep breakpoint/state when switching active class; preserve custom canvas widths |
| Recovery | Source/history stays available below canvas | New class controls could target stale source | Keep exact source/selection guards and one source edit per operation |

Class chips represent individual native class names. Selecting a chip does not create a combined selector. Existing class rule matching and cascade remain authoritative. There is no invented affected-element count. Class removal is outside this slice. Native HTML/CSS remain runnable; editor controls stay in this editor project.

The prior user-requested removal of the setup menu invalidated ordinary-site reopening tests. Retire that removed-entry expectation while preserving initial setup/dismissal tests; do not restore the menu merely to satisfy old tests.

## Validation

Class chips and the resizable/foldable Style dock are implemented. Selector matching preserves quoted and escaped CSS tokens; class additions preserve existing raw quote/entity/spacing bytes, including empty class attributes. Independent Astra review approved the remaining narrow correction at `3888746`.

The practical property catalogue and search are implemented, including directional spacing labels and CSS property names. Search preserves focus and restores prior section folds after clearing. Types and all 606 unit tests pass in isolated immutable checkout `3888746`; the combined Style browser suite passes 19 cases, and the narrow empty-class and spacing-search regressions pass three cases each. Logs are under `.scratch/t3-continuation/`.

Real starter after screenshots, captured from that exact checkout and displayed in destination T3 thread:

- `.scratch/t3-continuation/style-search-real-starter-3888746.png`
- `.scratch/t3-continuation/style-classes-real-starter-3888746.png`

The native T3 browser disconnected with an explicit unavailable-host error during capture. The screenshots therefore use the project Playwright browser against the actual starter harness on 5215, not a substitute page or fixture. The original starter checkout is unchanged. The first screenshot shows directional search with component controls and native source visible together.

CSS-variable host integration and context menus are in progress. Grid/focal-point leaf controls, persistent Images host tab, collections/elements host wiring, optional-slot ghosts and code-visible policy remain separate completion work. None of this resumed work has been pushed or deployed yet.
