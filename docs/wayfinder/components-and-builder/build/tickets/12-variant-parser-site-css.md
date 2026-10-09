---
title: "Variant parser: site CSS, global attributes and class rules"
type: task (AFK)
status: open
assignee:
blocked_by: [11-variant-parser-component-css]
builder: sol
phase: 2
---

## What

Widen slice 11 to every place that can style a host ([07](../../tickets/07-variant-contract.md) §2, §4; [10](../../tickets/10-block-set.md) §4).

- Site stylesheets (a page's linked CSS with its `@import`s, `shared/css-imports.ts`): rules naming the tag (`section-hero[data-x="v"]`, nested `section-hero { &[data-x="v"] }`) count for that component; `:host([data-x="v"])` in a site sheet counts for every component; global attributes (`[data-color-scheme="dark"]`) count for every component.
- Class rules for blocks: `.btn[data-variant="v"]`, `.btn[data-size="v"]` give Button's variants.
- Values for one attribute from several places merge. The script-set exclusion applies only to names found in a component's own CSS; site-wide and global attributes are always offered.
- Cache by path and content hash (research 06 edge case 13).

## Done when

- Unit tests: tag-named and nested rules; `:host()` in a site sheet; a global attribute; `.btn` class rules; merging; the script-set exclusion only for component CSS (`data-open` excluded, `data-color-scheme` kept).
