---
title: "New kit setup reaches every project, not only new ones: `kit doctor` names missing pieces, `kit init --all` adds them; line endings first"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

Lex (2026-10-31), accepting the prompter ↔ CamFrame retro: "how are you adding them to the kit/fix and making sure that it can be used for all projects and new projects that will come?"

Most kit changes already reach every project by themselves: commands, hook scripts, the rulebook and review prompts run from the machine copy (`~/.local/share/agent-kit/current`), which the 15-minute timer updates, so every project and every new one gets them at once. The gap is what `kit init` writes *into* a project (hook entries in `.claude/settings.json` and `.codex/hooks.json`, the kitchen pointer, templates): it writes only what is missing when a project is set up, so a piece added later never reaches the projects set up before it. Ticket 66 hit this (projects that already had the kitchen pointer keep the old one), and ticket 79's new Stop hook entry and the line-endings file below would too.

## Decided behaviour

- **`kit doctor`** compares the project with what `kit init` would write today and prints a warning per missing piece (a hook entry, a file, a line): "missing since kit <sha>: <piece>; run `scripts/agents/kit init`". Never a failure. Pieces a project turned off on purpose are listed in `kit.json` (`init.skip`) and not reported.
- **`kit init --all`** reruns the merge-only setup in every project listed in the machine's `projects.json` (main checkouts, never a worktree with work in progress), commits the added pieces on each project's landing branch through `kit pr` (docs tier), and prints one RESULT line per project. A project with uncommitted changes in those files is skipped and named.
- **First new piece, line endings:** `kit init` writes `.gitattributes` with `* text=auto eol=lf` when missing (merging the line into an existing file), plus a one-time `git add --renormalize .` commit, so Windows checkouts can't break tests that read files (CamFrame v0.6.0, retro finding 2).
- The kitchen rulebook (station for kit changes) says: a kit change that adds a project file is done only when `kit init --all` has run.

## Files

In the kit repo (`~/Projects/agent-kit`, through its own `kit pr`): `kit.d/init`, `kit.d/doctor`, `kit-lib.mjs`, `tests/kit-init.test.ts`, `tests/kit-doctor.test.ts`, `docs/kitchen.md`.

## Done when

- Tests: a project set up before a new piece shows the warning; `kit init` adds the piece and the warning goes; `init.skip` silences it; `--all` skips a project with local changes; `.gitattributes` is merged, not overwritten. They fail before the change.
- `kit init --all` has run on this machine; its RESULT lines are in Done; `kit doctor` in every listed project shows no missing piece.
- agent-kit's `npm test`, `npm run lint` and `npm run test:kit-clean` pass.

## Kit commands and evidence

Agent Kit is required. In `~/Projects/agent-kit`: `kit doctor`, `kit unit --affected`, `kit review`, `kit pr`; report the RESULT lines, the PR URL and merge SHA.
