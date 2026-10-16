---
title: "kit doctor: the start-up check, and agent.sh refuses when it fails"
type: task (AFK)
status: open
assignee:
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
