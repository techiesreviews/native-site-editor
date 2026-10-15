---
title: Touch, disabled and dark-mode fixes
type: task (AFK)
status: closed
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

## Done (2026-10-15)

**Behaviour.** A tap no longer leaves a grey patch: every `:hover` rule in `src/style.css`, `image-popup.css`, `image-large-editor.css`, `media-adding-settings.css`, `media-picker.css`, `media-adding-summary.css` and `media-clean-up-review.css` now sits behind `@media (hover: hover) and (pointer: fine)` in its original place (so the cascade order is unchanged), with an `:active` twin for the press. Disabled filled buttons (`.primary`, `.secondary`, `.button`, the popup's and large editor's main buttons, and filled buttons in Media while a change runs) use `--surface-subtle` with `--muted` words at full opacity. Bare icon and text buttons keep their fade, because `.icon-button` already rests at `--muted` and would otherwise look enabled. The dark `--link` is now a clear blue (`oklch(from primary 80% min(c, 0.12) h)`). The light one already reached 4.5:1. A new `--surface-card` token (light: `--surface`; dark: the panel plus 6 % white) is used by the adding tray, selection bar, Improve rows, Clean up notice and details' facts and usage boxes. `media-transparency.ts` (lazy media chunk) samples a loaded PNG/WebP/GIF/AVIF/SVG at 32 px and marks see-through pictures with `data-transparent`. Tiles, pending tiles, details previews and the picker's chosen thumbnail then show them on a light checkerboard (8 px squares of 97 % and 90 % lightness, both themes).

**Commits.** 2cf62d63 claim, 41fb58ec build, 435475e2 review fixes, 2757b924 tests (after rebase on 36a06637).

**Tests.** Unit `tests/media-transparency.test.ts` (2). Browser `tests/native-save/native-media-touch-contrast.spec.ts` (7):
- On a touch screen a tapped menu item, a tapped choice and a tapped tile circle leave no hover grey. This fails on the old CSS with `oklch(0.153 0.06 262.9 / 0.09)` left on the tapped choice.
- With no hover possible, a press on the popup's footer buttons paints and clears.
- A mouse still lights rows. Disabled buttons are plain at 4.5:1 or more in both themes.
- Usage page names (details and popup) and "Choose favicon…" reach 4.5:1 in both themes.
- A see-through PNG added through Media, or inside the picker, is on the checkerboard in its tile, details and the picker; opaque pictures and JPEGs are not.

The spec passed 21/21 with `--repeat-each=3`. `npm run check`, `npm run lint`, unit (3441 pass), and 15 touched specs (182 pass: media screen/tab/adding/pane/picker/library/keys/collections/video/cleanup, improve images, image popup, site settings, social image) all pass. Byte budget: 347 KB before and after (boot CSS +0.13 KB gzip, boot JS +0.01 KB).

**Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-106/{before,after}/` hold 13 screens × 390/768/1280 × light/dark (78 each) on the starter seeded with a dark-lettered transparent `larkspur-logo.png`: gallery, Adding settings, Clean up, Improve, selection, usage popup, details (logo and usage), adding tray, image popup, large editor, Site settings, picker.

**Review** (GPT-6.1 Sol, read-only; evidence in `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-106/`):
- First review: 2 findings, both fixed. The picker's chosen-file thumbnail was not marked; "Open large editor" had no press state. Its validation gaps (real-path transparency, usage popup links, press feedback) were added as tests.
- Re-review: no defects. Its remaining gaps were closed: a press test where hover cannot apply, a picker upload thumbnail test, and popup, large editor and tray shots.
- Rejected: none. Sol accepted the four author choices (filled-only disabled look, 32 px sampling, root `--surface-card`, retuned `--link`).

**Follow-ups (not in this slice).**
- The image popup and large editor still show a see-through logo on a dark well (shot 13 dark). They could reuse `markTransparency` and the checkerboard.
- At 390 a tapped tile circle shows its soft focus backing (`.media-library__select:has(:focus-visible)`) in Chromium's touch emulation. It is not a hover rule; check on a real phone before changing it.
- `site-settings.css` and other component files outside media still have bare `:hover` rules.
