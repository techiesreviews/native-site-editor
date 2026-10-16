# Agent kit build: lead log

## 2026-10-16 start-up check

- Worktree `native-site-editor-build-agent-kit`, branch `build/agent-kit`, HEAD = `origin/dev` (aa1d7f2a).
- `.claude/settings.json` present. Hooks live: `git stash push -m guard-test-should-be-blocked`
  was rejected by bash-guard ("commit work in progress on your own branch").
- Hook probe rule (Lex, 2026-10-16): probe with `git stash push -m probe`, never
  `git stash list`. `list`/`show` are allowed on purpose, so they prove nothing.
  `kit doctor` pipes the probe command as hook JSON into `bash-guard.sh` and expects
  exit 2. It never runs the probe itself, so a dead hook can't stash real work.
