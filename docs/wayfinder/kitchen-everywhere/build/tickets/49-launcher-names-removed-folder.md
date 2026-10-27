---
title: The kit launcher names the folder that vanished, and the launcher docs say what the code does (second look on 39)
type: task (AFK)
status: closed
assignee: ke-49
builder: claude
blocked_by: [39-launchers-pinned-kit-and-whole-kit]
---

## Goal

The OpenCode second look on [ticket 39](39-launchers-pinned-kit-and-whole-kit.md#done-2026-10-27) (evidence `.scratch/reviews/unknown/20261027T182212Z` in the main checkout) found:

1. **The "removed while starting" message loses the folder** (P2): in `scripts/agents/launcher/kit:33`, `KIT_HOME=$(cd -- "$KIT_HOME" 2>/dev/null && pwd -P) || { printf '… at %s (removed while starting)' "$KIT_HOME"; … }` overwrites `KIT_HOME` with the empty output before the message reads it, so it prints `RESULT: fail no Agent Kit at  (removed while starting)`. Ticket 39 promises the folder in that message, and the front door keeps the old value for the same message (`scripts/agents/kit:11-13`). It only happens when `kit update` deletes the folder between the whole-kit check and the `cd`, but then the message is the only clue.
2. **The docs promise less fallback and more sameness than the code** (P3, same look): `docs/agents/agent-scripts.md:65` says a child whose pinned folder was removed "picks again from `current`" (the code also falls back to the cache clone, `launcher/kit:21`, `hooks-run.sh:17`), and that both launchers take only a whole kit "(`kit` executable and `kit-lib.sh`)", while the hook launcher also needs `hooks/run.sh` (`hooks-run.sh:10`). The ticket's Decided behaviour line 20 says the same.

## Decided behaviour

- `launcher/kit` keeps the picked folder in its own variable before resolving it, and the message names it: `RESULT: fail no Agent Kit at <folder> (removed while starting)`.
- `docs/agents/agent-scripts.md` says "picks again from `current` or the cache clone" and "the hook launcher also needs `hooks/run.sh`".
- Nit from the same look, fixed here if it stays one line: a fresh clone that fails the whole-kit check says the clone holds no whole kit, not `no machine copy; cannot clone …`.

## Files

- `scripts/agents/launcher/kit`
- `tests/kit-launcher.test.ts`
- `docs/agents/agent-scripts.md` (the launcher lines)

## Done when

- Tests, the first failing before the fix: a pinned whole folder removed just before the resolve step (a test seam, e.g. a stub `cd` or a hook variable the test sets) → the message names the folder. From the look's gaps: a pinned whole kit without `hooks/run.sh` → `kit where` keeps it and the hook runs the `current` kit's guard; a removed pinned cache folder → a fresh clone of the newest kit, and the hook runs its guard; a person's `KIT_HOME` beside a different `KIT_HOME_PINNED` → theirs still wins for both launchers.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; writes nothing in Lex's real `~/.local` or `~/.cache` folders during tests.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke49 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/49-launcher-names-removed-folder.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke49 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, the message before and after, review decisions, PR and merge SHA.

## Done (2026-10-27)

- `scripts/agents/launcher/kit` keeps the picked folder in `folder` before resolving it, so the message names it. Before: `RESULT: fail no Agent Kit at  (removed while starting)`; after: `RESULT: fail no Agent Kit at <data>/agent-kit/<commit> (removed while starting)`.
- Nit: a fresh clone that fails the whole-kit check now ends `(the clone of <repo> holds no whole kit)` instead of `no machine copy; cannot clone …`; a clone that fails still says `cannot clone`, and a whole clone whose time stamp cannot be written ends `(cannot stamp the clone in <cache>)`, and one that cannot be moved over a folder that is not a kit ends `(cannot place the clone at <folder>)`.
- `docs/agents/agent-scripts.md`: a child picks again from `current` or the cache clone; the hook launcher also needs `hooks/run.sh`; a person's `KIT_HOME` wins over a different `KIT_HOME_PINNED`; both failure messages named.
- `tests/kit-launcher.test.ts`, four new tests: a picked folder removed just before the resolve step (an exported `cd` function removes it) is named (failed before the fix with the empty folder); a pinned whole kit without `hooks/run.sh` is kept by `kit where` while the hook runs `current`'s guard; a removed pinned cache folder is cloned fresh from the newest kit and the hook then runs its guard; a person's whole `KIT_HOME` beside a different `KIT_HOME_PINNED` wins for both launchers. The two "cannot clone" tests now use an unreachable repo (an empty repo clones, so it now gets the clearer clone message), and the half-kit clone test expects the new message.
- Fix round test: a whole clone whose `mv` meets a folder that is not a kit (an exported `mv` function makes one) ends `cannot place the clone at <folder>`, not the half-kit message (failed before the fix). The new tests check that `chmod` succeeded.
- Second fix round test: a launcher whose `mv` loses the race to another launcher's whole clone (an exported `mv` function copies the clone into place first) uses that clone and leaves only `agent-kit` in the cache.
- PR review fixes (PR #222): a picked cache clone removed just before the resolve step is named too, and an empty kit repo's clone gets `the clone of <repo> holds no whole kit` with the cache left empty (two new tests); `why` names the placement only after the clone is stamped; the docs line names the kit launcher and is rewrapped.
- PR review fix round 2: a failed time stamp on a whole clone ends `cannot stamp the clone in <cache>` instead of `cannot clone`, with the cache left empty (new test, failed before the fix with `no machine copy; cannot clone …`); the docs line names the stamp message and says a lost move to another launcher's whole clone just uses it.
- Tests: nine new in `tests/kit-launcher.test.ts` across the build and review rounds (25 in the file). `scripts/agents/kit unit --affected`: `RESULT: ok unit 25/25 (1 files)`; `npm run lint` exit 0.
- Commits: 61d76ff76 (build), 20e433558 (review fix round 1), d279f0701 (review fix round 2), f65f846ed (PR review fixes); PR review fix round 2 follows them.
- Review decisions: the clone message is now set only when the whole-kit check fails, with a separate placement message (fixed, with a test); the Done section gained this commits line and these decisions (fixed); the stale lines in ticket 39 (Decided behaviour `:20`, Done `:49`) were left alone because ticket 39 is outside this ticket's Files. The clone nit grew past the "one line" Decided behaviour allowed (two launcher lines and a second, placement message), knowingly, because review round 1 found the single message blamed a failed placement on the clone.
- Feature list: no change (agent tooling only; nothing in the editor changes).
