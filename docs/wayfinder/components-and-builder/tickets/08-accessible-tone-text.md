---
title: Decide how tone variants keep text accessible
type: grilling (HITL)
status: closed
assignee: Lex + claude (grilling)
blocked_by: [07-variant-contract]
---

## Question

When a component offers colour variants (dark, light, accent, brand), how is text contrast against the brand colour guaranteed? Options: semantic tokens per tone (as in techies-reviews' `--semantic-*` `light-dark()` roles with contrast noted in comments), computed text colour (`contrast-color()`, OKLCH lightness flips) with a fallback, an editor check that warns when a tone fails WCAG AA (reusing MCP `inspect_preview`'s contrast code), or a combination. Ticket 07 offers global site attributes such as techies-reviews' `data-color-scheme` as a variant on every component, so a scheme-based tone is already selectable; decide whether `data-tone` builds on it. What does the starter ship for a site with one brand colour, and what happens when the user changes that colour?

## Resolution (2026-10-08)

Decided with Lex.

1. **One attribute: `data-tone`.** It colours a page band, and its tone rules live in one place in the site's shared CSS, so a tone means the same thing everywhere on the site. On techies-reviews, `data-color-scheme` stays only as the visitor's dark-mode toggle on `<html>`, and its sections move to `data-tone`. The name can change later; consistency is what matters.
2. **Tones go on page bands only.** The editor offers Tone on section components, plain `<section>`s, the header and the footer. It is not offered on cards, buttons or anything inside a band: they follow their band. There is no tone inside a toned section. The CSS stays a plain `[data-tone]` rule, so it works anywhere by hand. This narrows ticket 07's "global attributes are offered on every component" for tone.
3. **Everything inside a band adjusts automatically, and AA is guaranteed by construction, not warned about.** There is no edit-bar warning.
   - `light`/`dark` flip `color-scheme`, so the site's colour roles flip.
   - `brand`/`accent` set the surface from `--brand` with relative colour syntax. The surface's OKLCH lightness is **nudged out of the middle band** (at most 0.50 or at least 0.72), keeping the hue and chroma. A mid-tone brand therefore shows slightly lighter or darker on its band.
   - Text: `contrast-color(<surface>)` where supported (`@supports`). Elsewhere a computed near-white or near-black from the surface's lightness. On a nudged surface both choose the same side: at least about 5.7:1 for light text and about 7.9:1 for dark text.
   - Buttons inside a toned band invert: the fill is the text colour and the label is the surface colour. Links use the text colour, underlined.
   - Browsers without relative colour syntax (about 7%) get fixed fallback colours.
   - **Proof:** a unit test sweeps hue × lightness × chroma through the tone formulas and asserts at least 4.5:1 for text and at least 3:1 for button fills against the band.
4. **The starter ships four tones from one `--brand`:** `light` (default), `dark`, `brand` (the brand colour, nudged) and `accent` (a soft, high-lightness, low-chroma tint of the brand). Changing `--brand` recomputes every band with AA kept, and nothing else needs editing. Its hard-coded `color: #fff` on the accent goes.
5. **No brand-colour control** in this effort (see the map's Out of scope). The brand colour is edited in `tokens.css` in the code pane.

Facts this rests on (2026-10-08): `contrast-color()` is Baseline 2026 (Chrome 147, Firefox 146, Safari 26) and returns only black or white. Relative colour syntax is about 93% (Chrome 131, Firefox 133, Safari 18). Black or white against any background is at least 4.58:1 (WCAG 2).
