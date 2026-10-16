# Runner brief: agent-kit build

The lead sends this with a ticket path and an owner id (`ak-NN`).

1. Read `docs/agents/runner.md`, then `docs/wayfinder/agent-kit/runner-extras.md`
   (it wins where they differ), then your ticket and `docs/wayfinder/agent-kit/map.md`.
2. Setup: `git -C /home/ubulex/Projects/native-site-editor-build-agent-kit fetch -q origin`, then
   `ASE_OWNER=<owner> /home/ubulex/Projects/native-site-editor-build-agent-kit/scripts/agents/worktree.sh build/<owner>-<slug> origin/dev`.
   Work only in the returned worktree; use `git -C <worktree>` or guard every `cd` with `|| exit 1`.
   Once `scripts/agents/kit` exists on origin/dev, run `scripts/agents/kit doctor` first.
3. Build with the ticket's `builder`: `sol` → write `.scratch/agent-brief.md` (ticket path, files list,
   acceptance) and run `scripts/agents/agent.sh build "$PWD" .scratch/agent-brief.md --model gpt-6.1-sol --effort high`
   in the background; `claude` → implement yourself. Inspect the diff; stay inside the ticket's Files.
4. Validate: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, the touched specs through
   `scripts/agents/port.sh`. Commit with the builder's Co-Authored-By line
   (Sol: `Co-Authored-By: GPT-6.1-Sol <noreply@openai.com>`; Claude: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
5. Review: one Sol review (`review-brief.sh` + `review.sh`, or `kit review` once it exists). Fix real
   defects; re-review once if fixes are substantial. Copy the review folder to
   `/home/ubulex/Projects/native-site-editor/.scratch/reviews/<owner>/`.
6. Close the ticket (`## Done (YYYY-MM-DD)`, `status: closed`, `assignee: <owner>`) in the same branch.
7. Land: `scripts/agents/land.sh` then `scripts/agents/ci-status.sh dev --wait` (both in the background),
   or `scripts/agents/kit pr` once ticket 14 is on dev. Fix CI failures you caused.
8. Clean up your servers and worktree (`git worktree remove` from outside it; keep the branch).
9. Report once, the seven-line report from runner.md. Never end your turn with your own background job running.
