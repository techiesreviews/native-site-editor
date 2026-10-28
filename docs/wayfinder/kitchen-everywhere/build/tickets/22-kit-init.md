---
title: kit init sets a project up
type: task (AFK)
status: closed
assignee: ke-22
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

## Done (2026-10-28)

- **`kit init [--light] [--land <branch>]`** (`scripts/agents/kit.d/init`, shared) sets the project around the working folder up for the shared kit and never copies the kit in. It writes only what is missing. New `scripts/agents/kit.json`: `project` (the `origin` repo name, else the main folder's name), `mainRoot` (git's main worktree), `branches.land` (`--land`, else the first of `dev`, `develop`, `main`, `master`; none: `RESULT: fail init no dev, develop, main or master branch; name the landing branch with kit init --land <branch>`, exit 2, nothing written), `branches.release` (`main` or `master` beside `dev`/`develop`), and `checks` guessed from the `package.json` scripts `check` or `typecheck`, `test` (not npm's placeholder) and `lint`, run as the lockfile's npm, pnpm, yarn or bun does and printed as `note: checks guessed from package.json: …; confirm them in scripts/agents/kit.json` (no `package.json`: a note to add `checks`). Then the two launcher templates as `scripts/agents/kit` and `scripts/agents/hooks/run.sh` (executable), the kit's hook entries merged into `.claude/settings.json` (7) and `.codex/hooks.json` (4) beside the file's other keys and hooks (an entry already there is not added twice), and two `AGENTS.md` lines pointing at `scripts/agents/kit rulebook` and `scripts/agents/kit --help` (appended; a file without `AGENTS.md` gets one).
- **Full and light.** Light writes 6 files: `scripts/agents/kit.json`, `scripts/agents/kit`, `scripts/agents/hooks/run.sh`, `.claude/settings.json`, `.codex/hooks.json`, `AGENTS.md`. Full (the default) writes those plus 4: `scripts/agents/project.d/.gitkeep` (the empty own-commands folder, kept in git), `docs/agents/kitchen.md` (pointer to `kit rulebook`), `docs/agents/kitchen-extras.md` (from `docs/kitchen-extras-template.md` in the kit, with the project and branches filled in) and `docs/wayfinder/README.md`, named by `commands`, `rulebookExtras` and `maps` in the new settings file. An existing settings file is never edited; on a full run a `note:` names the keys it lacks.
- **Registers the project:** `kitRegisterProject(name, root)` in `scripts/agents/kit-lib.mjs` adds `{ "<project>": { "root": "<mainRoot>" } }` to the machine's `projects.json` under a lock, written atomically; the same entry again is left alone.
- **Safe to rerun; stops before writing.** A second run writes nothing and ends `RESULT: ok init nothing to write (already set up); doctor …`. Nothing is deleted or overwritten. Before writing anything it stops on old kit files (`scripts/agents/kit-lib.sh`, `kit-lib.mjs`, `kit.d/`, `hooks/bash-guard.sh`, `agent-cap.sh`, `session-env.sh`), listing each (`RESULT: fail init old kit files: …`); on a settings, hook or `package.json` file that cannot be read; and on a project name `projects.json` already lists at another root. Run in this repo it refuses with the six old files.
- **Ends with `kit doctor`:** its lines, then `RESULT: ok init wrote N files, listed the project; doctor 11/11 checks passed`. A failing doctor (for example `place` in the main checkout) fails init, and the written files stay.
- **Tests:** `tests/kit-init.test.ts` (5, new), using a fake machine kit (a copy of this kit as `kit update` leaves it, with `current` and `updated`) and temporary `HOME`/`XDG_*` folders, run through the machine copy's front door in a worktree of a temp repo. A fresh npm repo gets the full setup (10 files, exact `kit.json`, launchers equal to the templates, no kit files copied, filled extras, `AGENTS.md` lines), passes doctor, is listed in `projects.json`, runs `kit rulebook` through its own launcher, and a rerun leaves every file's bytes, mode and mtime and `projects.json` unchanged. A repo with no `package.json` gets a light setup (6 files, no `checks`) that passes doctor and is a strict subset of full's. Existing `.claude/settings.json` keys, other hooks and `AGENTS.md` text survive, with only the 7 missing entries and 1 missing line added. Old kit files stop it with the list and nothing written. No usual landing branch asks for `--land`; a broken `.claude/settings.json` and a name taken in `projects.json` stop it with nothing written.
- **Docs:** `docs/agents/agent-scripts.md` (the `kit init` command line; the machine-kit paragraph no longer says it is not built).
- Validation: `scripts/agents/kit unit --affected` `RESULT: ok unit 397/397 (15 files)`; `scripts/agents/kit unit tests/kit-doctor.test.ts tests/kit-launcher.test.ts tests/kit-rulebook.test.ts tests/code-map.test.ts tests/mcp-runtime.test.ts tests/kit-unit.test.ts` `RESULT: ok unit 158/158 (6 files)`; `npm run lint` and `npm run check` exit 0; `kit doctor` 11/11.

Feature list: no change (kit plumbing only; nothing Lex sees in the editor).
