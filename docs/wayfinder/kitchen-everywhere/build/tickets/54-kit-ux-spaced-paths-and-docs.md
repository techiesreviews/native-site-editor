---
title: "`kit ux` keeps colour findings in paths with spaces, and its docs say the CSS-first rule (second look on 48)"
type: task (AFK)
status: closed
assignee: ke-54
builder: claude
blocked_by: [48-kit-ux-land-branch-and-colour-setting]
---

## Goal

The OpenCode second look on [ticket 48](48-kit-ux-land-branch-and-colour-setting.md#done-2026-10-27) (evidence `.scratch/reviews/unknown/20261027T204529Z` in the main checkout) found:

1. **A colour finding in a path with a space or parentheses is lost** (P2 fault): `colourFindings` matches `^([^\s:()]+):(\d+)` (`scripts/agents/kit.d/ux:459`), so `src/my file.css:1: #fff` is not a located line. Beside other located lines it vanishes without a count; alone it becomes the generic `<command> exited <n>` finding. The subject tokenizer (`:464`) splits on spaces and parentheses too, so a non-CSS line naming such a file falls back to its own file. Ticket 48's Done leaves spaced paths for later, but no follow-up was filed.
2. **The docs still give the old file rule** (P2, also the PR review's follow-up): `docs/agents/agent-scripts.md:112` says a finding's file is "the first project file the text names … else the line's own file", but since the round-3 fix a CSS line always counts for its own file and only other lines (an allow list's stale entry) look for a named file. Ticket 48's Done line 46 repeats the old rule (P3).
3. **Gaps** (same look): no test for a missing `scripts/agents/kit.json`, a broken one with an explicit `--base`, untracked files in `known` (`kit.d/ux:559`), or a passing `checks.css` run printing `colours: <command>: ok` in stdout and the bundle.

## Decided behaviour

- A located line is read up to the first `:<digits>:` (or `:<digits>:<digits>:`) after a path that is not a stack frame (`at …`, `node:`), so spaces and parentheses inside the path are kept; a line whose path is not inside the project stays unlocated as now.
- A non-CSS line's subject is the first `known` file whose path appears in its text as a substring at a word boundary, longest first, instead of a token split.
- `docs/agents/agent-scripts.md` states the CSS-first rule; ticket 48's Done line 46 gets a "(changed in round 3, see below)" note, not a rewrite.

## Files

- `scripts/agents/kit.d/ux`
- `tests/kit-ux.test.ts`
- `docs/agents/agent-scripts.md` (the `kit ux` colour lines)
- `docs/wayfinder/kitchen-everywhere/build/tickets/48-kit-ux-land-branch-and-colour-setting.md` (Done line 46 only)

## Done when

- Tests in `tests/kit-ux.test.ts`, the first two failing before the fix: `src/my file.css:1: #fff` with `src/my file.css` changed gives one L2 finding for that file; an allow-list line naming `src/my (old) file.css` counts for that file. From the gaps: no `kit.json` gives `RESULT: fail ux needs --base (no branches.land in scripts/agents/kit.json)` and runs with `--base origin/dev`; a broken one fails even with `--base`; an untracked allowed CSS file counts as known; a passing `checks.css` prints `colours: <command>: ok` in stdout and the bundle.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit, tests and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke54 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/54-kit-ux-spaced-paths-and-docs.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke54 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, the findings for the spaced path before and after, review decisions, PR and merge SHA.

## Done (2026-10-27)

- `kit ux` reads a colour check line's path up to its first `:<line>:` (or `:<line>:<column>:`), so spaces and parentheses in it are kept: `src/my file.css:1: #fff` with `src/my file.css` changed is one L2 finding `src/my file.css:1: raw colour #fff`, alone or beside other lines (before: the generic `<command> exited 1: …` finding alone, and silently dropped beside other lines). Stack frames (`at …`, `node:…`) and paths outside the project are still no `file:line` lines.
- A non-CSS line (an allow list's stale entry) counts for the longest tracked or untracked project file its text names whole (no path character just before it, none or `.x` just after; `./` and absolute paths still name it), instead of a token split: `allow.json:3: stale allow entry: src/my (old) file.css: #000` counts for `src/my (old) file.css` (before: dropped as outside the diff). A CSS line still counts for its own file.
- `docs/agents/agent-scripts.md` states the CSS-first rule and the spaced-path reading; ticket 48's Done line 46 carries "(changed in round 3, see below)".
- Tests in `tests/kit-ux.test.ts`: the spaced CSS path (unit and through this editor's `checks.css`) and the allow-list line naming `src/my (old) file.css`, all three failing on the old code; no `scripts/agents/kit.json` gives `RESULT: fail ux needs --base (no branches.land in scripts/agents/kit.json)` and runs with `--base origin/dev`; a broken one fails even with `--base`; a stale entry for an untracked CSS file counts for it; a passing `checks.css` prints `colours: <command>: ok` in stdout and the bundle.
- Feature list: no change (kit plumbing and its docs only).
