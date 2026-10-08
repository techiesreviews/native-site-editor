# 06 · Variant discovery from component CSS (2026-10-08)

Ticket: [Research variant discovery from component CSS](../tickets/06-research-variant-discovery.md). Read on `dev` at bacb984, techies-reviews and native-site-editor-starter as of today.

## Summary

- **Detection rule:** in the source of `components/<tag>/<tag>.css`, walk every style rule (descending `@media`, `@supports`, `@layer`, `@container`, `@scope`, resolving nested `&`). For each complex selector whose **first compound starts with `:host(`**, read the argument: every `[data-NAME="VALUE"]` (operator `=` only) adds VALUE to axis NAME; a bare `[data-NAME]` with no values anywhere makes NAME an on/off toggle; `:not([data-NAME])` marks "attribute absent" as a styled state. Attributes inside `:is()`/`:where()`/`:not()` in the `:host()` argument count; attributes on later compounds (inner elements) do not.
- **Default = the attribute is absent** (the plain `:host {}` look), like Framer's primary variant, Figma's top-left variant and Webflow's base variant. A value grouped with the absent state in one selector list (`:host(:not([data-tone])), :host([data-tone="light"])`) is that default's name. Otherwise the default is shown as "Default".
- **Labels:** humanised raw value (`image-left` becomes "Image left") by default. An optional one-line CSS comment can override labels and name the default (proposed shape below). `@property` is not a fit: it has no labels, it drives custom properties rather than attributes, and it is document-global.
- **Combined selectors** (`:host([data-layout="image-left"][data-tone="dark"])`) add a value to each axis. They never create a new axis. Axes are independent, so there are no "missing combinations" as in Figma, because CSS just falls through.
- **Not variants:** reserved names (`data-empty`, `data-unloaded`, `data-native-*`), attributes the site's own scripts set (state such as techies-reviews' `code-drawer` `data-open`/`data-dragging`), `:host-context()`, `:host[data-x]` without parentheses (it never matches, so the editor warns), and operators other than `=`.
- **Where to run it:** as a pure function in `shared/` over the CSS source, not over the CSSOM. The source keeps the comments (labels), runs in the Worker for MCP agents, and is node-testable. It can reuse `splitSelectorList` (`shared/cascade.ts:29`) and the brace walker of `shared/slotted-css.ts:24`.
- **techies-reviews:** `section-split` `:host([data-reverse])` is discovered as a toggle, with an "on wide screens only" note because it sits inside `@media`. `.btn[data-variant|data-size]` and global `[data-color-scheme]` are not component variants. The same parser can find them with a different subject (`.btn` compound, or a bare attribute), which feeds the open "variants on builder blocks" question.

## What exists today

### The editor's CSS handling

| Where | What it does | Relevance |
|---|---|---|
| `shared/slotted-css.ts:24` `withSlottedRules` | A hand-rolled CSS walker (comments, strings, brackets, nesting, grouping at-rules, skips `@keyframes` and blocks in custom properties) that inserts `::slotted()` twins. | This is the walker that discovery needs. `preludeEnd`, `skipSpace` and `blockEnd` (`:138-181`) are private. Factor them out, or add a second visitor beside the twin pass. |
| `shared/slotted-css.ts:89-96` `slottedTwin` | No twin when the **last** compound has `:host`. | `:host([data-x]) h2` gets the twin `:host([data-x]) ::slotted(h2)`. The `:host(...)` prefix is kept as it is, so variant rules reach slotted content. Verified below. |
| `shared/cascade.ts:29` `splitSelectorList` | Top-level comma split that knows about quotes, brackets and parentheses. | Reuse it to split `:host()` arguments and `:is()` lists. |
| `src/styles-index.ts:53` `scanRules` | A source scan with byte offsets that pushes nested rules but does not resolve `&`. | Its offsets could later jump from a variant to its rule in the code pane. On its own it is not enough for discovery, because of nesting. |
| `src/components/native-preview-runtime.js:1548-1564` `hostMatch` | Matches `:host`, `:host(<sel>)` and `:host-context(<sel>)` against the host for the cascade panel. | A CSSOM-side precedent. The same split of the argument applies. |
| `src/components/native-preview-runtime.js:1703-1750` `walk` | Walks the CSSOM, resolves `&` as `:is(<parent>)` and tracks `@media`/`@supports`/`@layer`/`@container`/`@scope` conditions. | A model for the source walker's context handling (conditions per rule). |
| `src/components/native-preview.ts:296` `composeStyles` | Main thread: `sources[path]` of each component's CSS, passed through `withSlottedRules`. | Discovery input is right here, the untwinned `sources[path]`. |
| `fixtures/actual-starter/components/components.js:101,180` | The site loader adds the same twins at runtime, appends `[data-empty]{display:none}`, and clones the page's `<link rel=stylesheet>` into every shadow root (`:107`). | Site-wide CSS also lands in each shadow root (see edge case 16). `data-empty` is reserved. |
| `src/page-builder/component-model.ts:1167` | Make component writes `:host { display: block; }` only. | Nothing to discover until an author adds variant rules. Make component cannot infer variants from the page today. |
| `worker/site-conventions.ts:66` | What agents are told about the twin rule. | Ticket 05 should add the variant rule here once 07 settles it. |

No CSS parser library is a dependency (`package.json:45-52`). Everything is hand-rolled, which matches the no-dependency loader.

### Two checks run for this ticket

Chromium's CSSOM normalises attribute values. `[data-tone=dark]` and `[data-tone='light' i]` serialise as `[data-tone="dark"]` and `[data-tone="light" i]`, and a nested `h2` reads `& h2`. `:host[data-x]` parses (and never matches). So a source parser must normalise quotes and flags itself.

`withSlottedRules` on variant rules (output abridged):

```css
:host([data-tone="dark"]) h2, … , :host([data-tone="dark"]) ::slotted(h2) { … }
:host(:not([data-tone])) p, :host(:not([data-tone])) ::slotted(p) { … }
@media (width > 56rem) { :host([data-reverse]) .window, :host([data-reverse]) ::slotted(.window) { … } }
:host([data-tone="dark"]) { h2, ::slotted(h2) { … } }
```

Variant rules already style slotted content, so the variant feature needs no loader change. Discovery should run on the source, not the twinned text. The twins never change the `:host()` part, so the result would be the same, but the source keeps the comments.

### The reference sites

- **native-site-editor-starter:** none of the 9 components (`components/*/*.css`) has any `:host(...)` variant rule today. Every one is `:host { display: block; }` plus element rules. Example variants would be new (map: "Starter updates").
- **techies-reviews:**
  - `components/section-split/section-split.css:66`: `:host([data-reverse]) .window { order: 2 }`, **inside `@media (width > 56rem)`**. This is a real boolean variant, but it has no visible effect on narrow screens. The UI should say so.
  - `components/code-drawer/code-drawer.css:22-37,122`: `:host([data-open])`, `:host([data-dragging])`, `:host([data-resizing])`, mixed with `:hover`/`:focus-within`. These are **state** set by `scripts/prebuilt-code.js:78,91,149`, not choices for an author. A naive rule would offer "Open / Dragging / Resizing" toggles.
  - `styles/utilities.css:79-150` (in `@layer utilities`): `.btn` with nested `&[data-variant="secondary"]`, `&[data-variant="ghost"]`, `&[data-size="small"]`, `&[data-size="large"]`, and a later flat `.btn[data-variant="ghost"]:hover`. These are **class-level** variants on a plain element, not on a component host. Default = absent (the filled button). Templates use them as `<a class="btn" data-variant="secondary" data-size="large">` (`components/section-hero/section-hero.html:10`).
  - `styles/tokens.css:64-68`: `[data-color-scheme="light"]`, `[data-color-scheme="dark"]`, `[data-color-scheme]:not(:root)`. This is a **global** attribute that works on any element, a component host included (site CSS matches the host in the light DOM and the scheme inherits into the shadow root). `scripts/color-scheme.js` also sets it on `<html>` as user state.
  - `styles/prebuilts/logo-marquee.css:23,46`: `[data-faded="true"]`, `[data-reversed="true"]`, with `data-reversed="false"` written in markup. Booleans spelled as strings.

## Prior art

| Tool | Model | Default | Labels / declaration | Lesson |
|---|---|---|---|---|
| **Figma** variant properties | Several named axes (`Size`, `Color`) × values. Each variant's layer name encodes `Size=Small, Color=Red` and Figma parses it from that text. Boolean properties are separate. | The top-left variant of the set. | The property and value names as typed. | Axes come from text parsing, as ours will from selectors. Multi-axis is normal. Booleans are a separate kind. |
| **Framer** variants | One axis of named variants. The **primary** variant holds the structure and the others store only overrides. Hover/press "gesture variants" are states that branch from a variant. | Primary. | The variant name. | Base + overrides is the CSS model exactly (`:host {}` + `:host([..])`). Interaction states are not instance choices, so keep state out. |
| **Webflow** component variants | A base variant plus named style variants. The instance picks one from a Variants dropdown in the Props panel. Code components declare a Variant prop with options, a default and tooltip text. | The base variant. | Declared names, with an optional tooltip. | A dropdown per axis. Optional help text is worth having. |
| **Web Awesome / Shoelace** | Plain attributes: `variant` (neutral, brand, success, warning, danger), `appearance` (accent, filled, outlined, …), `size`. They are declared in JS/JSDoc and collected into a Custom Elements Manifest with values, a default and a description. The docs restyle with `wa-button[variant="brand"]`. | Documented per attribute (`neutral`, `accent`, `m`). | JSDoc `@attr {…} name=default description`. | Attribute names like `variant`/`size`/`appearance` are a familiar shared vocabulary for ticket 07. Values and defaults are best declared, so a comment annotation is the CSS-only analogue of `@attr`. |

## Recommended detection rule (detail)

Input: the source text of `components/<tag>/<tag>.css` (untwinned). Output, per tag:

```ts
interface VariantAxis {
  attribute: string;                 // "data-tone", lowercased
  kind: "choice" | "toggle";
  values: { value: string; label: string; conditions: string[] }[]; // conditions: "@media (width > 56rem)"
  defaultLabel: string;              // "Default", or the aliased value's label
  defaultAlias?: string;             // a value that means "absent" (see step 5)
  combinedWith: string[];            // other axes seen in the same :host() compound
  warnings: string[];
}
```

1. **Walk rules.** Use the existing walker shape (`shared/slotted-css.ts:24`). Descend `@media`, `@supports`, `@layer`, `@container` and `@scope`, and record each as a condition. Skip `@keyframes`, `@font-face`, `@starting-style` and custom-property blocks. Resolve a nested selector's `&` against its parent list as `:is(<parent>)`, the same as the runtime (`native-preview-runtime.js:1711`). A relative nested selector (`h2` under `:host([x])`) inherits the parent's `:host()` compound.
2. **Pick host compounds.** Split each selector list (`splitSelectorList`). Keep a complex selector only if its **first** compound starts with `:host(`. `:host-context(` is ancestor context, not an instance choice, so skip it. `:host[...]` and `:host.foo` (no parentheses) never match: add a warning ("did you mean `:host([data-x])`?").
3. **Read the argument.** Inside the `:host( … )` argument, collect attribute selectors whose name starts with `data-`:
   - `[data-x="v"]` (operator `=`, any quoting, optional `i`/`s` flag stripped): value `v` on axis `data-x`.
   - `[data-x]`: presence.
   - Inside `:is()`/`:where()`: each alternative contributes.
   - Inside `:not()`: `:not([data-x])` marks the absent state as styled. `:not([data-x="v"])` still contributes `v`.
   - Operators `~=`, `|=`, `^=`, `$=`, `*=`: not enumerable. Skip with a warning.
   - Class or non-`data-` attributes in `:host()` (`:host(.dark)`, `:host([variant=x])`): ignored (the map settles on `data-*`). An agent hint could flag them.
4. **Classify.** An axis with at least one value is a **choice**. An axis with only presence is a **toggle** (the editor writes `data-x` with no value, or removes it). An axis whose values are exactly `true`/`false` (or just `true`) is also a **toggle**, written as `="true"`. Presence alongside values is an "any value" rule and adds no option.
5. **Default.** Absent attribute = default. If one selector list puts a value next to the absent state (`:host, :host([data-tone="light"])` or `:host(:not([data-tone])), :host([data-tone="light"])`), that value is the `defaultAlias` and the default takes its label. An annotation (below) can also name it. Whether picking the default removes the attribute or writes the alias is for ticket 07. Removing it is the cleaner HTML.
6. **Exclude state and reserved names.** `data-empty`, `data-unloaded` (loader) and `data-native-*` (editor runtime, e.g. `data-native-empty`) are reserved. Also exclude any name that the site's own JS sets: a cheap text search of the repo's `.js` for `setAttribute("data-x"`, `toggleAttribute("data-x"`, `removeAttribute("data-x"` or `dataset.x`. This catches `code-drawer`. An annotation overrides it either way.
7. **Combined compounds** add each value to its own axis and note `combinedWith` for both. Thumbnails or a later matrix view can use that, but no axis is created for a combination.
8. **Labels.** Humanise the value (`image-left` becomes "Image left"; `true` becomes "On") and the axis (`data-tone` becomes "Tone"), unless an annotation gives a label.

### Proposed annotation (optional, for ticket 07 to accept or change)

The selectors are the source of truth. A comment only adds labels, a default name or a description, and it can also mark a name as state (exclude) or force-include it. A suggested shape, read from any comment in the file:

```css
/* variant data-tone "Tone": light = Light (default), dark = Dark, brand = Brand colour */
/* state data-open */
```

Values in the comment but in no selector are shown with a "no styles" warning, not hidden. Values in selectors but not in the comment get humanised labels. A mismatch never breaks discovery. This mirrors Web Awesome's `@attr name=default description` without a manifest file. Because CSSOM drops comments, this is another reason to parse the source.

### Why not `@property`

`@property --tone { syntax: "light | dark"; initial-value: light; inherits: true }` gives values and a default. But it has no labels, it drives a custom property rather than an attribute (styles would then need container style queries), and registration is document-global. It is also reported as unreliable when declared inside shadow-root stylesheets. It does not fit "a component declares its own `data-*` attributes in its CSS".

## Edge cases

1. **Quoting and flags:** `[data-tone=dark]`, `'dark'`, `"dark"` and `"dark" i` are all value `dark`. Unescape CSS escapes. Keep the first authored spelling for writing.
2. **Name case:** HTML lowercases attribute names, so compare names in lowercase.
3. **Conditions:** a value seen only inside `@media`/`@container` (techies `data-reverse`) is still offered, with its condition shown ("wide screens only").
4. **Nesting under `:host`:** `:host { &[data-x] {} }` resolves to `:host[data-x]`, which never matches. Warn, as in step 2. `:host([data-x]) { h2 {} }` is fine and verified to get a correct twin.
5. **Descendant attributes** (`:host([a]) .y[data-z]`, `.marquee__list[data-faded]`) belong to inner elements. They are not component variants.
6. **Values on instances that the CSS doesn't know** (`<section-hero data-tone="purple">`): show the value as the current "Custom" option and never drop it silently.
7. **Same value under several rules** (base + `@media` + nested): one option, conditions merged.
8. **Only an absent-state rule** (`:host(:not([data-x]))` and nothing else): not offerable. Warn "no values".
9. **Default styled by a value rule only** (an author writes `:host([data-tone="light"])` with no base and no grouping): the absent attribute renders unstyled. Warn, or treat the first value as the default alias. Ticket 07 picks which.
10. **Template-internal `data-*`** (`<a class="btn" data-variant="secondary">` inside a template): not a host variant. It is a block/class variant (below).
11. **Twins:** run discovery on the source. Twins keep the `:host()` prefix, so twinned text would give the same axes without the comments.
12. **Many axes:** no cap is needed for discovery. The UI (07) decides how to show more than 2 or 3.
13. **Performance:** component CSS files are small. Parse on source change and cache by path + content hash. This runs on the main thread beside `composeStyles` (`native-preview.ts:296`) and in the Worker for MCP.
14. **Make component:** the new CSS has no variants (`component-model.ts:1167`). A `data-*` attribute on the original element styled by page CSS (`.hero[data-tone=dark]`) would stop matching after conversion. That belongs with ticket 04, but it is worth a warning there.
15. **Non-`data-` host attributes** (`:host([variant="brand"])`, Web Awesome style): ignored by the rule. Agents should be told to use `data-*` (ticket 05).
16. **Variants declared outside the component's CSS:**
    - (a) Page or site CSS styling the host from outside: `section-hero[data-tone="dark"] { … }` in `styles/site.css`.
    - (b) Site CSS with `:host([data-x])`, which the loader clones into **every** shadow root (`components.js:107`), so it applies to every component.
    - (c) Global bare attributes such as techies' `[data-color-scheme]`.

    The settled note says a component declares variants in its own CSS, so the base rule scans only `<tag>.css`. The same parser can scan site stylesheets with subject `<tag>[…]`, `:host(…)` or a bare `[…]` and tag the result `source: "site"`. Whether to offer those is for ticket 07 (tones) and ticket 08 (accessible tone text).

## How the techies-reviews patterns fit

- **`section-split` `data-reverse`:** discovered as a toggle "Reverse", default off, with the note "only on screens wider than 56rem".
- **`code-drawer` `data-open`/`data-dragging`/`data-resizing`:** excluded by the script-sets-it check (`scripts/prebuilt-code.js:78,91,149`). Without that check they would surface as toggles, which is the main false-positive risk.
- **`.btn[data-variant]` / `[data-size]`:** not component variants. The same rule with a **class subject** (a compound whose first simple selector is `.btn`, after resolving `&` in `@layer utilities`) gives `variant: secondary | ghost` and `size: small | large`, both defaulting to absent. That is the natural answer to the map's "Variants on builder blocks" for a Button block, if 07/10 want it. The parser is the same and only the subject changes.
- **`[data-color-scheme]`:** a global, site-level attribute (light | dark, default absent = follow the device). It works on any host or section today with no component CSS, so it is a strong candidate for the shared "tone" axis in tickets 07/08. The script's use of it on `<html>` is user state, but it applies to `:root` only, and site CSS separates the two (`:not(:root)` at `tokens.css:66`).

## Sources

- [Webflow: Component variants](https://help.webflow.com/hc/en-us/articles/51307110086547-Component-variants); [Webflow code components: Variant prop](https://developers.webflow.com/code-components/reference/prop-types/variant)
- [Figma: Explore component properties](https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties)
- [Framer Academy: Component variants](https://www.framer.com/academy/lessons/component-variants-in-framer); [Framer dictionary: Variant](https://www.framer.com/dictionary/variant)
- [Web Awesome: Button](https://webawesome.com/docs/components/button); [Custom Elements Manifest analyzer (`@attr` JSDoc)](https://custom-elements-manifest.open-wc.org/analyzer/getting-started/)
