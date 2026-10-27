---
title: An emergency `kit update --previous` holds, and checks the kit it goes back to
type: task (AFK)
status: open
assignee: ke-38
builder: claude
blocked_by: [21-launcher-and-update]
---

## Goal

Claude's review and the OpenCode second look on [ticket 21](21-launcher-and-update.md#done-2026-10-27) (evidence `.scratch/reviews/unknown/20261027T165450Z` in the main checkout) found three ways `kit update --previous`, the step back Lex uses when a new kit breaks, can quietly put every project back on the broken kit or on a kit that cannot run:

1. **A later update undoes the step back** (P2, Claude follow-up, also raised by OpenCode): after `--previous`, `current` is the old kit and `held` names `main`. If the current folder later loses `kit` or `kit-lib.sh`, `whole` stays false (`scripts/agents/kit.d/update:80`), so neither the "already on" nor the "held" branch runs; the `else` branch unpacks `main` (the commit stepped back from), points `current` at it (`:106`) and deletes `held`.
2. **`--previous` checks only half a kit** (P2, OpenCode): it accepts the previous folder when `kit` is executable (`:50`), while the rest of the command needs `kit` and `kit-lib.sh` (`:80`, `:87`, `:95`) and so does the front door (`scripts/agents/kit:11`). A previous folder without `kit-lib.sh` becomes `current` for every project and every kit call then fails.
3. **A second `--previous` goes forward again** (P2, OpenCode): after one call `current` = old kit, `previous` = `held` = the kit stepped back from. A second call swaps them back (`:55`, `:57`), so every project returns to the broken kit, while the help says "back one commit".

## Decided behaviour

- One `has_kit <folder>` check (`kit` executable and `kit-lib.sh` present) is used everywhere the command asks whether a folder holds a kit (`:50`, `:80`, `:87`, `:95`).
- With `held` set and `main` still at the held commit, a missing or broken current folder is unpacked again from `repo.git` (`RESULT: ok update refilled <commit>`), `held` is kept and `current` stays on the old kit; if its objects are gone, `RESULT: fail update cannot refill held <commit>` and nothing moves.
- `--previous` refuses a previous folder that fails `has_kit`: `RESULT: fail update previous kit <commit> is incomplete`, `current` unchanged.
- A second `--previous` while `held` is set and `previous` equals `held` changes nothing and ends `RESULT: ok update already back on <commit>` (no toggle).
- P3 from the same look, fixed here: `docs/agents/agent-scripts.md:104` says every machine copy over a day warns and that the age is the time since the last `kit update`; it should say the current machine copy, and the last update that left `current` on `main` or on the held kit.

## Files

- `scripts/agents/kit.d/update`
- `tests/kit-update.test.ts`
- `docs/agents/agent-scripts.md` (the `kit update` and `kit version` lines)

## Done when

- `tests/kit-update.test.ts`, each failing before the fix: publish one and two, update, `--previous`, remove the current folder (one), `kit update` → `current` is one again, `held` kept, the RESULT is not `update <two>`; the same with one's objects gone → the plain refill failure and `current` untouched; a previous folder without `kit-lib.sh` → `--previous` fails and `current` does not move; `--previous` twice → `current`, `previous` and `held` stay on the old kit; after `--previous`, `kit version` shows the age and warning the docs describe.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; writes nothing in Lex's real `~/.local` folders during tests.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke38 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/38-kit-update-previous-holds.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke38 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, how each new case failed before the fix, review decisions, PR and merge SHA.
