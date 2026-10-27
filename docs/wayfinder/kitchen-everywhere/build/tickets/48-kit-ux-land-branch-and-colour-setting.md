---
title: "`kit ux` takes its base and colour check from the settings (second look on 25)"
type: task (AFK)
status: closed
assignee: ke-48
builder: claude
blocked_by: [25-editor-values-left-after-11]
---

## Goal

Ticket 25 moved the editor's own values out of the shared kit, apart from `scripts/agents/kit.d/ux`, which was outside its Files ([Done](25-editor-values-left-after-11.md#done-2026-10-27), follow-up). The OpenCode second look on 25 (evidence `.scratch/reviews/unknown/20261027T184930Z` in the main checkout) rated the gap P1: the ticket was closed by narrowing its `grep` check to exempt `kit.d/ux`, while `kit ux` still has the editor written in:

1. **The base is always `origin/dev`** (`kit.d/ux:16` in the usage, `:60` in `parseArgs`). In a project that lands on `main` there is no `origin/dev`, so every visible slice's `kit ux` diffs against a missing or wrong base.
2. **The colour check is the editor's file** (`kit.d/ux:506`, `:509`): it imports `scripts/check-colours.mjs` and reads `scripts/check-colours.allow.json` itself, and only looks at `src/` outside `src/theme.css`. `kit pr` already runs the project's `checks.css` command instead (ticket 25). A project without the editor's checker gets no colour findings, so nothing breaks today; it just never checks.

## Decided behaviour

- `--base` defaults to `origin/<kitBranch("land")>`, the same as `kit pr` and `kit review`; the usage says "default origin/<land> (branches.land in scripts/agents/kit.json)".
- The raw-colour findings (rule L2) come from the project's `checks.css` command, run on the changed CSS files, the way `kit pr`'s `colours` step runs it; each failure line it prints becomes one L2 finding. Without `checks.css` the report says `colours: skipped (no checks.css in scripts/agents/kit.json)`, as `kit pr` does. If the command cannot report per file and line, the slice may instead keep the import but take its path from a new setting; either way, no editor path stays written in `kit.d/ux`.
- This editor's `kit ux` finds the same L2 findings on the same diff as before (compare old and new on one CSS change with a raw colour and one on the allow list).

## Files

- `scripts/agents/kit.d/ux`
- `tests/kit-ux.test.ts`
- `docs/agents/agent-scripts.md` (the `kit ux` line)

## Done when

- `grep -n "origin/dev\|check-colours" scripts/agents/kit.d/ux` finds nothing, and ticket 25's original check (`grep -rn "origin/dev\|native-site-editor\|check-colours" scripts/agents/kit.d scripts/agents/*.mjs scripts/agents/*.sh`) finds only `kit.json`, the editor's own commands and comments.
- Tests, each failing before the fix: a temp repo with `branches.land: main` and no `dev` branch → `kit ux` (with `--no-review` and a stub `shots`) diffs against `origin/main`; a project with its own `checks.css` command → its failures appear as L2 findings; no `checks.css` → the skipped line and no L2 findings; this editor's settings → the same L2 findings as before for a raw colour, none for an allowed one.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke48 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/48-kit-ux-land-branch-and-colour-setting.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke48 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, the `grep` output, the before-and-after L2 findings on the editor, review decisions, PR and merge SHA.

## Done (2026-10-27)

- `kit ux --base` now defaults to `origin/<branches.land>` from `scripts/agents/kit.json`, the same as `kit pr` and `kit review`. If the setting is missing and no `--base` is given, it fails with `RESULT: fail ux needs --base (no branches.land in scripts/agents/kit.json)`. The settings are read leniently, one key at a time, as before, so a file with no `project` key still works.
- Raw-colour (L2) findings now come from the project's `checks.css` command, which runs with the changed CSS files as arguments and keeps its output in `colours.log` beside the raw tries. When the command fails, each `file:line: text` line it prints for a file in the diff becomes one L2 finding (`raw colour <text>` for a CSS file, the text alone for another file such as an allow list). Paths starting with `./` or absolute paths are read against the root. Lines for any file outside the diff are dropped and counted. Stack frames such as `at f (/abs/x.js:12:5)` do not count as `file:line` lines. stdout and the bundle say `colours: <command>: ok` only when it passed; a failed run says `exited <n>, <k> findings (<d> outside the diff); log <path>`, so a run whose lines were all dropped never reads ok. A `checks.css` command that does not exist becomes one finding: `<command> exited 127: spawn <name> ENOENT; log <path>`. A failed run that names no line becomes one finding with its first line and the log. With no `checks.css`, stdout and the bundle say `colours: skipped (no checks.css in scripts/agents/kit.json)`. `kit.d/ux` no longer contains any editor path: `grep -n "origin/dev\|check-colours" scripts/agents/kit.d/ux` finds nothing. Ticket 25's wider grep finds only comments and the editor's own commands (`shots.sh`, `deploy-preview.sh`).
- This editor's `checks.css` (`node scripts/check-colours.mjs`) checks all of `src/` except `theme.css` and ignores the file arguments. Because findings in unchanged CSS files are dropped, `kit ux` reports the same raw-colour findings as the old code on the same diff: `- L2 src/plain.css:1: raw colour #fff` for a raw colour, nothing for a line on the allow list, and nothing for an untouched `src/other.css` that has a raw colour. One difference remains: a stale allow entry for a changed CSS file is no longer a finding unless the allow list is in the diff too. It is counted as outside the diff, and the colours line shows the failed run and its log.
- Tests in `tests/kit-ux.test.ts`: the fixture now has this editor's settings (land `dev`, its `checks.css`, an empty allow list). New tests cover: lands on `main` with no `origin/dev`, so the run diffs against `origin/main`, plus the missing-land line; another project's own `checks.css` is given the changed CSS files and its failure line becomes an L2 finding; no `checks.css` gives the skipped line and no L2; the editor's raw-versus-allowed case, with an unchanged file holding a raw colour left out; a failed run with only lines outside the diff (never ok, names its status and `colours.log`); a missing `checks.css` command (one ENOENT finding); `branches: {}` with an explicit `--base` passes; the output parser, including `./` and absolute paths, dropped files outside the diff (CSS and `.vue`), a kept changed allow-list line and a stack frame that falls back to the log finding. Run against the old `kit ux`, the `parseArgs` default, land-on-main, own-`checks.css` and parser tests fail (4 of 34); the editor raw-versus-allowed test passes on both by design.
- `scripts/agents/kit unit --affected`: `RESULT: ok unit 34/34`; docs guards 37/37; `npm run lint` and `npm run check` clean.
- Feature list: no change (agent kit tooling, nothing a user sees).
