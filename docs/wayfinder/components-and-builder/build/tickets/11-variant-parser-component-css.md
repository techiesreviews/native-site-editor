---
title: "Variant parser: a component's own CSS"
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 2
---

## What

One pure function in `shared/` (for example `shared/variants.ts`) over CSS source, run in the browser and in the Worker ([06](../../tickets/06-research-variant-discovery.md) §6, [07](../../tickets/07-variant-contract.md)).

- Detection: research 06 "Recommended detection rule" steps 1–8 (`git show research/cb-06-variant-discovery:docs/wayfinder/components-and-builder/research/06-variant-discovery.md`), without the annotation comment: ticket 07 §4 dropped it.
- Walk every rule including `@media`, `@supports`, `@layer`, `@container`, `@scope` and nesting; both nested forms (07 §2). Reuse `splitSelectorList` and the brace walker in `shared/slotted-css.ts`.
- `[data-x="v"]` adds a value; presence or `true`/`false` makes a yes/no variant written as a bare `data-x` (07 §1); only `=` is offered. Absent is the default.
- A value seen only under a media or container query carries that condition ("wide screens only").
- Excluded: `data-empty`, `data-unloaded`, `data-native-*`, and names the site's scripts set (`setAttribute`, `toggleAttribute`, `dataset`), given as input.
- Warnings: `:host[data-x]` and `:host { &[data-x] }` never match (with the fix `:host([data-x]) { … }`); no default look (only value rules).
- Labels: values made readable (`image-left` → "Image left"; `data-tone` → "Tone").

## Done when

- `tests/variants.test.ts` covers research 06 edge cases 1–13 as they apply, both nested forms, conditions, exclusions, the two warnings and the labels.
