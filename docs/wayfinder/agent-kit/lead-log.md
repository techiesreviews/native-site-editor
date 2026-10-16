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
- ak-21 landed 088eacdd (Sol clean); helper found Files adding stale "Added …" → ticket 26 (after 17, before 18).
- ak-23 landed 53bfbdec: all 6 known-failure entries pass 5/5, registry empty; suite-summary reads ASE_KNOWN_FAILURES (doc it in 24).
- ak-01 landed 8efa8316 (Sol clean). Wave 2 running: ak-05, ak-06, ak-03, ak-04 (+ ak-17 from wave 1).
- ak-05 landed 163143ca (Sol: 0 fixed, 1 rejected). Runner brief now uses kit review.
- ak-03 landed 3f6a7c7f. Decision (lead): keep doctor's 24 h allowance for branches behind origin/dev (strict would block reviews after every parallel landing; kit pr rebases anyway). Started ak-11.
- ak-06 landed d3d79da6 (13 screens ok at 390 light; webp 8–24 KB). Started ak-08.
- ak-04 landed ad457ef9. Lead decisions: pgrep -f blocked only in loops (keeps old allowed cases); retry loops with sleep blocked (accepted).
  Lead fix later in scripts/agents/kit: treat `--help` anywhere in args as help (no RESULT), and bare `kit` prints a RESULT line.
- Started ak-07.
- Lead fix landed: kit --help after a subcommand (Sol clean). Bare kit stays help-only (no RESULT), per ticket 01's tests.
- ak-09 landed 09cf14fd (5 review fixes). ak-17 landed 54471759 (media-kind table).
- Flake: tests/media-files-adding-runs-await-race.test.ts fails under load → folded into ak-26 (started).
