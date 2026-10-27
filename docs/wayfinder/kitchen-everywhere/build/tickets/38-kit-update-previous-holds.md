---
title: An emergency `kit update --previous` holds, and checks the kit it goes back to
type: task (AFK)
status: closed
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

## Done (2026-10-27)

- `kit update` checks every kit folder with one `has_kit` (`kit` executable and `kit-lib.sh` present): the current folder, the previous folder for `--previous`, the folder to unpack into and a fresh unpack.
- While `held` names main's commit, a removed or broken current folder is unpacked again from `repo.git` as the kit `--previous` went back to (`RESULT: ok update refilled <commit>`), and `held` stays. When `repo.git` no longer has it: `RESULT: fail update cannot refill held <commit>`, and `current`, `previous`, `held` and the update time stay as they were. A broken folder is replaced only after the new unpack passes `has_kit`; an unpacked held commit without a kit says `update held <commit> has no kit front door and kit-lib.sh at its top`.
- `--previous` refuses a previous folder that fails `has_kit` (`RESULT: fail update previous kit <commit> is incomplete`, `current` unchanged). A missing one, or a `previous` link that is not a folder, is still `no previous kit to go back to`.
- A second `--previous` (with `held` set and `previous` equal to `held`) changes nothing: `RESULT: ok update already back on <commit>`.
- `docs/agents/agent-scripts.md`: the `kit update` line describes the three cases above. The `kit version` line now says the warning applies to the current machine copy, and that its age counts from the last update that left `current` on `main` or on the held kit (`--previous` alone does not reset it).
- Tests (`tests/kit-update.test.ts`, 7 new): held refill of a removed folder; held refill of a broken folder (missing `kit-lib.sh`, comes back read-only); held refill with `repo.git` gone, for a removed folder and for a broken one (the broken folder, links, `held` and update time stay, no `.unpack.*` left); incomplete previous folder; `--previous` twice; `kit version` age and warning after `--previous`. Before the fix, the first four failed: the refill went forward to two (`update <two> (was <one>)`, twice), the incomplete folder was accepted, and the second `--previous` swapped back to two. The `kit version` case already passed, because that part of the fix was the docs; it now keeps the behaviour from drifting.
- Validation: `scripts/agents/kit unit --affected` → `RESULT: ok unit 18/18 (1 files)`; `npm run lint` clean.
- Feature list: no change (agent kit internals, nothing in the editor).
