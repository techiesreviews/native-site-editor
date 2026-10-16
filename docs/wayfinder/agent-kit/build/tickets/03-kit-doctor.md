---
title: "kit doctor: the start-up check, and agent.sh refuses when it fails"
type: task (AFK)
status: closed
assignee: ak-03
blocked_by: [01-kit-front-door]
builder: sol
---

## What

- Follow the kit layout in [the map](../../map.md#notes): one executable in `scripts/agents/kit.d/`, a `# kit: <summary>` line, `--help`, Node 24 and owner from `kit-lib`, one final `RESULT:` line, own test file.
- Checks, each one line ✓/✗ with a fix hint: not the root checkout and not `native-site-editor-dev`; the branch's merge-base contains `origin/dev` from within the last fetch (or the branch is `dev` itself in the dev worktree, allowed with a note); `.claude/settings.json` and `.codex/hooks.json` exist; **hooks live**: pipe a PreToolUse JSON for the command `git stash push -m probe` into `scripts/agents/hooks/run.sh bash-guard` and expect exit 2 (never run the probe itself; never probe with `git stash list`, which is allowed on purpose); Node ≥24 found via kit-lib; `node_modules` is the shared symlink and resolves; no conflict markers in tracked files (`git grep -nE '^(<<<<<<<|>>>>>>>)( |$)'`).
- `agent.sh` runs `kit doctor --quiet` first and refuses to start (exit 3, message points to `kit doctor`) when it fails. `ASE_SKIP_DOCTOR=1` bypasses for tests only.

## Files

- `scripts/agents/kit.d/doctor`
- `scripts/agents/agent.sh`
- `tests/kit-doctor.test.ts`

## Done when

- Test fixtures in temp git repos cover each failing check and the all-green run.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.

## Done (2026-10-16)

- **Behaviour.** `scripts/agents/kit doctor` prints seven ✓/✗ lines (place, base, hook config,
  hooks live, node, node_modules, conflicts), each ✗ with a fix hint, then one `RESULT:` line;
  exit 0 / 1, usage errors exit 2. `--quiet` prints only ✗ lines and `RESULT:`. The hooks-live
  probe pipes PreToolUse JSON for `git stash push -m probe` into `hooks/run.sh bash-guard` and
  expects exit 2; nothing is executed. `agent.sh` runs `kit doctor --quiet` on the target
  worktree and exits 3 with a pointer to `kit doctor` when it fails; `ASE_SKIP_DOCTOR=1` is for
  tests. The gate covers this repo's worktrees and any checkout containing `scripts/agents/kit`;
  unrelated repos (the starter, temp test repos) are not gated.
- **Base rule (decision).** `origin/dev` is one ref shared by every worktree, so another
  runner's fetch or landing moves it under a healthy branch. A branch passes when it contains
  `origin/dev`, or (with a "N commits behind; rebase before landing" note) when its merge-base
  was the fetched dev tip until less than 24 hours ago, read from the `origin/dev` reflog.
  Older or unrelated bases fail. Strict containment would stop runners' own `review.sh` runs
  after any parallel landing (this branch fell 5 behind within an hour).
- **Speed.** Doctor 0.08–0.11 s in a worktree made by `worktree.sh`; the whole agent.sh gate
  0.23 s. Demo: 7/7 ✓ in the ak-03 worktree; the root checkout is refused with exit 3.
- **Commits.** 3dd4e7de (Sol build), 805f9528 (review fixes).
- **Tests.** `tests/kit-doctor.test.ts`, 25 tests in temp git repos: all-green run under 2 s,
  each failing check, stale and recent bases, shared node_modules cases, agent.sh refuse /
  bypass / skip / separate-clone gate. `npm run check`, `npm run lint`, `unit.sh` 3548 pass.
- **Review.** Sol review 1: three P2s; fixed the shared node_modules and clone-gate findings,
  narrowed the base finding to the 24-hour window. Re-review: only the base grace period
  remains, rejected for the reason above (lead may make it strict). Reviews:
  `/home/ubulex/Projects/native-site-editor/.scratch/reviews/ak-03/`.
