# Build slice runner

Run one slice end to end. The lead supplies the ticket and build map. This file gives the order of
steps; command options live in [agent-scripts.md](agent-scripts.md#kit) and each `--help`. A build's
own `runner-extras.md` (next to its map) wins where it differs.

## Rules

- **Files.** Touch only your ticket's Files (plus its own new test file); need another? Stop, say so in `decide`.
- **No own subagents** (Agent/Task or T3 delegated tasks); the builder CLI (`agent.sh build`) is allowed.
- **No preview deploys** (`kit preview`, `deploy-preview.sh`, `npm run deploy:*`, wrangler); the lead deploys.
- **Never touch `main`** or production. **The merged PR is the finish line** (`kit pr`, see Land).
- **Report once, at the end.** Never end your turn while your own background job still runs.

## Sources

- Read your ticket (What, Files, Done when, `builder`, blockers, linked spec), the build map, its
  `runner-extras.md`, `CONTEXT.md`, `CODING_STANDARDS.md` and [local-testing.md](local-testing.md);
  find code through [code-map.md](code-map.md).
- Read named prototype branches as primary sources; adapt their ideas. Hooks: [guardrails.md](guardrails.md).

## Setup

- `git -C <dev worktree> fetch -q origin`, then
  `ASE_OWNER=<owner> scripts/agents/worktree.sh build/<owner>-<slug> origin/dev`.
  Work only in the returned worktree; use `git -C <worktree>` or guard every `cd` with `|| exit 1`.
- Run `scripts/agents/kit doctor` first and fix every ✗. Node PATH comes from SessionStart (Claude sets it;
  other CLIs get an export instruction).
- Starter slices use a starter worktree on `origin/dev` (integration branch `dev`). Prototypes live on
  `prototype/<slug>` branches in their own worktree and never land on dev.

## Waiting

- Long jobs (`agent.sh build`, `kit review`, `kit pr`, `kit specs`, full suites): Claude runs them with
  `run_in_background: true` and waits for the notice; Codex runs them in the foreground or its background terminal.
- To wait on your own job, process, log or CI run, use `scripts/agents/kit wait pid|output|ci`.
  Never write `until … sleep` or `pgrep -f` loops; the Bash hook rejects them.
- **After an app restart** your jobs are gone: `scripts/agents/kit status [map]` shows what landed and which
  PRs are open; `scripts/agents/agent.sh --resume <out-dir>` continues a builder run (or waits on a live one);
  rerunning `kit pr --ticket <ticket>` finishes a landing, reusing the open PR and the saved review.

## Build and tests

- `builder: claude`: implement directly. `builder: sol` (or another model): write
  `.scratch/agent-brief.md` with ticket path, Files list and acceptance, and run
  `scripts/agents/agent.sh build "$PWD" .scratch/agent-brief.md --model <model> --effort <effort>`
  in the background. Inspect the report and diff; stay inside the ticket's Files; fix defects, then commit.
- Add unit coverage for pure rules. While building, run focused checks for what you changed: `scripts/agents/unit.sh
  <files>`, `npm run check` when types moved, `scripts/agents/kit specs --affected` (or `kit specs <spec…>`; `full-suite.sh 3`
  only for shared plumbing). `kit pr` runs the full set scaled to the change; don't run it all yourself first. Rerun a
  failing spec once before calling it flaky; one that also fails on plain dev: say so in `decide` and stop.
- Credit whichever model built the change: `Co-Authored-By: <model name> <noreply@<vendor>>`
  (Sol: `GPT-6.1-Sol <noreply@openai.com>`; Claude: `Claude Opus 5.5 <noreply@anthropic.com>`).

## Screenshots

For visible changes: `scripts/agents/kit shots <screen…>` (or `--steps .scratch/<file>`; `--compare dev`
for before/after). Inspect the contact sheet and layout findings; fix visible defects. At most one
retake per scenario. Raw Playwright scenarios (`--spec`): [20-line example](agent-scripts.md#screenshots).

## Review and close

One Sol review: `scripts/agents/kit review --ticket <ticket>` in the background (evidence lands in the
main root `.scratch/reviews/<owner>/`; `kit pr` posts it on the PR). Verify findings, fix and commit
real defects; re-review once when fixes are substantial; record rejected findings with reasons.
Then, in the same branch: append `## Done (YYYY-MM-DD)` to the ticket (behaviour, commits, tests, review
decisions, evidence; details go there, not in the report), set `status: closed` and `assignee: <owner>`.

## Land

- Editor slices: `scripts/agents/kit pr --ticket <ticket>` in the background. It rebases, runs the checks for the
  change's tier (docs, css, tests or full; `--full` forces all), opens the PR into `dev`, posts the review, waits for CI
  and merges. The merged PR is the finish line; put its number in `landed:`. Fix CI failures you caused.
- Starter slices: rebase on `origin/dev` and push `HEAD:dev` under
  `flock /tmp/cb-starter-merge.lock`; rerun touched tests after overlapping upstream changes.
- Prototypes finish with their branch and evidence; skip landing.

## Cleanup

- Stop servers and jobs you own by PID. Inspect `scripts/agents/reap.sh --dry-run` before reaping orphans.
- From outside the worktree, `git worktree remove <worktree>`; keep the branch. Delete your temporary files.

## Report

At most 8 lines / 120 words: these seven lines, `none` where absent. Blocked: say why in `decide`, `landed: none`.

```text
slice: <ticket / slice>
landed: <PR #n and merge sha, or none>
preview: <version id or none>
tests: <added; ran; result>
review: fixed <n>; rejected <n> (<one-line reasons>)
shots: <dir or none>
decide: <lead decision / blocker, or none>
```
