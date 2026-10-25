---
title: "Shared values from the editor Framework set"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [01-light-dark-theme]
---

## Goal

Give the editor spacing and a pill radius from a separate "editor" set of the techies.tools Framework, generated, committed and checked ([ticket 06](../../tickets/06-grill-shared-values.md#resolution-2026-10-25)); research: `git show origin/research/ac-01-techies-framework:docs/wayfinder/atomic-catalogue/research/01-techies-framework.md`.

## Decided behaviour

- The editor set uses the Framework's manual mode with the editor's sizes. The builder produces the export by running the Framework's own export code from `~/Projects/TechiesTools` in a script, as research 01 did, never by hand; the settings and the exported `tokens.css` are both committed so it can be re-run.
- A script builds the shared-values part of `src/theme.css` from the export, converting rem for the editor's 14 px root (the Framework assumes 16 px).
- Spacing steps 2, 4, 6, 8, 12, 16, 24 px and `--radius-full`; the 6 px radius and 11/12/13/15/20 px type stay editor steps; the stray 10 px gap snaps to 8 or 12 where touched.
- Colours stay as they are (they already match the Framework; dark keeps fixed lightness).
- A kit check fails when `theme.css`'s generated part and the committed export disagree.

## Files

Expected (confirm while designing): `src/tokens/framework-editor.settings.json` and `src/tokens/framework-editor.css` (new), `scripts/tokens-from-framework.mjs` (new), `src/theme.css` (a marked generated block), a kit check wired into `kit pr` (`scripts/agents/pr-tier.mjs` css tier), `docs/editor-colors.md`, tests for the generator.

## Done when

- Re-running the script on the committed settings reproduces `theme.css`'s generated block byte for byte; a hand edit to that block fails the kit check.
- New spacing and radius tokens exist; nothing in the editor changes look yet (`kit shots --compare dev`).
- `~/Projects/TechiesTools` is not modified.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit bg slice-ac-02 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-ac-02 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit shots --compare dev` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review against the [UX rulebook](../../../../agents/ux-rulebook.md).
- The one-offs count (slice 04, once landed) does not rise; quote its `RESULT:` line.
