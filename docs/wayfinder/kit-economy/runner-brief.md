# Runner brief: kit-economy build

The lead sends this with a ticket path and an owner id (`ke-NN`).

1. Read `docs/agents/runner.md`, then `docs/wayfinder/kit-economy/runner-extras.md`
   (it wins where they differ, including its economy rules), then your ticket and
   `docs/wayfinder/kit-economy/map.md`.
2. Setup: `git -C /home/ubulex/Projects/native-site-editor-build-ke-lead-tickets fetch -q origin`, then
   `ASE_OWNER=<owner> /home/ubulex/Projects/native-site-editor-build-ke-lead-tickets/scripts/agents/worktree.sh build/<owner>-<slug> origin/dev`
   (or the same `scripts/agents/worktree.sh` from any worktree on origin/dev).
   Work only in the returned worktree; use `git -C <worktree>` or guard every `cd` with `|| exit 1`.
   Run `scripts/agents/kit doctor` first and fix every ✗.
3. **Once ticket 04 has landed (tickets 05–09):** run the whole ticket with one job and wait once:
   `scripts/agents/kit bg slice-<NN> -- scripts/agents/kit slice --ticket <ticket> --builder sol --effort high`,
   then `scripts/agents/kit wait job slice-<NN> --timeout 2h` with `run_in_background: true`.
   On `RESULT: fail slice <phase>: …` read only the printed lines, fix what is yours to fix
   (never hand-edit for review findings), rerun the same `kit slice` (it resumes), and go to 8.
4. **Before ticket 04 (tickets 01–04):** write `.scratch/agent-brief.md` (ticket path, Files list,
   Done when, and "append `## Done (YYYY-MM-DD)`, set `status: closed`, `assignee: <owner>`") and
   run `scripts/agents/agent.sh build "$PWD" .scratch/agent-brief.md --model gpt-6.1-sol --effort high`
   in the background. Inspect the report and `git diff --stat`; stay inside the ticket's Files.
5. Validate with the ticket's focused unit files (`scripts/agents/unit.sh <files>`) and
   `npm run check` when types moved. Commit with
   `Co-Authored-By: GPT-6.1-Sol <noreply@openai.com>`.
6. Review: `scripts/agents/kit review --ticket <ticket>` in the background. Send findings back to the
   builder (`agent.sh --resume <out-dir>` with the findings; `kit fix` once ticket 03 has landed);
   commit, review again, until no open findings remain. Record declined findings with reasons.
7. Land: `scripts/agents/kit pr --ticket <ticket>` in the background. The merged PR is the finish line;
   once ticket 01 has landed, `kit pr` stops on open findings: go back to 6.
8. Clean up your servers, jobs and worktree (`git worktree remove` from outside it; keep the branch).
9. Report once, the seven-line report from runner.md, plus one line `dogfood: <command: helped/failed, why>`.
   Never end your turn with your own background job running.
