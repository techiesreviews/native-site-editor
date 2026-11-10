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

## Motion, layers and elevation

`src/theme.css` also names the other shared values. They are tokens only for now; components switch to them as the replacement slices land, and nothing looks different yet.

- **Motion.** Durations `--dur-hover` 120ms (a tint), `--dur-press` 150ms, `--dur-tooltip` 180ms, `--dur-menu` 200ms (menus and popovers), `--dur-sheet` 300ms and `--dur-fly` 600ms. `--ease-out` is the browser's own `ease-out` curve (`cubic-bezier(0, 0, 0.58, 1)`), so the three places that already wrote `var(--ease-out, ease-out)` keep their look (the plain `ease-out` keyword is what every transition uses today); `--ease-out-strong` (`cubic-bezier(0.23, 1, 0.32, 1)`) is the steeper curve the board's parts use. Move only `transform`, `opacity` and colours, and switch the motion off under `prefers-reduced-motion`.
- **Layers.** `--layer-raised` 1 (inside one part), `--layer-canvas` 20, `--layer-pins` 25, `--layer-bar` 30, `--layer-popover` 40, `--layer-dialog` 90, `--layer-tooltip` 95, `--layer-wizard` 1000, `--layer-drag` 1050, `--layer-celebration` 1100 and `--layer-note` 10000 (the refusal note). `tests/theme-tokens.test.ts` keeps the steps in this order. Where a raw `z-index` moves when its part is replaced:
  - 1 to 6, -1 and -2: stay local numbers inside their part, or `--layer-raised`.
  - 19, 20 and 21 (the page builder's canvas layer, carets, the insert layer, the card-grid controls) to `--layer-canvas`; they now share a step, so the DOM order decides between them.
  - 25 and 26 (the agent pins and their tray) to `--layer-pins`; the tray now shares the step.
  - 29 (the flashing canvas layer) to `--layer-pins`: it moves below the bar, as before, and now shares a step with the pins.
  - 30 (the edit bar, the collapsed code split) to `--layer-bar`.
  - 31 and 32 (the bar's popovers and note, the pin card, the card-link picker and card looks, the insert layer with an occluded focus) and 40 (the row menu, the add panel) to `--layer-popover`; they now share a step, all still above the bar and below dialogs.
  - 90 (the image popup) to `--layer-dialog`; 95 (the block rail's tooltip) to `--layer-tooltip`, still above the dialog.
  - 1000 (the setup wizard) to `--layer-wizard` and 1000 (the add panel's drag ghost) to `--layer-drag`; the ghost now sits above the wizard, so a drag is never hidden. 1100 to `--layer-celebration` and 10000 to `--layer-note`.
  - The preview runtime's 2147483646 and 2147483647 live inside the page being edited and stay as they are.
  Moves that merge steps change which of two parts wins where they overlap; check the screen when a part moves.
- **Elevation.** Four steps. Step 1 is the existing `--shadow-small` (a pin or round button), step 2 `--elevation-2` (a small card), step 3 the existing `--shadow` (a floating panel) and step 4 `--elevation-4` (a dialog). There is no `--elevation-1` or `--elevation-3`; the two existing names keep working. All use `--semantic-shadow`, so they follow light and dark.

`npm run check` also runs `scripts/check-css-vars.mjs`: every `var(--name)` in `src/**/*.css` must name a property that some stylesheet declares, that a script sets (`style.setProperty("--name", …)`, or a template such as `--agent${part}`), or that is listed in the script's open hooks with a reason. A fallback does not excuse a name defined nowhere, which is how `--ease-out` went unnoticed.

## Writing a themed colour

`:root` has `color-scheme: light dark`. Write a colour that differs between light and dark once, with both values side by side, in `src/theme.css`:

```css
:root {
  --semantic-text: light-dark(var(--color-primary-darkest), var(--color-primary-lighter));
}
```

Do not add a `@media (prefers-color-scheme: dark)` block. `light-dark()` picks its value from the `color-scheme` of the element that uses the colour, so a part set to `color-scheme: dark` (a board tile, a preview of the dark theme) shows the dark palette inside a light page, and `color-scheme: light` the light palette inside a dark one. A component adds no colour rules for dark mode; it uses the tokens.

`light-dark()` takes colours only. A shadow whose offsets differ by theme lists each theme's layers and makes the other theme's layers transparent (`--structure-edit-drop`); a shadow only one theme shows makes its colour transparent in the other (`--shadow-light-only`, the media library's sheets). Other values that must change by theme have no tool yet; ask before adding one.

Dark mode changes semantic roles, retaining the same base palette. Warning and success have separate central base tokens (`--color-warning` and `--color-success`) so changing the brand does not change their meanings. Syntax highlighting and code diagnostics retain Monaco's language/status colors.

Monaco requires sRGB hex values. `src/theme.ts` resolves CSS colors through the browser and updates Monaco when root overrides, stylesheets or system light/dark preferences change. Monaco follows the system setting (`matchMedia` in `src/theme.ts`), not a part's own `color-scheme`. The preview receives only the editor's selection-outline color; the connected website's own framework, source and page colors are unchanged. Rebuild the connected project's preview integration to receive the themed outline.

Browser tests verify light/dark surface distinction, a part's own `color-scheme` choosing its palette (`tests/native-save/native-theme-scheme.spec.ts`), text and focus contrast, live primary changes, draft preservation, and preview isolation. Custom semantic overrides still need their own contrast check. Relative colors use the [CSS Color 5 relative OKLCH syntax](https://www.w3.org/TR/css-color-5/#relative-OKLCH).

The app imports this palette after `src/style.css`, which no longer carries colours of its own. The frozen A prototype continues to load its recorded styles independently; its reference files and screenshots are not rewritten to accept the new app palette.

## Shared spacing and the pill corner

The editor's spacing steps and `--radius-full` come from a separate "editor" set of the techies.tools Framework (manual mode, fixed sizes), not from hand-written values. The top of `src/theme.css` holds a generated block between two `/* ---- generated ... ---- */` markers: `--space-4xs` to `--space-l` (2, 4, 6, 8, 12, 16 and 24px) and `--radius-full` (999px). Do not edit it by hand. The 6px `--radius`, the 11/12/13/15/20px type sizes and all colours stay editor-owned steps in the hand-written part.

- `src/tokens/framework-editor.settings.json` holds the set's settings (names and sizes in rem at the Framework's 16px).
- `src/tokens/framework-editor.css` is the Framework's own `tokens.css` export of those settings.
- `scripts/tokens-from-framework.mjs` has three commands. `export` runs the Framework's compiler from `~/Projects/TechiesTools` (or `FRAMEWORK_DIR`; read only) on the settings and writes the export. `build` rewrites the generated block from the export, converting the Framework's 16px rem to pixels (so the editor's 14px root does not change them), and fails on a fluid or non-rem value. `check` (the default) fails when the block and the export disagree, or when a name from the block is declared again elsewhere in `theme.css`.
- To change a step: edit the settings, then run `export` and `build`, and commit all three files. `check` runs in `npm run check` and in `kit pr`'s css tier (`checks.css` in `scripts/agents/kit.json`), so a hand edit of the block fails. It reads only files in this repo, so CI and self-hosted copies can run it.
- The export's header records the Framework version and content hash. The hash is in the block's first comment line, so a re-export shows in review.
