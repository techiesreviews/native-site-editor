---
title: "Dark mode written with light-dark()"
type: task (AFK)
status: closed
assignee: fleet-lead
builder: claude
blocked_by: []
---

## Goal

Make light and dark side by side possible on the board, with nothing in the editor looking different ([board ticket 07, item 5](../../tickets/07-grill-board-look-and-use.md#resolution-2026-10-25)). The very first slice.

## Decided behaviour

- `:root` gets `color-scheme: light dark`; every themed colour is written once as `light-dark(<light>, <dark>)` instead of a `@media (prefers-color-scheme: dark)` block.
- Shadows that differ by theme keep their own values (`light-dark()` takes colours only).
- `src/theme.ts` keeps its `matchMedia` for Monaco.
- Research: `git show origin/research/ac-02-board-on-a-canvas:docs/wayfinder/atomic-catalogue/research/02-board-on-a-canvas.md`, "light and dark side by side".

## Files

- `src/theme.css` (dark block at about line 205), `src/components/structure-editing.css`, `src/page-builder/media-adding-summary.css`, `src/page-builder/media-picker.css` (the four files with `prefers-color-scheme: dark` today)
- `docs/editor-colors.md` (how to write a themed colour now)

## Done when

- No `prefers-color-scheme: dark` left in `src/**/*.css` (`grep` in Done).
- `kit shots --compare dev` shows no visible change in light or dark.
- A themed element under `color-scheme: dark` inside a light page shows dark colours (unit or spec).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-01 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-01 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots --compare dev` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review against the [UX rulebook](../../../../agents/ux-rulebook.md).
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.

## Done (2026-11-10)

- `src/theme.css`: `:root` has `color-scheme: light dark`, and every colour that differed by theme is written once as `light-dark(<light>, <dark>)`; the dark `@media` block is gone. `--pressed`, `--on-pressed` and `--surface-card` moved in with the rest.
- Shadows keep each theme's own values: `--structure-edit-drop` lists the light layers and the dark layers, each transparent in the other theme. The new `--shadow-light-only` is `--shadow` with a colour that goes transparent in dark; the media library and the Files adding summary use it in place of their dark `box-shadow: none`. `structure-editing.css` lost its dark block, which only re-set the same two variables.
- `vite.config.ts` (outside Files): the CSS minifier (Lightning CSS) rewrote every `light-dark()` into a `--lightningcss-light/dark` toggle with a `prefers-color-scheme: dark` block. That toggle ignores a part's inline `color-scheme` and pushed boot 90 bytes over budget. `css.lightningcss.exclude: Features.LightDark` keeps `light-dark()` as written. The editor's relative colours already need browsers that have it. Built `theme.css` is now 2.06 KB gzip against dev's 2.07, and the unused toggles beside `style.css`'s and `preview-visit.css`'s `color-scheme` are gone too.
- `src/theme.ts` keeps its `matchMedia` for Monaco.
- `docs/editor-colors.md`: a section on writing a themed colour (`light-dark()`, no media blocks, shadows, a part's own `color-scheme`).
- New spec `tests/native-save/native-theme-scheme.spec.ts`: in a light page, a box with `color-scheme: dark` resolves 15 tokens to the same colours as the whole editor in dark, and the reverse; the light-only shadow goes transparent in dark. It fails on dev's `theme.css` and passes on the dev server and on the production build (`ASE_NATIVE_SAVE_DIST=1`).
- No visible change: every colour token in `theme.css` resolves to the same value as dev's in light and dark (123 colour tokens compared in Chromium 153). `kit shots editor media-gallery structure files --compare dev --width 390,1280`, both themes: the pairs are pixel-identical except a few that differ by load timing (the header and footer parts' chevrons not loaded yet, the code pane scrolled to another line). Which pairs differ changes between runs; no colour differs.
- `grep -rn "prefers-color-scheme: dark" src --include=*.css`: no matches.
- Feature list: no change (the editor looks the same; this makes light and dark side by side possible for the board).
- Checks: `RESULT: ok doctor 11/11 checks passed`; `RESULT: ok unit none affected`; `RESULT: ok specs 2/2 passed` (native-theme-scheme, native-editor-features); `RESULT: ok specs 1/1 passed` (native-theme-scheme on the build); `RESULT: ok specs 18/18 passed` (`kit specs --affected`); `RESULT: ok size boot 355 KB (±0 KB) vs dev@465a288, budget 355 KB`; `npm run check` and `npm run lint` exit 0. The one-offs count (slice 04) has not landed, so there is no RESULT line for it.
