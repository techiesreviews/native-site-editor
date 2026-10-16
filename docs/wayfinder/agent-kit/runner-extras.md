# Runner extras: agent-kit build

Read with [runner.md](../../agents/runner.md). Where they differ, this file wins
for this build only. Ticket 24 folds the lasting rules into runner.md.

- **Files.** Touch only the files your ticket lists (plus its own new test
  file). Need another file? Stop and say so in `decide`.
- **No own subagents.** Do not start Agent/Task subagents or T3 delegated tasks.
  The builder CLI (`scripts/agents/agent.sh build`) is allowed.
- **No preview deploys.** Never run `deploy-preview.sh`, `npm run deploy:*` or
  wrangler. The lead deploys.
- **Never touch `main`** or production.
- **Finish line.** Finish with `scripts/agents/kit pr --ticket <ticket>` (proven on
  PR #1, 2026-10-16): it rebases, runs the checks and affected specs, opens the PR
  into `dev`, posts the Sol review, waits for CI and merges. The merged PR is the
  finish line. A spec that also fails on plain dev: say so in `decide` and stop.
- **Review.** Every change gets one Sol review through `scripts/agents/kit review`
  (evidence lands in the main root `.scratch/reviews/<owner>/` by itself); `kit pr`
  posts it on the PR.
- **Waiting.** Claude: `run_in_background: true` and wait for the notice. Never
  write `until … sleep` or `pgrep -f` loops.
- **Report once, at the end**, with the seven-line report. Never end your turn
  while your own background job is still running.
- **Screenshots.** At most one retake per scenario.
- **Ticket close.** Append `## Done (YYYY-MM-DD)` to your ticket, set
  `status: closed`, and land it with the work.
