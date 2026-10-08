---
title: Research variant discovery from component CSS
type: research (AFK)
status: closed
assignee: claude (research subagent)
blocked_by: []
---

## Question

With variants free per component (settled), how can the editor find a component's variants reliably? Look at parsing `<tag>.css` for `:host([data-x="y"])`, `:host([data-x])` and `:host(:not([data-x]))` selectors (the editor's existing CSS parsing, and how `components.js` adds `::slotted` twins), how to tell the default value, how to label values for people (a CSS comment convention, `@property`, or the raw value), and what to do with variants that are combined (`:host([data-layout="image-left"][data-tone="dark"])`). Survey prior art briefly: Webflow component variants, Framer variants, Figma variant properties, Shoelace/Web Awesome attributes. Check how techies-reviews' `.btn[data-variant]` and `[data-color-scheme]` would fit. Give a recommended detection rule and its edge cases.

## Resolution (2026-10-08)

Full findings: branch `research/cb-06-variant-discovery` (commit 23e1da2), file `docs/wayfinder/components-and-builder/research/06-variant-discovery.md`, which includes 16 edge cases for the variant contract ticket.

1. **Detection rule:** walk every rule in the source of `components/<tag>/<tag>.css`, including those inside `@media`, `@supports`, `@layer`, `@container`, `@scope` and nested `&`. Only selectors that start with `:host(...)` count. Each `[data-x="v"]` adds value `v` to `data-x`. A bare `[data-x]`, or the values `true`/`false`, makes an on/off toggle. `:not([data-x])` marks "attribute absent" as a styled state.
2. **The default is the attribute being absent**, which gives the plain `:host {}` look (as with the Framer primary, Figma top-left and Webflow base variants). A value written in the same selector list as the absent state is the default's name.
3. **Labels** are the raw value, made readable ("Image left"). An optional one-line comment (`/* variant data-tone "Tone": light = Light (default), dark = Dark */`) sets labels, names the default, or marks an attribute as state. `@property` was rejected.
4. **Combined selectors** add a value to each attribute. CSS falls back on its own, so no combination can be missing.
5. **Excluded:** `data-empty`, `data-unloaded` and `data-native-*`; attributes the site's own scripts set (for example a drawer's `data-open`); `:host-context()` and operators other than `=`. The editor should warn about `:host[data-x]` written without parentheses, because it never matches.
6. **Where it is built:** a pure function in `shared/` over the CSS source, reusing `splitSelectorList` and the brace walker in `shared/slotted-css.ts`. It runs in the browser and in the Worker (for MCP), and can be tested in node. The loader needs no change: variant rules already reach slotted content.
7. **techies-reviews:** `section-split`'s `data-reverse` reads as a toggle that only applies on wide screens (it sits in `@media`). `.btn[data-variant]` and `[data-color-scheme]` are not component variants. The same parser could find them by class or attribute, which bears on variants for builder blocks.
