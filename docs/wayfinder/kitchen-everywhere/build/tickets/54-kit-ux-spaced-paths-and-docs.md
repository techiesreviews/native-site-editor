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

- `kit ux` reads a colour check line's path up to its first `:<line>:` (or `:<line>:<column>:`), so spaces and parentheses in it are kept: `src/my file.css:1: #fff` with `src/my file.css` changed is one L2 finding `src/my file.css:1: raw colour #fff`, alone or beside other lines (before: the generic `<command> exited 1: …` finding alone, and silently dropped beside other lines). The path must be a tracked or untracked project file or one on disk, so prose such as `Found 1 problem in src/a.css:3: #fff` or a stack frame (`at …`, `node:…`) is no `file:line` line, and a run with only such a line gives the `<command> exited <n>: …; log` finding.
- A line whose path is outside the project is never a finding but is counted in `(<d> outside the diff)`, as before; the Decided behaviour's "stays unlocated as now" described the old code wrongly.
- A non-CSS line (an allow list's stale entry) counts for the first `: `-separated part of its text that is a tracked or untracked project file, else for the longest such file a part names whole (bounded by the part's ends, quotes, brackets, `,` or `;`, never by a space, since a path may hold one), else its own file; `./` and absolute paths still name it. This replaces the token split: `allow.json:3: stale allow entry: src/my (old) file.css: #000` counts for `src/my (old) file.css` (before: dropped as outside the diff). A CSS line still counts for its own file.
- `docs/agents/agent-scripts.md` states the CSS-first rule and the spaced-path reading; ticket 48's Done line 46 carries "(changed in round 3, see below)".
- Tests in `tests/kit-ux.test.ts`: the spaced CSS path (unit and through this editor's `checks.css`) and the allow-list line naming `src/my (old) file.css`, all three failing on the old code; no `scripts/agents/kit.json` gives `RESULT: fail ux needs --base (no branches.land in scripts/agents/kit.json)` and runs with `--base origin/dev`; a broken one fails even with `--base`; a stale entry for an untracked CSS file counts for it; a passing `checks.css` prints `colours: <command>: ok` in stdout and the bundle.
- Review round 1 tests: an out-of-project line beside a located line is counted (`outside: 1`); `Found 1 problem in src/a.css:3: #fff` alone gives the `check exited 1: …` finding; `lib/src/a.css` does not name `src/a.css`, known or not. The outside-the-diff run test now names a committed, untouched file (`src/page-builder/media-picker.css`) rather than one that does not exist.
- Review round 2 tests: a stale entry naming a deleted `src/my (old) file.css` is not charged to a known root `file.css`, nor `src/my file.css` to a known `src/my`; a non-CSS line whose own path is outside the project is counted, not charged to the file it names; an ignored `dist/x.css` on disk is a file line outside the diff (`1 finding (1 outside the diff)`). A file line's path must be a file (a folder or the root is not), and the `at ` lookahead is gone: a frame's path is never a known file or one on disk.
- Review decisions, round 1: accepted the uncounted out-of-project line (counted again), prose read as a path (path must be known or on disk), the Done's missing commit and evidence, and the three test gaps; declined: none.
- Review decisions, round 2: accepted the deleted spaced path charged to a shorter known file (exact `: ` parts first, no space boundary), the missing review decisions, and the three test gaps; took the nits (no `at ` lookahead, files only, lazy sort); declined: none.
- Commits: 5fe4df578 (spaced paths, CSS-first docs, gap tests), 11ba03728 (review round 1); the round-2 fixes follow them.
- Evidence: `RESULT: ok doctor 11/11 checks passed`; `RESULT: ok unit 41/41 (1 files)` from `scripts/agents/kit unit --affected`; `npm run lint` exit 0.
- Feature list: no change (kit plumbing and its docs only).
