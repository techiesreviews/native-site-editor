---
title: Decide the variant contract
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [06-research-variant-discovery]
---

## Question

Using ticket 06's detection rule: what is the contract a component author (person or agent) follows to declare a variant (attribute naming, values, the default, labels)? Where does the user pick a variant (edit bar, Structure instance fields, both) and how are the choices shown (segmented control, select, live thumbnails)? Is there a recommended but optional shared vocabulary, such as `data-layout` (content-left / image-left / centered) and `data-tone` (light / dark / accent / brand), that the starter and Make component suggest, even though components may declare anything?

## Resolution (2026-10-08)

Decided with Lex. Detection follows ticket 06's research, widened as below.

1. **What a variant is.** A `data-*` attribute on a component's host that some CSS rule styles. Leaving the attribute off gives the default look, and choosing the default in the editor removes it. A variant styled only by presence (`[data-reverse]`), or by `true`/`false`, is a yes/no variant, written as a bare `data-x`. Only `=` values are offered; other operators are skipped. A value on a page that no rule knows shows as "Custom" and is never dropped.
2. **Where variants are read from: every place that can style the host.**
   - The component's own CSS: `:host([data-x="v"])`, also inside at-rules and nested. Both nested forms count: rules nested under `:host([data-x="v"]) { h2 { … } }` and `h2 { :host([data-x="v"]) & { … } }`.
   - The site's shared CSS: rules that name the tag (`section-hero[data-x="v"]`, and nested `section-hero { &[data-x="v"] { … } }`) count for that component. `:host([data-x="v"])` in a site stylesheet reaches every component through the loader, so every component offers it.
   - Global attributes in site CSS (`[data-color-scheme="dark"]`) are offered on every component.
   - Values for the same attribute from several places merge into one list.
3. **The broken form.** `:host { &[data-x] }` (or `:host[data-x]`) never matches in browsers. It is not offered. The code pane warns and shows the fix `:host([data-x]) { … }`. The editor also warns when a component has no default look (only value rules).
4. **No annotation comments.** Nothing editor-only goes into the site's code, so leaving the editor needs no clean-up. Labels come from the value made readable (`image-left` reads "Image left", `data-tone` reads "Tone"). Attributes the site's own scripts set (`setAttribute`, `toggleAttribute`, `dataset`) are left out, **but only when found in a component's own CSS** (the code drawer's `data-open`). Site-wide and global attributes are always offered, so `data-color-scheme` stays even though `color-scheme.js` sets it on `<html>`. Excluded always: `data-empty`, `data-unloaded`, `data-native-*`.
5. **Where the user picks.**
   - **Edit bar:** a dropdown per variant and a checkbox per yes/no variant, reusing the bar's existing select and checkbox controls. With more than two variants, they sit behind one "Variants" button. A variant that only applies inside a media or container query says so ("wide screens only").
   - **Code pane:** inside `<section-hero ` the HTML pane suggests the variant attributes; after `data-tone="` it suggests the values and says what the absent attribute gives. Hovering a variant attribute lists its values. An unknown value gets a soft warning. Nothing is suggested in CSS files.
   - The Structure panel keeps its raw attribute list, with no typed variant rows. There are no thumbnails.
6. **Suggested shared names (not enforced):** `data-layout` (`content-left`, `image-left`, `centered`) and `data-tone` (`light`, `dark`, `accent`, `brand`). The starter, Make component and the agent guide use them. Components may declare anything else.

For building: the detection is one pure function in `shared/` over CSS source (ticket 06), run on the component CSS and on the site stylesheets. The edit bar, the code pane suggestions and MCP all use it.
