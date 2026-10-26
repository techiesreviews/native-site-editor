---
title: The build page, more visual
type: task (AFK)
status: ready-for-agent
assignee:
builder: claude
blocked_by: [23-one-page-per-build]
---

## Goal

Lex saw the first real build page (`kit score clean-up-before-features --html`, slice 23) on 2026-10-26. Asked whether it helps him understand a build, he chose **"More visual": more pictures and charts, less text to read**. He gave no further notes. Make the same page show more and say less, so he can read a build at a glance.

## Decided behaviour

- Same five sections, same order, same data and same command (`kit score <map> --html [--out FILE]`); only the way they are shown changes. Built with the `dataviz` skill (load it first) and `good-css`; still self-contained (inline CSS and SVG, no network), light and dark, fits 390 px without sideways scrolling.
- Less reading: each caption is one short line (about 12 words at most); long piece titles are shortened on the chart (full title on hover and in the table); detail lines under bars ("2 minor · 6 style · 3 fix rounds") become small marks or move into the table.
- More picture:
  1. **Where the build is:** the done / running / waiting on Lex / not started tiles become one picture of the whole build (for example a progress bar or a grid of dots, one per piece, coloured by state), with the count beside it.
  2. **What reviews caught:** a glance-first chart (for example one stacked bar for the whole build by kind, then per piece), serious ones marked so they stand out.
  3. **What Lex had to correct:** the list of his lines becomes a compact visual (for example one mark per correction, grouped by kind, filled when fixed and hollow when not), with the words a tap or hover away; "4 still have no fix" is visible without reading.
  4. **Ladder:** the rungs become a picture of steps with the current one marked, the 5-dot streak kept.
  5. **Builders:** numbers become small bars or icons so the builders compare at a glance (still only one builder today).
- "Show the numbers as a table" stays under every chart, for the exact figures.
- Plain words only, no P-codes, as in slice 23.
- **Lex sees it before it lands:** run with `--no-pr`; the lead renders the page from real records (`clean-up-before-features`) with `html_render` and asks Lex whether it is visual enough. His changes go to the builder with `kit fix --note <file>`; then rerun without `--no-pr` to land.

## Files

- `scripts/agents/score-page.mjs` (the page builder)
- `tests/kit-score.test.ts` (update html cases), fixtures under `tests/fixtures/scoreboard/` if needed

## Done when

- The slice 23 tests still hold (every section present, captions present, no external URLs, ladder count, builder sentence only at 10+ pieces of a kind), updated where the markup changes; a new check that each caption is short.
- `scripts/agents/kit shots --spec .scratch/score-page.spec.ts`: the fixture page and the real `clean-up-before-features` page at 390 and 1280 px in light and dark; no layout findings; contact sheet path in the report.
- Lex has seen the new sample (the lead notes the date and his words in Done).
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf24 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/24-build-page-more-visual.md --builder claude-opus-5-5 --no-pr`; `scripts/agents/kit wait job slice-sf24 --timeout 2h`; Lex's look; `scripts/agents/kit fix --note <his changes>` if any; the same `kit slice` command without `--no-pr` lands it.
- Report: unit `RESULT:` lines, page path, `kit shots` contact sheet and findings, Lex's comments on the sample, review decisions, PR and merge SHA.
