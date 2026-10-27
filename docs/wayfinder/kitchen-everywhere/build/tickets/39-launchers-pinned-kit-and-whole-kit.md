---
title: The launchers recover a retired kit folder and accept only a whole kit
type: task (AFK)
status: closed
assignee: ke-39
builder: claude
blocked_by: [21-launcher-and-update]
---

## Goal

Claude's review and the OpenCode second look on [ticket 21](21-launcher-and-update.md#done-2026-10-27) (evidence `.scratch/reviews/unknown/20261027T165450Z` in the main checkout) found two ways the launchers leave a session without its guards or without a working kit:

1. **Sessions that inherited a kit folder lose their guards once `kit update` deletes it** (P2, Claude follow-up, also raised by OpenCode): the launcher exports the machine-copy `KIT_HOME` it read, and the front door treats any `KIT_HOME` that differs from `KIT_HOME_DEFAULT` as one a person chose (`scripts/agents/kit:10,16`), so it unsets `KIT_HOME_DEFAULT`. Every child (builder sessions from `kit slice`, `kit bg` jobs) carries a `KIT_HOME` that looks hand-set. Once that folder has been retired for over a day and deleted, the hook launcher keeps the dead path (`scripts/agents/launcher/hooks-run.sh:9-10`), prints "guards are off" on every call, and nested `scripts/agents/kit` calls fail with `no Agent Kit at <X> (KIT_HOME)` (`launcher/kit:9,23`). The spec only promises that a command keeps one kit for its own run, not that its descendants lose the guards.
2. **The launcher accepts half a kit** (P2, OpenCode): `launcher/kit:14` (and `:19`, `:23`) takes a cache or machine-copy folder when `kit` is executable, while `kit update` and the front door also need `kit-lib.sh` (`kit.d/update:80,95`; `scripts/agents/kit:11`). A cache folder with `kit` but no `kit-lib.sh` is kept, every call fails in the front door, and the launcher never replaces it.

## Decided behaviour

- The launchers export a marker `KIT_HOME_PINNED=$KIT_HOME` beside the machine-copy or cache `KIT_HOME` they pick. When `KIT_HOME` equals `KIT_HOME_PINNED` and that folder no longer holds a whole kit, both launchers fall back to `current` or the cache clone, as for an unset `KIT_HOME`. A person's own `KIT_HOME` (no marker, or a different one) still wins and still fails plainly when it holds no kit.
- Both launchers use the same whole-kit check as `kit update` (`kit` executable and `kit-lib.sh` present); a cache folder that fails it ends `<folder> exists but holds no kit; remove it`, as a cache folder with no kit does today.
- P3 from the same look, fixed here: `docs/agents/guardrails.md:10` says `scripts/agents/hooks/run.sh` finds the repo from `CLAUDE_PROJECT_DIR` or git; since ticket 21 only the context card does, and the guards run beside the file.

## Files

- `scripts/agents/launcher/kit`
- `scripts/agents/launcher/hooks-run.sh`
- `tests/kit-launcher.test.ts`
- `docs/agents/agent-scripts.md` (the launcher lines), `docs/agents/guardrails.md`

## Done when

- `tests/kit-launcher.test.ts`, each failing before the fix: update one, then two, so one is retired; remove one's folder; the hook launcher (`bash-guard` on a `git stash pop`) and the kit launcher (`where`) with `KIT_HOME` and `KIT_HOME_PINNED` both set to one's folder and no `KIT_HOME_DEFAULT` → the guard blocks (status 2 with its stderr) and `where` names two; the same with only `KIT_HOME` set → the documented failure; a cache folder with `kit` but no `kit-lib.sh` → rejected with the "holds no kit" line, not used.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; writes nothing in Lex's real `~/.local` or `~/.cache` folders during tests.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke39 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/39-launchers-pinned-kit-and-whole-kit.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke39 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, how each new case failed before the fix, review decisions, PR and merge SHA.

## Done (2026-10-27)

- **Pinned kit** (`scripts/agents/launcher/kit`): when the launcher picks the kit itself (no `KIT_HOME`, or one a front door filled in), it exports `KIT_HOME_PINNED` beside `KIT_HOME`, both resolved like the front door resolves them (`pwd -P`; a folder gone before that ends `RESULT: fail no Agent Kit at <folder> (removed while starting)`), so the marker still matches in every child. A `KIT_HOME` equal to `KIT_HOME_PINNED` that still holds a whole kit is kept; one whose folder is no longer a whole kit is picked again from `current` or the cache clone. A person's `KIT_HOME` (no marker, or a different one) still wins and still ends `RESULT: fail no Agent Kit at <folder> (KIT_HOME)` when it holds no kit.
- **Hook launcher** (`scripts/agents/launcher/hooks-run.sh`): the same rule, so a session that inherited a removed pinned folder keeps its guards; a person's missing `KIT_HOME` still prints the "guards are off" warning.
- **Whole kit only**: both launchers take a folder only when `kit` is executable and `kit-lib.sh` is present (`kit update`'s check; the hook launcher also needs `hooks/run.sh`). This covers `current`, the cache folder, a fresh clone and the final check; a cache folder with `kit` but no `kit-lib.sh` ends `<folder> exists but holds no kit; remove it` and the hook launcher warns instead of running it.
- **Docs**: `docs/agents/agent-scripts.md` describes the marker and the whole-kit check; `docs/agents/guardrails.md` no longer says `hooks/run.sh` finds the repo: it runs the guards beside it, and only the context card and the bash guard's server hint read the project (the ticket said only the context card; the bash guard's `setsid` hint reads `kit.json` too).
- **Tests** (`tests/kit-launcher.test.ts`, a new `pinned` project command printing `KIT_HOME_PINNED`): update one, then two, remove one's folder; with `KIT_HOME` and `KIT_HOME_PINNED` both on one's folder the guard blocks `git stash pop` (status 2, its stderr) and `where` names two, and the marker moves to two; before the removal, the pinned folder one (still a whole kit) is kept over current two by `where`, `pinned` and the hook launcher (one's own guard runs); with only `KIT_HOME` set the hook warns and `where` fails with the `(KIT_HOME)` line. A cache folder with `kit` but no `kit-lib.sh` is rejected with the "holds no kit" line and the hook launcher warns. A `current` folder without `kit-lib.sh` is passed over for a fresh cache clone by both launchers. A removed pinned folder with no machine copy and an unreachable `KIT_REPO` fails for the cache (`no machine copy; cannot clone …`), not as `(KIT_HOME)`. A person's missing `KIT_HOME` beside a different marker still fails as `(KIT_HOME)` and the hook warns; a pinned folder missing only `kit-lib.sh` is picked again (two's guard runs, not one's). Behind a linked `XDG_DATA_HOME`, `pinned` and `where` print the same resolved folder, and a child given it picks again once it is removed. A published kit without `kit-lib.sh` is cloned and thrown away (`no machine copy; cannot clone …`, cache left empty); a person's `KIT_HOME` holding only `hooks/run.sh` gets the hook warning, not its guard. The fixture drops `KIT_HOME_PINNED` from the inherited environment. Before the fix: `pinned` printed `unset`, the guard exited 0 with the warning instead of blocking, and the half-kit cache ran (status 0, not 2); against the old launchers all seven new tests fail, and without the `pwd -P` step the linked-folder test fails.
- `scripts/agents/kit unit --affected`: `RESULT: ok unit 16/16 (1 files)`; `npm run lint` exit 0.
- Feature list: no change (agent tooling only; nothing in the editor changes).
