---
title: The launchers recover a retired kit folder and accept only a whole kit
type: task (AFK)
status: open
assignee:
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
