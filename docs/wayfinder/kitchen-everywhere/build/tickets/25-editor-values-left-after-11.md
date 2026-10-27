---
title: The editor values slice 11 left in shared code
type: task (AFK)
status: open
assignee: ke-25
builder: claude
blocked_by: [14-settings-for-other-projects, 18-full-follow-ups]
---

## Goal

[Ticket 11](11-project-settings-file.md#done-2026-10-27) moved this editor's values into `scripts/agents/kit.json`, but its Done lists values still written into shared code, and Claude's PR review (two P2s, evidence `.scratch/reviews/build/ke-11-project-settings-file/20261027T073718Z` in the main checkout) asks for them to go; Grok's second look (P2, evidence `.scratch/reviews/review/ke11-second-look/20261027T080225Z` in the main checkout) found one more in `kit next`. In another project these break or mislead: a CSS-only PR fails `kit pr` on the missing `scripts/check-colours.mjs`, `checks.extra` runs only when `scripts/agents/**` changes, and `worktrees.sh` stops protecting the dev worktree of a project that lands on `main`.

## Decided behaviour

- **The colour check is a setting (P2, `kit.d/pr:235`):** `kit pr`'s `colours` step reads `checks.css` (this editor: `node scripts/check-colours.mjs`). Unset, the css tier logs `colours: skipped (no checks.css in scripts/agents/kit.json)`, like the other missing checks.
- **Kit and unit-test patterns are settings (P2, `pr-tier.mjs:64`):** `classify`'s `cleanGuard` (`^scripts/agents/`, `^tests/kit-.*\.test\.ts$`) and `unitTest` (`^tests/[^/]+\.test\.ts$`) come from `paths` (for example `paths.kit` and `paths.unitTests`), with this editor's patterns in its `kit.json`. A missing key turns its feature off with a plain line.
- **`kit pr`'s other editor bits:** the folder it reads for focused unit files (`kit.d/pr:224`, `tests`) follows the same unit-test setting; the "CI still runs check, unit tests, lint and smoke browser tests; no Sol review" line (`kit.d/pr:262`) names only the checks the settings file sets and drops "no Sol review".
- **`checks.extra` as a string (P3, `kit.d/pr:234`):** a string is taken as a one-item list; anything else that is not a list of strings fails with `checks.extra must be a list of commands`. Today a string is dropped and logged as "no checks.extra", which is false.
- **`worktrees.mjs` (lines 71, 121, 124, 155):** the protected dev worktree comes from `kitDevRoot()` (not the literal `native-site-editor-dev` or `/home/ubulex/...`), the protected branch and merge targets from `kitBranch("land")` and `kitBranch("release")`, and the closing hint names those branches.
- **`kit learn`:** `defaultSlug` (line 15) reads `project`; line 271 reads the `maps` folder instead of `join(root, "docs/wayfinder")`, and with no `maps` it skips the logs with a plain line.
- **`kit next` running slices (P2, Grok, `kit.d/next:183`):** `runningSlices` cuts the map name off `settings.maps` the way `ticketKey` does, not with `/docs\/wayfinder\/([^/]+)\//`. Today any other `maps` value leaves `ticket.map` empty, so a running `runs_alone` slice stops blocking its map (line 231).
- **`kit slice` (line 42):** refuses `kitBranch("land")` and `kitBranch("release")` instead of the literal `dev` and `main`.
- **Runner guide (P3, `docs/agents/runner.md:73`):** the visible paths are `paths.visible` and `featureList` in `scripts/agents/kit.json`, not `pr-tier.mjs`.
- **This editor works the same:** its `kit.json` gains the new keys with today's values; `kit pr --dry-run` on a CSS-only and on a kit change plans the same steps as before.

## Files

- `scripts/agents/kit.d/pr`, `scripts/agents/pr-tier.mjs`, `scripts/agents/kit.json`
- `scripts/agents/worktrees.mjs`, `scripts/agents/kit.d/learn`, `scripts/agents/kit.d/slice`, `scripts/agents/kit.d/next`
- `tests/kit-pr.test.ts`, `tests/kit-settings.test.ts`, `tests/kit-learn.test.ts`, `tests/kit-slice.test.ts`, `tests/kit-next.test.ts`, `tests/agent-worktrees.test.ts`
- `docs/agents/agent-scripts.md` (the new keys), `docs/agents/runner.md` (line 73)

## Done when

- Tests prove: no `checks.css` skips the colour step with its line; `paths.kit`/`paths.unitTests` drive `cleanGuard` and the focused unit files in a temp repo with other folders; a string `checks.extra` runs; a bad `checks.extra` fails with its line; `worktrees.sh` protects the `devRoot` worktree and the land branch of a `land: main` repo; `kit learn` uses `project` and `maps`; `kit slice` refuses a `land: main` repo's `main`.
- Grok's gap: `kit next` in a temp repo whose `maps` is not `docs/wayfinder`, with one running slice and an open `runs_alone` ticket in that map, prints `waits: … runs alone`, not `next:`.
- Validation gap from the review: in the `prod` repo of "kit pr pairs --release…", `git switch -c prod` and `pr --dry-run` gives `RESULT: fail guards: refusing branch prod`.
- `grep -rn "origin/dev\|native-site-editor\|check-colours" scripts/agents/kit.d scripts/agents/*.mjs scripts/agents/*.sh` finds only `kit.json`, the editor's own commands and comments.
- `scripts/agents/kit unit tests/kit*.test.ts` green; `kit pr --dry-run` on this editor plans what it planned before.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; touches shared plumbing, so `kit pr` runs the full kit test set.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke25 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/25-editor-values-left-after-11.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke25 --timeout 2h`. While building: `scripts/agents/kit unit --affected`, then `scripts/agents/kit unit tests/kit*.test.ts`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, the `grep` output, before-and-after `kit pr --dry-run` plans, review decisions, PR and merge SHA.
