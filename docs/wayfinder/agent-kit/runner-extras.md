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
- **Finish line.** Until `kit pr` lands (ticket 14), finish with
  `scripts/agents/land.sh` and `scripts/agents/ci-status.sh dev --wait`. After
  that, finish with `scripts/agents/kit pr`; the merged PR is the finish line.
- **Review.** Every change gets one Sol review through `scripts/agents/review.sh`
  (or `kit review` once ticket 05 lands). Copy the review folder to
  `/home/ubulex/Projects/native-site-editor/.scratch/reviews/<owner>/` so it
  outlives your worktree.
- **Waiting.** Claude: `run_in_background: true` and wait for the notice. Never
  write `until … sleep` or `pgrep -f` loops.
- **Report once, at the end**, with the seven-line report. Never end your turn
  while your own background job is still running.
- **Screenshots.** At most one retake per scenario.
- **Ticket close.** Append `## Done (YYYY-MM-DD)` to your ticket, set
  `status: closed`, and land it with the work.
