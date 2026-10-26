---
title: kit init sets a project up
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [20-shared-rulebook, 21-launcher-and-update]
---

## Goal

One command sets a project up for the shared kit; it never copies the kit itself ([ticket 01 resolution](../../tickets/01-grill-how-the-kitchen-is-copied.md#resolution-2026-10-26) point 1: "`kit init` only writes the settings file, hooks and docs stubs"). Full or light per project ([ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) point 2).

## Decided behaviour

- **`kit init [--light] [--land <branch>]`**, run in a project's top folder (from the machine copy, `~/.local/share/agent-kit/current/kit init`, when the project has no launcher yet), writes only what is missing:
  - `scripts/agents/kit.json` with `project`, `mainRoot` and `branches` filled from git (asks for `--land` when there is no `dev`, `develop`, `master` or `main`), checks guessed from `package.json` scripts and printed for the lead to confirm;
  - the launcher `scripts/agents/kit` and `scripts/agents/hooks/run.sh` (ticket 21 templates);
  - `.claude/settings.json` and `.codex/hooks.json` hook entries, merged into existing files, never overwriting other settings;
  - an empty `scripts/agents/project.d/`;
  - docs stubs: `docs/agents/kitchen.md` pointer and `docs/agents/kitchen-extras.md` from the template (full only), `docs/wayfinder/` with a README (full only), and two lines in `AGENTS.md` pointing at `scripts/agents/kit rulebook` and `kit --help`.
- **Light** writes the settings file, launcher, hooks and the `AGENTS.md` lines only (`review`, `pr` and the hooks); full adds the rulebook extras and maps.
- **Registers the project** in the machine-wide `projects.json` (ticket 15).
- **Safe to rerun:** a second run changes nothing and says so; it never deletes a file. It refuses when old kit files are present (`scripts/agents/kit-lib.sh`, `kit.d/`) and lists them, so the move ticket removes them on purpose.
- Ends with `kit doctor`'s result for the new setup.

## Files

- `scripts/agents/kit.d/init` (new), `tests/kit-init.test.ts` (new)
- `scripts/agents/kit-lib.mjs` (registering, if not already there)
- `docs/agents/agent-scripts.md`

## Done when

- Tests on temp repos prove: a fresh npm repo and a repo with no `package.json` each get a working setup that passes `doctor` (with a fake machine kit); light writes less than full; existing `.claude/settings.json` keys survive; a rerun changes nothing; old kit files stop it with a list; the project appears in `projects.json`.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; touches no other project.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke22 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/22-kit-init.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke22 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Report: unit `RESULT:` lines, the file list a full and a light init write, review decisions, PR and merge SHA.
