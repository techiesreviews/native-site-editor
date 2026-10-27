---
title: The launcher and kit update, tried here
type: task (AFK)
status: closed
assignee: ke-21
builder: claude
blocked_by: [14-settings-for-other-projects]
---

## Goal

The pieces that let every project run one kit copy on the machine, always the newest, built and tested here before the kit moves: a small launcher per project, `kit update` that unpacks the newest kit, and hooks that never go quiet when the kit is missing (research 04, "How way D would work"; [ticket 04 resolution](../../tickets/04-research-how-projects-pull-the-kit.md#resolution-2026-10-26); [ticket 01 resolution](../../tickets/01-grill-how-the-kitchen-is-copied.md#resolution-2026-10-26) point 3).

## Decided behaviour

- **Machine copy:** clean, read-only kits under `~/.local/share/agent-kit/<commit>/` with a `current` link to the newest; kit work happens elsewhere (`~/Projects/agent-kit` after ticket 30).
- **`kit update`** fetches the kit repo's `main`, unpacks the newest commit into a new folder and swaps `current` in one step; folders older than a day go. `kit update --previous` points `current` back one commit for every project at once (the emergency switch); the normal way back is a revert in the kit repo. The repo URL is a setting of the launcher; until ticket 30, tests use a local bare repo.
- **The launcher** (a template `scripts/agents/launcher/kit` of about 20 lines, written into projects by `kit init` and into this repo by ticket 30): reads `current` once, sets `KIT_HOME` to that exact folder for the whole command (a long slice keeps one version), and runs the kit's front door. An already set `KIT_HOME` wins (trying a kit branch). With no machine copy (GitHub Actions, a cloud session, a new laptop) it clones the newest kit `--depth 1` into `${XDG_CACHE_HOME:-~/.cache}/agent-kit` first, outside every project folder.
- **The hook launcher** (template `scripts/agents/launcher/hooks-run.sh`) finds the kit the same way and runs the kit's `hooks/run.sh`; it never goes through the front door (no `RESULT:` line in session context). **It never fails silently** (README helper decision 7): with no kit it prints "Agent Kit not found: guards are off; run `scripts/agents/kit doctor`" as SessionStart context and on every guarded call, and does not block the session.
- **`kit version` and `kit doctor`** print the kit's commit and age beside the project's; `doctor` warns after a day without an update and fails when the hooks cannot reach a kit (its live `bash-guard` probe).

## Files

- `scripts/agents/kit.d/update` (new), `tests/kit-update.test.ts` (new)
- `scripts/agents/launcher/kit`, `scripts/agents/launcher/hooks-run.sh` (new templates), `tests/kit-launcher.test.ts` (new)
- `scripts/agents/kit.d/version`, `scripts/agents/kit.d/doctor`, `scripts/agents/hooks/run.sh`
- `tests/kit-doctor.test.ts`, `tests/kit.test.ts`
- `docs/agents/agent-scripts.md`

## Done when

- Tests with a local bare repo and temp `XDG_DATA_HOME`/`XDG_CACHE_HOME` prove: `kit update` unpacks and swaps; a command started before an update finishes on its old folder; `--previous` goes back one; no machine copy → one shallow clone into the cache and none inside the project; `KIT_HOME` set wins; the hook launcher with no kit prints the warning and exits without blocking; `doctor` warns on a two-day-old copy and fails when hooks cannot reach a kit.
- `scripts/agents/kit unit --affected` green. This repo's own `scripts/agents/kit` is unchanged until ticket 30.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; writes nothing in Lex's real `~/.local` folders during tests.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke21 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/21-launcher-and-update.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke21 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says (by hand before 17 lands, by `kit slice` after).
- Report: unit `RESULT:` lines, the warning text as printed, review decisions, PR and merge SHA.

## Done (2026-10-27)

The pieces for one machine-wide kit are built and tested here; this repo's own `scripts/agents/kit` and hook paths are unchanged (ticket 30 switches them).

- **`kit update [--previous]`** (`scripts/agents/kit.d/update`): shallow-fetches `main` from `KIT_REPO` into `${XDG_DATA_HOME:-~/.local/share}/agent-kit/repo.git`, unpacks the commit into a read-only `<commit>/` folder (refusing a `main` without `kit` and `kit-lib.sh` at its top) and swaps `current` with one rename; `previous` names the kit it replaced. Folders that stopped being current over a day ago go; current and previous always stay. `--previous` swaps the two links for every project and records the commit stepped back from, so later updates stay put until `main` moves on; the kit it steps back from gets a day before it goes, like any retired kit. Updates take turns under `flock` (without it, `kit update: no flock; updates are not serialised`); a failed unpack ends `RESULT: fail update cannot unpack <commit>`, and only an update that leaves `current` on `main` (or the held kit) writes the time to `updated`, so a failing update keeps the stale warning.
- **Launcher** (`scripts/agents/launcher/kit`, 29 lines): a person's `KIT_HOME` wins (one a front door filled in does not); else it reads `current` once and runs that folder's front door for the whole command; with no machine copy it clones `--depth 1` into `${XDG_CACHE_HOME:-~/.cache}/agent-kit` (via a temp folder, kept only when it holds a kit, stamped with its clone time, and removed if the clone is interrupted) and reuses it, never refreshing it in place; a cache folder that holds no kit fails as `<folder> exists but holds no kit; remove it`. No kit at all ends `RESULT: fail no Agent Kit at <folder> (<why>)`. `KIT_REPO` is the setting at its top.
- **Hook launcher** (`scripts/agents/launcher/hooks-run.sh`): finds the kit the same way without cloning and runs the kit's `hooks/run.sh`. Without a kit it exits 0 and prints, for `session-env`, the SessionStart context `` Agent Kit not found: guards are off; run `scripts/agents/kit doctor` `` and, for every guarded hook, `{"systemMessage":"Agent Kit not found: guards are off; run `scripts/agents/kit doctor`"}`; `context-card` stays silent.
- **Kit `hooks/run.sh`** runs the guard hooks beside itself, so it works from a machine copy; the context card is still the project's own `scripts/agents/context-card.mjs` (ticket 30 moves it into the kit).
- **`kit version`** adds `kit <where and age>` (machine copy: since the last update; git checkout: commit age) and `project <commit>`, or `cache clone <folder>, cloned N ago`, plus `warning kit not updated for N days; run scripts/agents/kit update` for a machine copy or cache clone over a day without an update, and `warning kit update time unknown; …` for a machine copy with no update time. **`kit doctor`** shows that as an uncounted `✓ kit:` note, a `✗ kit:` warning (also with `--quiet`) and `; warning: kit not updated for N days` (or `; warning: kit update time unknown`) on the RESULT, for a machine copy and a cache clone alike; its `hooks live` probe runs without the command's `KIT_HOME` and fails as `hooks cannot reach a kit` on the hook launcher's warning; its kit home copy is made writable so a read-only machine copy cleans up.
- **Tests:** `tests/kit-update.test.ts` (7) and `tests/kit-launcher.test.ts` (9) with a local bare repo and temporary `HOME`/`XDG_*` folders: unpack and swap, a command started before an update finishing on its old folder, `--previous` and the hold, retirement cleanup (also after `--previous`), overlapping updates under `flock`, a failed update leaving `updated` alone, one shallow cache clone and nothing in the project (also with two launchers at once, after an interrupted clone, and naming a cache folder without a kit), the hook launcher when `current` points at a removed folder, the stale cache clone warning, `KIT_HOME` winning for the launcher and the hook launcher, the hook launcher's warning without blocking and its live guard with a kit. `tests/kit-doctor.test.ts` adds the two-day-old warning for a machine copy and a cache clone, the unknown update time and the unreachable-kit failure; `tests/kit.test.ts`'s two `kit version` patterns take the new lines.
- Docs: `docs/agents/agent-scripts.md` (machine kit and launchers, `kit update`, `kit version`, `kit doctor`).

Feature list: no change (kit plumbing only; nothing Lex sees in the editor).
