---
title: One visual page per build
type: task (AFK)
status: open
assignee: sf-23 (this session)
builder: claude
blocked_by: [21-kit-records-every-piece, 22-one-feedback-log]
---

## Goal

Lex sees one page per build in chat, at each milestone and at the end. Lex: **"visualize it in the best way possible so he understands more"**: teach, don't just list ([scoreboard resolution](../../tickets/04-grill-scoreboard.md#resolution-2026-10-22) items 2 and 4).

## Decided behaviour

- `kit score <map> --html [--out FILE]` writes one self-contained HTML file (inline CSS and SVG, no network, light and dark) in the main root `.scratch/scoreboard/<map>/page.html` and prints its path; the lead shows it with T3 `html_render`. Built with the `dataviz` skill (load it first) and `good-css`.
- What it shows, in this order, each with a one-sentence plain caption that says what to notice:
  1. **Where the build is:** pieces done / running / waiting on Lex; minutes per piece as a simple timeline.
  2. **What reviews caught:** findings per piece by kind (fault, ticket, race, style, unsorted), stacked, with declined ones shown lighter.
  3. **What Lex had to correct:** the feedback log's lines by kind (`too-much`, `below-bar`, `felt-wrong`, `fault`, `workflow`), each linked to its fix.
  4. **Ladder:** current rung (1 today) and "builds in a row without a UX correction: n of 5".
  5. **Builders:** per builder and kind of job, pieces, median minutes, rounds and findings per piece, cost where known; once a kind has about 10 pieces, a sentence saying which builder does it best and cheapest, marked "to bring to Lex" (never applied by the kit).
- Plain words only (no P-codes on the page; "serious / minor / style" instead). Fits a 390 px phone width without sideways scrolling.
- **Lex sees it before it lands:** the slice first runs with `--no-pr`; the lead renders the page from this build's real records (or the fixtures if there are none yet) and shows it to Lex with `html_render`. His changes go to the builder with `kit fix --note <file>`; then the lead reruns `kit slice` without `--no-pr` to land.
- `docs/agents/kitchen.md` station 10: the page is shown at each milestone and at the end; the planned mark goes.

## Files

- `scripts/agents/kit.d/score` (the `--html` part), `scripts/agents/score-page.mjs` (new; the page builder)
- `tests/kit-score.test.ts` (html cases), fixture data under `tests/fixtures/scoreboard/` (new)
- `docs/agents/agent-scripts.md` (`kit score` line), `docs/agents/kitchen.md` (station 10)

## Done when

- Tests prove the page renders from fixture records and a fixture feedback log: every section present, captions present, no external URLs, the ladder count matches the fixture, and the builder sentence appears only at 10 or more pieces of a kind.
- `kit shots`-style check of the page itself: open it at 390 and 1280 px in light and dark with a raw spec through `scripts/agents/kit shots --spec .scratch/score-page.spec.ts`; no layout findings; contact sheet path in the report.
- Lex has seen the sample (the lead notes the date in the ticket's Done).
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-sf23 -- scripts/agents/kit slice --ticket docs/wayfinder/software-factory/build/tickets/23-one-page-per-build.md --builder claude-opus-5-5 --no-pr`; `scripts/agents/kit wait job slice-sf23 --timeout 2h`; Lex's look; `scripts/agents/kit fix --note <his changes>` if any; the same `kit slice` command without `--no-pr` lands it.
- Report: unit `RESULT:` lines, page path, `kit shots` contact sheet and findings, Lex's comments on the sample, review decisions, PR and merge SHA.
