---
title: Doctor's commands check says so when the settings file is broken
type: task (AFK)
status: closed
assignee: ke-27
builder: claude
blocked_by: [26-settings-messages-and-tests]
---

## Goal

Grok's second look on [ticket 12](12-own-commands-folder.md#done-2026-10-27) (P2, evidence `.scratch/reviews/review/ke12-second-look/20261027T091336Z` in the main checkout) found that `kit doctor` contradicts itself when `scripts/agents/kit.json` is broken: the `settings` line fails, yet the `commands` line passes with `✓ commands: … shared, no project folder (no "commands" in scripts/agents/kit.json)`. `kit.d/doctor:147` reads the key with `kit_setting .commands`, and `kit_setting` (`kit-lib.sh:18`) turns a jq failure into an empty value (`2>/dev/null || :`), so an unreadable file looks like a file with no `commands` key. The runner is told the project has no own commands, and the project folder is never checked for clashes.

## Decided behaviour

- **A broken settings file skips the folder, out loud (`kit.d/doctor:147`, `:181`):** when `kit_settings_problems` reports the file missing or unreadable, the `commands` line fails with `project folder not checked (scripts/agents/kit.json unreadable)` and the fix `run kit doctor after fixing scripts/agents/kit.json`, and the shared folder is still listed and checked for `--help`. A readable file without `commands` keeps today's pass line.
- **`KIT_COMMANDS_DIR` is untouched:** with it set, the settings file is not read for `commands`, as today.
- **Ticket 12's two test gaps, in the same pass:** the front door with the repo's real `kit.json` (no `KIT_COMMANDS_DIR`) runs a project command, and `kit --help` shows both groups.

## Files

- `scripts/agents/kit.d/doctor`
- `tests/kit-doctor.test.ts`, `tests/kit.test.ts`

## Done when

- `tests/kit-doctor.test.ts`: with `kit.json` holding `{ "commands": ` (no `KIT_COMMANDS_DIR`), doctor prints the `✗ commands: project folder not checked …` line and not `no "commands" in scripts/agents/kit.json`; with a readable file and no `commands` key, the old pass line stays.
- `tests/kit.test.ts`: `scripts/agents/kit specs --help` with `KIT_ROOT` at the repo and `KIT_COMMANDS_DIR` unset exits 0 with stdout matching `/^Usage: kit specs/`; the two-groups test also runs `run(["--help"], env)` and finds both `Shared commands:` and `Project commands:`.
- `scripts/agents/kit unit tests/kit*.test.ts` green; one real `kit doctor` on this editor prints what it printed before.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and tests only; touches shared plumbing, so `kit pr` runs the full kit test set.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke27 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/27-doctor-commands-on-broken-settings.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke27 --timeout 2h`. While building: `scripts/agents/kit unit --affected`, then `scripts/agents/kit unit tests/kit*.test.ts`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, before-and-after `doctor` lines, review decisions, PR and merge SHA.

## Done (2026-10-27)

- `kit doctor` (`scripts/agents/kit.d/doctor`) now remembers when `scripts/agents/kit.json` is missing or unreadable (bad JSON, or not one JSON object). The `commands` line then fails with `project folder not checked (scripts/agents/kit.json unreadable), <n> shared; fix: run kit doctor after fixing scripts/agents/kit.json` (or `missing`). It no longer claims there is no `"commands"` key. The shared folder is still counted and every shared command is still checked for `--help`. A readable file without `commands` keeps the old pass line, and `KIT_COMMANDS_DIR` behaves as before.
- Tests: `tests/kit-doctor.test.ts` covers a readable file with no `commands` (pass line), `{ "commands": ` (fail line, no `no "commands"` text, help still checked), a missing file, `[]` (unreadable), `{"commands":"own"}` without `project` or `branches` (project folder still checked) and a broken file with `KIT_COMMANDS_DIR` set (old line kept). `tests/kit.test.ts` runs `kit specs --help` through the front door with this repo's real `kit.json`, and the two-groups test runs `kit --help` and finds both `Shared commands:` and `Project commands:`.
- The real `kit doctor` on this editor prints the same output as before: `✓ commands: 20 shared, 4 in scripts/agents/project.d`, `RESULT: ok doctor 11/11 checks passed`.
- Feature list: no change (kit-internal doctor message; no editor UI).
- Commits: ed4bc7d76 (doctor fix and tests), 1558cd27a (round 1: tests for `[]`, a readable file missing keys, and a broken file with `KIT_COMMANDS_DIR`).
