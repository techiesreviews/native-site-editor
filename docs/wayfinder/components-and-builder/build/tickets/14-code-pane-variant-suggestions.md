---
title: Variants in the code pane
type: task (AFK)
status: closed
assignee: sol
blocked_by: [12-variant-parser-site-css]
builder: sol
phase: 2
---

## What

Ticket [07](../../tickets/07-variant-contract.md) §3 and §5 (code pane).

- HTML pane: inside `<section-hero ` suggest its variant attributes; after `data-tone="` suggest the values and say what the absent attribute gives; hovering a variant attribute lists its values; an unknown value gets a soft warning marker.
- CSS pane: warn on the broken form `:host[data-x]` / `:host { &[data-x] }` and show the fix; warn when a component has no default look. Nothing is suggested in CSS.
- Monaco providers are registered in `src/components/code-editor.ts` (CSS completion `:297`, hover `:313`); add the HTML ones beside them. Keep the suggestion logic a pure function of the text and offset.

## Done when

- Unit tests for the pure suggestion function (attribute list, values with the default note, unknown value).
- Nightly spec: typing in the HTML pane offers the variant attributes and values.

## Done (2026-10-09)

- `src/page-builder/variant-intelligence.ts`: pure HTML suggestions (variant attributes inside a component tag, values after `data-x="` with what the absent attribute gives), hover, Custom value notes (Info) and CSS warnings (broken `:host[data-x]` with the fix, no default look; Warning). Wired in `code-editor.ts` beside the CSS providers through a `variants` host input; `main.ts` `nativeVariants` builds the lookup from the site's CSS and JS (late reads refresh the panes). `shared/variants.ts` gains `scriptAttributes(js)`.
- Built by Sol, checked by Claude (marker severities, sticky scanner); review fixes for late/failed reads, completing a name over an existing value, `textarea`/`title` text, and setter-only script scanning.
- Tests: `tests/variant-intelligence.test.ts` (8 tests), nightly `tests/native-save/native-code-variants.spec.ts` (typing offers the attributes, then the values; provider lifecycle).
