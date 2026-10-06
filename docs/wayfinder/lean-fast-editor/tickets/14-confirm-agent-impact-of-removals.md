---
title: Confirm the agent/MCP and shared-code impact of the removals
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: [07-what-is-left-after-removals]
---

## Question

With the removal boundaries fixed (ticket 07), does anything outside the style panel, collections and Page Fields depend on what goes? Known so far: no MCP tool mentions collections or the style panel, but the style cascade (`src/style-cascade.ts`, `shared/cascade.ts`, `resolveSelectedRules`) is also used by the image focal point (`main.ts:1803`), `linkedRules` (`main.ts:1266`), static sections and slotted CSS, and the MCP measure tool reports matching CSS rules. List what must stay, what moves, and any MCP tool descriptions or conventions text (`worker/site-conventions.ts`) that mention removed features.

## Resolution (2026-10-06)

Full findings: branch `research/14-agent-impact-of-removals` (commit aeefe25), file `docs/wayfinder/lean-fast-editor/research/14-agent-impact-of-removals.md`.

1. The style cascade stays: `shared/cascade.ts`, `src/style-cascade.ts` (`resolveSelectedRules`), `styles-index.ts`, `slotted-css.ts`, `css-intelligence.ts` and most of `css-write.ts` serve kept features. `linkedRules` (`main.ts:1266`) is the code pane's rule chips. The image focal point and grid editor are opened only from `style-panel.ts`; **Lex decided they go with the panel** (image position and grid layout are then edited in code). The panel's selected-collection inspector goes too.
2. No MCP tool, agent operation or conventions text depends on removed features. `inspect_preview` reads rules from `matchingRules()` in `native-preview-runtime.js`. No MCP changes needed.
3. Main blocker: `applyNativeCollectionOperation` (~20 callers, including agent `write_file`, `set_page_details`, `move_file`, `delete_file`, `create_page` and Add card) holds the only live code that re-keys `pages[path]` entries and rebases shared-section links when pages move or are deleted. That logic moves to a neutral module (with its unit tests from `document-collections.test.ts`) before collections go; callers then use plain `applyNativeOperation`, and agent HTML writes stop loading every page first.
4. Correction to ticket 07: the sidecar keeps top-level `reusableSections` and `pages[path].pageParts` too. The rule is: strip `collections` and `pages[*].fields`, keep everything else.
5. Collateral tests: 15 browser specs touch the style panel (mostly its resize grip in setup), 4 shared specs use collections or the Fields tab, about 10 unit tests for kept modules assert `collections` survives or use collection helpers as setup.
