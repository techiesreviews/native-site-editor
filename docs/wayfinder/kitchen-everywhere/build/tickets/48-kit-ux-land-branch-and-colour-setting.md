---
title: "`kit ux` takes its base and colour check from the settings (second look on 25)"
type: task (AFK)
status: open
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
