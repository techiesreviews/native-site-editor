# Agent kit build: lead log

## 2026-10-16 start-up check

- Worktree `native-site-editor-build-agent-kit`, branch `build/agent-kit`, HEAD = `origin/dev` (aa1d7f2a).
- `.claude/settings.json` present. Hooks live: `git stash push -m guard-test-should-be-blocked`
  was rejected by bash-guard ("commit work in progress on your own branch").
- Hook probe rule (Lex, 2026-10-16): probe with `git stash push -m probe`, never
  `git stash list`. `list`/`show` are allowed on purpose, so they prove nothing.
  `kit doctor` pipes the probe command as hook JSON into `bash-guard.sh` and expects
  exit 2. It never runs the probe itself, so a dead hook can't stash real work.

## 2026-10-16 plan

- 25 tickets landed with the map (846147f9 on build/agent-kit). Runner prompt: `runner-brief.md`.
- Facts: personal-account repo (no merge queue); CI never deploys the preview (no
  CLOUDFLARE_API_TOKEN secret); main is an ancestor of dev.
- Ticket 16 → free worker (opencode longcat-2.5-preview-free, T3 task `ak-16-attempt-1`, worktree isolation).
- Plan landed on dev 846147f9. Wave 1 runners (Claude, driving Sol): ak-01, ak-02, ak-17, ak-21, ak-23.
- ak-16 landed (free worker, 1 attempt; Sol: 0 defects, 2 gaps fixed by lead).
- ak-02 landed 6f0f0e71 (Sol clean). CI workflow appears in GitHub's list only after the first PR into dev.
- ak-01 landed 8efa8316. Lead check: `kit` lists commands, unknown → RESULT fail exit 2, `kit version --help` ok. Note for 24: bare `kit` prints no RESULT line.
- Wave 2: ak-05 started.
