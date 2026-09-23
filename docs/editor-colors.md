# Editor colors

Set the editor's brand color in `src/theme.css`:

```css
:root {
  --color-primary: oklch(54.6% 0.215 262.9);
}
```

The six `--color-primary-lightest` through `--color-primary-darkest` shades reference this variable. Their lightness follows Lex's supplied scale; chroma is proportional to the base, and the light shades retain its small hue offsets. The default base reproduces the supplied palette. Changing the base hue rotates the entire family; changing its chroma changes the saturation of that family. Shade lightness stays fixed to preserve the intended surface hierarchy.

`--semantic-*` tokens assign these colors to surfaces, text, actions, selection, focus and shadows. Components use compatibility aliases such as `--surface`, `--muted` and `--selected`, so they all resolve through the same palette. Override a semantic token when a particular role needs a different color. Action lightness and chroma are bounded for readable button labels, so the action color may be darker than the raw primary.

Dark mode changes semantic roles, retaining the same base palette. Warning and success have separate central base tokens (`--color-warning` and `--color-success`) so changing the brand does not change their meanings. Syntax highlighting and code diagnostics retain Monaco's language/status colors.

Monaco requires sRGB hex values. `src/theme.ts` resolves CSS colors through the browser and updates Monaco when root overrides, stylesheets or system light/dark preferences change. The preview receives only the editor's selection-outline color; the connected website's own framework, source and page colors are unchanged. Rebuild the connected project's preview integration to receive the themed outline.

Browser tests verify light/dark surface distinction, text and focus contrast, live primary changes, draft preservation, and preview isolation. Custom semantic overrides still need their own contrast check. Relative colors use the [CSS Color 5 relative OKLCH syntax](https://www.w3.org/TR/css-color-5/#relative-OKLCH).

The app imports this palette after `src/style.css`. The frozen A prototype continues to load its recorded styles independently; its reference files and screenshots are not rewritten to accept the new app palette.
