---
title: One visual page per build
type: task (AFK)
status: closed
assignee: sf-23
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

## Done (2026-10-25)

- `kit score <map> --html [--out FILE]` writes one self-contained HTML page (inline CSS and SVG, no network, light and dark) to the main root `.scratch/scoreboard/<map>/page.html` (or FILE) and prints `page: <path>` (stderr with `--json`). `--html` without a map, or `--out` without `--html`, exits 2; a map with no `docs/wayfinder/<map>` folder exits 1 and writes no page, like `--snapshot`. The page builder is `scripts/agents/score-page.mjs`; colours come from the validated dataviz palette (kinds of finding: categorical slots 1–4 plus gray; phases: one-hue blue ramp).
- Sections in order, each with a one-sentence caption that changes with the data: **Where the build is** (done / running / waiting on Lex / not started tiles; done = merged, or a closed build ticket (with or without a record, since a queued merge may never record its SHA); a `wontfix` build ticket is no piece, and its record is left out of every section and the header count; waiting on Lex = ticket `ready-for-human` or `needs-info`; time per piece split into building, review, fixing, landing); **What reviews caught** (findings per piece by kind over every review round, declined ones lighter and counted only under a kind the review recorded, serious / minor / style instead of P-codes, a tie for the most common kind naming both); **What Lex had to correct** (feedback log lines by kind as a share of all, each with its fix: ticket number, title and state for a build or map (`../tickets/`) ticket, PR, or "No fix yet"; a line of an unknown kind is left out and the caption says lines were left out); **Ladder** (rung 1–4, and finished builds in a row without a UX correction out of 5; a finished build is a map with a committed `build/scoreboard.json`, oldest first by last merge; `too-much`, `below-bar` and `felt-wrong` are UX corrections; up a rung after 5, down one for a UX problem found after release; a finished build whose log could not be read is left out, not counted as clean, and the caption says how many); **Builders** (per kind of job and builder: pieces, median minutes, rounds and findings per piece, build cost per piece, shown `>=$` when any piece is unpriced or partial; at 10 or more pieces of a kind a "To bring to Lex" sentence names the best builder, fewest findings, and the cheapest, lowest dollars among builders with full prices; never applied). Charts have a "Show the numbers as a table" view.
- Tests (`tests/kit-score.test.ts`, four cases):
  - The page from `tests/fixtures/scoreboard/` (6 records, 11 build tickets and a map ticket, a 6-line feedback log with one line of an unknown kind, and 5 finished builds whose time order differs from their names, one with a log that lost its heading): all five sections in order with captions; no URLs, `src`, `href` or `@import`; no P-codes; feedback text and ticket titles escaped; tiles done 4 / running 1 / waiting on Lex 2 / not started 2 (a closed piece with only a queued merge is done, `needs-info` waits on Lex, `wontfix` tickets with and without a record are left out); the dropped record (an hour of building and a fault) missing from the header ("5 pieces recorded"), the timeline, the reviews and the builders (`task (AFK) S` reads 2 pieces), so the longest piece is still "Trim the toolbar"; the review caption with a tie and one declined finding (a declined finding with no recorded kind is left out); fix text with build and map ticket titles; correction bars at one fifth each, the unknown-kind line left out and the caption saying so; the ladder at 3 of 5 with the unreadable finished log not counted; no builder advice. Then: a current log without its heading gives "Lex has not corrected anything in this build yet (lines of the log that could not be read are left out)."; `--out` and `--json`; bad option combinations exit 2; a mistyped map exits 1 with no page.
  - `--html --snapshot`: both files written, each with its own content, and the page counting the snapshot as a finished build.
  - `scorePage` directly: advice at 10 pieces of a kind but not at 9 (best and cheapest apart and the same builder; a partial price shows `>=$0.50` and is never the cheapest); the ladder moving up after 5 clean builds, down after a UX problem found after release, and skipping an unreadable log.
- Page check: `scripts/agents/kit shots --spec .scratch/score-page.spec.ts` opened the fixture page and the real software-factory page at 390 and 1280 px in light and dark, with tables open: `RESULT: ok shots raw spec`, 0 layout findings, no sideways scrolling; contact sheets `/home/ubulex/Projects/native-site-editor/.scratch/shots/sf-23/20261025-124441/contact-1.webp` and `contact-2.webp`.
- Validation: `RESULT: ok unit 79/79 (2 files)` from `scripts/agents/kit unit --affected`; `npm run lint` and `npm run check` exit 0.
- Lex has seen the sample (2026-10-26): the real `clean-up-before-features` page, shown in chat. Asked whether it helps him understand a build, he chose **"More visual"** (more pictures and charts, less text to read); no further notes. Follow-up: [24 The build page, more visual](24-build-page-more-visual.md).
- Docs: the `kit score` line in `docs/agents/agent-scripts.md`; `docs/agents/kitchen.md` station 10 shows the page at each milestone and at the end in place of the planned mark.

### Follow-ups

- Spec (P3): 227833ca7:scripts/agents/score-page.mjs:67 — P3 ticket: the comment at lines 59–61 says "Only the build's own tickets are pieces", but `pieceStates` turns every
- Spec (P3): 227833ca7:scripts/agents/kit.d/score:167 — P3 ticket: with a `wontfix` record, the RESULT line says `score demo 6 pieces` while the page header says "5 pieces r
- Standards (P3): 227833ca7:scripts/agents/kit.d/score:100 — P3 fault: `catch { /* No corrections recorded. */ }` treats every read error as "no log". A finished build's `feedbac
- Standards (P3): 227833ca7:scripts/agents/score-page.mjs:96 — P3 fault: `if (!text) return { entries: [], unreadable: false }` makes a zero-byte `feedback.md` count as clean on 
- Validation gaps (gap): No test for a finished build that has a `scoreboard.json` but no `feedback.md`, or an empty one. Add an `fs` fixture map `foxtrot` with only `build/scoreboard.j
- Validation gaps (gap): No test for a record whose slug matches no build ticket. Add `records/99-stray.json` to a copy of the fixture and assert what the tiles and the "N of M pieces d
- Validation gaps (gap): The where caption's choice of most-used phase only covers "building". Add a `scorePage` case where review or fix minutes are largest and assert "most of it revi

