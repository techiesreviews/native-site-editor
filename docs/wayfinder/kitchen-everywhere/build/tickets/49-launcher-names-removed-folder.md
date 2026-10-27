---
title: The kit launcher names the folder that vanished, and the launcher docs say what the code does (second look on 39)
type: task (AFK)
status: open
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
