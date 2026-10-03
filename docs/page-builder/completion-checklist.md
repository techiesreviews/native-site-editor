# Native builder completion checklist

Lex's authorized continuation is active in T3 thread `da5eb845-2cdf-4f84-8736-2704ec23f3ad`. Latest requests override earlier panel and catalogue behavior. Output remains runnable native HTML/CSS/Web Components; editor controls stay in the editor project. Preserve all worktrees and uncommitted work. Production/main stays untouched. Independent code, UX and design review uses Claude Opus 5.5 through CLI.

- [x] Recover and fix original component/canvas/palette findings and flaky tests, including attribute escaping/source corruption.
- [x] Move page settings and navigation to Pages, Images beside Pages/Files, site settings to the header icon; remove the old Structure page summary and setup entry.
- [x] Resize component properties and remove the selected-slot left stripe.
- [x] Style class chips, catalogue/search, CSS variable completion and relevant-variable menu, source navigation, grid editing and image focal-point controls. Final combined experience remains below.
- [x] Refactor image/media browsing and details with roomier spacing, one scroll area, visible metadata, safe refresh, deletion and keyboard focus. Independently reviewed and integrated; starter screenshot displayed.
- [x] Fix overlapping card placeholder/Add controls, scaled layouts, scroll geometry and keyboard fallback.
- [x] Remove `pb-add-panel__code-toggle` and HTML snippet/peek functionality.
- [x] Remove Effects from the edit bar and its preset functionality; keep authored site CSS.
- [x] Extend the collection model to mixed work/services/portfolio/articles/videos sources, deduplication and shared filter/sort/limit. Actual host integration remains below.
- [x] Implement guarded structural Undo/Redo and later-new-page visual history. Combined independent review approved the corrected slice; 23 units and 11+2 browser checks pass, with two later exact opaque-record checks.
- [x] Show sections only in the actual Add to page host; remove separate Heading/Text/Image/Video/Form/Grid/Columns choices. Actual section insertion and absence tests pass. Review, obsolete catalogue test retirement and fresh screenshot remain below.
- [x] Pages header settings follow the active canvas page while the code pane may stay on another page. Explicit row settings still target that row. Browser checks pass; review remains below.
- [ ] Remove the component “Empty slots” UI. Put slot text editing and visibility toggles in Page structure, with Disconnect and Edit actions at the component root. Link/image rows expand for “Button text”, “Link / URL”, “Image” and “Alt text”; use plain-language labels. Preserve authored slot content and native conditions.
- [ ] Selecting a component edits its page instance. Enter shared component/template editing only through an explicit Edit action in the edit bar or Page structure. Preserve clear scope and return-to-page behavior.
- [x] Component edit affordance appears only on the directly selected component root, never a paragraph/wrapper/button or other child. Show the complete name at rest; reveal the edit icon over a fading overlay sliding from the right on hover. Preserve keyboard access, touch and reduced motion. Independent Claude review approved the exact corrected slice; integrated into dev. The Structure migration remains pending.
- [x] Code panel fully collapses to the bottom, by dragging or clicking the grip. Keep a visible restore grip and remember the previous height. The earlier minimized source floor is superseded. Exact corrected panel slice reviewed and integrated; 21 browser checks and real-starter captures pass.
- [x] Style panel fully hides to the right, with the same drag/click/keyboard/restore behavior as Page structure; no leftover content or rail. Exact corrected panel slice reviewed and integrated.
- [x] Remove the image SRC Address/link icon from the edit bar; keep Choose image, Alt text, image focus and actual hyperlink editing. Five field/image/link host browser checks pass; independent host review approved.
- [x] Close final structural review findings: binary file operations and repeated renames must refresh after accepted history; a renamed stylesheet must not remain editable at its deleted path; canvas edits during a history hold must still save. Combined independent review approved the fixes; residual low-priority cleanup remains in the final consistency review.
- [x] Preserve untouched metadata and source absence, roundtrip/no-change behavior, independent social values and checkbox-only URL guards. Corrected metadata slice independently approved at 4de155d; 17 units, 8 focused browser cases and 14 settings regressions pass (separate runs).
- [ ] Preserve moved-page expansion/selection in Pages, including the existing nested-page assertion. Confirm the diagnosed test failure against the current host.
- [ ] Finish native fields and ordinary element Move for existing HTML, with guarded source edits and one Undo. Individual HTML Add stays removed.
- [ ] Integrate collection fields, template bake, page create/move/delete/identity hooks and history. Automatic collections choose source folders and create source pages; manual cards keep their own workflow.
- [ ] Reassess optional-slot canvas fill against the new Structure-based controls; remove the requested Empty slots UI and avoid adding duplicate controls. Finish native conditions and empty-field behavior without editor overlays entering published DOM.
- [x] Close known source-parser guard cases and review the bounded Move helpers, including colgroup/ruby and comment repair refusals. Final b76b30d slice approved and integrated as 8942ff5. This is not a complete HTML parser; actual Move host remains pending above.
- [ ] Update old browser helpers for relocated settings and section-only Add without weakening source, published output, keyboard or history assertions; rerun actual product failures after fixes.
- [ ] Final consistency/accessibility/source/Undo review and exact-candidate checks/build. Include open Address popup identity across selection changes, baseline accessible field warnings, social-link toggle restoration/hints and retained-model cleanup.
- [ ] Fresh real-starter screenshots displayed in this T3 thread before every push or preview deploy; release only to dev/preview-editor.techies.tools and verify the resulting version.

Checkpoint commits, paths, worker ownership, servers, tests, failed checks, screenshot paths and the next action are recorded in `memory/handoffs/t3-page-builder-2026-10-03.md`. A checked slice is not a claim that the whole builder is finished or released.
