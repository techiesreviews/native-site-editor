---
title: Touch, disabled and dark-mode fixes
type: task (AFK)
status: open
assignee: claude (mm-106 runner)
blocked_by: [89-ux-ui-audit]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#c3-touch-hover-disabled-look-and-dark-mode-contrast), finding C3. Load the good-css skill.

- Every `:hover` rule in `src/style.css`, `image-popup.css`, `image-large-editor.css`, `media-adding-settings.css` and `media-picker.css` that is not yet inside `@media (hover: hover) and (pointer: fine)` moves inside it; every pressable gets an `:active` state. No grey patch stays where a tap landed (A-13, A-20, A-23, A-25, B-25 at 390).
- Disabled buttons use `--surface-subtle` with `--muted` text and no fill colour, instead of `opacity: 0.5` (`src/style.css:35`), so a disabled primary no longer looks like a pale primary.
- One `--link` token per theme with at least 4.5:1 contrast on the panel surface, used by usage page names, "Choose favicon…" and the usage popup's links.
- Pictures with transparency get a **light** checkerboard backing in both themes, with its own colours (8 px squares of `oklch(97% 0 none)` and `oklch(90% 0 none)`; the dark theme's surface tokens are 18–22 % lightness, `src/theme.css:147-149`), in tiles, details previews and the picker.
- Cards in dark mode are one step lighter than the panel (`color-mix(in oklch, var(--panel-surface), white 6%)`), matching light mode's depth (selection bar, tray, Improve rows).

## Done when

- A spec emulating touch taps a menu item and checks that the control under it has no hover background.
- Contrast check (axe or computed colours) for links and disabled buttons in both themes.
- Dark-theme shots of the starter's dark-lettered transparent logo (larkspur-logo.png) in a tile, details and the picker show it readable.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
