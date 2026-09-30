# Editor colors

Set the editor's brand color in `src/theme.css`:

```css
:root {
  --color-primary: oklch(54.6% 0.215 262.9);
}
```

The six `--color-primary-lightest` through `--color-primary-darkest` shades reference this variable. Their lightness follows Lex's supplied scale; chroma is proportional to the base, and the light shades retain its small hue offsets. The default base reproduces the supplied palette. Changing the base hue rotates the entire family; changing its chroma changes the saturation of that family. Shade lightness stays fixed to preserve the intended surface hierarchy.

`--semantic-*` tokens assign these colors to surfaces, text, actions, selection, focus and shadows. Components use compatibility aliases such as `--surface`, `--muted` and `--selected`, so they all resolve through the same palette. Override a semantic token when a particular role needs a different color. Action lightness and chroma are bounded for readable button labels, so the action color may be darker than the raw primary.

## One look across the chrome

`src/theme.css` also holds the tokens every component uses, so the editor's popovers, rows and controls match:

- **States.** A grey `--hover` on every row and transparent button; what is open, current or chosen in a list in the `--current` tint (with 600 weight); a pressed toggle (Bold, Italic, History, an open address, Ask agent) solid in `--pressed`. `--selected` stays opaque for Monaco and the code highlights. Keyboard focus is `--focus-ring` (2px), inset by 2px on rows and menu items, 2px outside a standalone button, and on the border of an input.
- **Panels.** Menus, flyouts, the edit bar and its popovers, the insert picker and a request's card sit on `--panel-surface` with `--radius-panel` and `--shadow`; menus pad 6px (`--panel-padding`), panels with a title or text 12px. Dialogs are `--surface` with a border and `--radius-dialog`.
- **Type.** `--type-small` 12px (hints, meta, URLs, section headings), `--type-base` 13px (rows, menu items, buttons, inputs), `--type-title` 15px (panel and dialog titles); `--type-badge` 11px only for a letter or number in a badge. Weights are 400, 600 and 700 (counts, initials, Bold). Section headings are 12px, 600, uppercase, 0.04em.
- **Sizes.** `--size-icon` 24px (icon buttons; WCAG 2.2's target minimum), `--size-compact` 28px (inputs and buttons inside a row, edit-bar buttons), `--size-control` 32px (rows, fields and buttons in panels). Rows stand 2px apart. Corners are `--radius-small` 4px (badges), `--radius` 6px (controls, rows), `--radius-panel` 8px, `--radius-dialog` 12px.
- **Status.** `--danger-bg`, `--danger-fg` and `--danger` are the success tokens turned to red hue, for failures and removed lines.

WCAG sets no minimum text size. It asks for 4.5:1 text contrast and 3:1 for focus indicators. `--text`, `--muted` and `--link` stay above 5:1 on panels and the sidebar under `--hover` and `--current` in both schemes, and the focus ring above 3.5:1.

Dark mode changes semantic roles, retaining the same base palette. Warning and success have separate central base tokens (`--color-warning` and `--color-success`) so changing the brand does not change their meanings. Syntax highlighting and code diagnostics retain Monaco's language/status colors.

Monaco requires sRGB hex values. `src/theme.ts` resolves CSS colors through the browser and updates Monaco when root overrides, stylesheets or system light/dark preferences change. The preview receives only the editor's selection-outline color; the connected website's own framework, source and page colors are unchanged. Rebuild the connected project's preview integration to receive the themed outline.

Browser tests verify light/dark surface distinction, text and focus contrast, live primary changes, draft preservation, and preview isolation. Custom semantic overrides still need their own contrast check. Relative colors use the [CSS Color 5 relative OKLCH syntax](https://www.w3.org/TR/css-color-5/#relative-OKLCH).

The app imports this palette after `src/style.css`, which no longer carries colours of its own. The frozen A prototype continues to load its recorded styles independently; its reference files and screenshots are not rewritten to accept the new app palette.
