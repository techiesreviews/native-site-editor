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

- Start long jobs with `scripts/agents/kit bg <name> -- <command…>`; their group, records and log in `.scratch/kit-jobs/<name>/` survive app exit.
- Wait with `scripts/agents/kit wait job <name> --timeout 2h`. Claude runs them with `run_in_background: true`: one notice instead of many 9-minute check-ins.
  Codex runs them in the foreground or its background terminal. Timeout 124 means still running; wait again.
- `kit bg --list` shows state and log paths; `kit bg --stop <name>` stops only that group. Other owned processes, logs or CI: `scripts/agents/kit wait pid|output|ci`.
  Never look up pids with `ps | grep`; never write `until … sleep` or `pgrep -f` loops.
- **After an app restart**, reconnect with `kit bg --list` and `kit wait job <name>` first; `scripts/agents/kit status [map]` shows landed work and open PRs.
  `scripts/agents/agent.sh --resume <out-dir>` continues a builder; rerunning `kit pr --ticket <ticket>` reuses the open PR and saved review.

## Build and tests

Default for an editor ticket: start from a clean worktree, start one resumable job, then wait once:

```sh
scripts/agents/kit bg slice-<NN> -- scripts/agents/kit slice --ticket <ticket> --builder sol --effort high
scripts/agents/kit wait job slice-<NN> --timeout 2h
```

Claude waits with `run_in_background: true`. `kit slice` writes the brief, builds, commits with
model credit, reviews, runs up to three `kit fix` rounds, then lands through `kit pr`. Use the
build's selected builder; `sol` maps to `gpt-6.1-sol`. Its final RESULT names the PR and SHA or
failed phase; failure output is limited to 15 lines. Logs and state live under
`.scratch/kit-slice/<ticket-slug>/`. Rerun the same command after resolving a failed phase;
finished phases are retained, and a moved HEAD triggers another review. `--no-pr` stops after
a clean review; raising `--rounds` allows more fixes. Exhausted findings leave the PR unmerged.
A fresh slice refuses staged, unstaged or untracked changes before creating state. Retries retain
the builder's pending work. A queued slice with a moved local HEAD refuses `--no-pr`; its saved
queue remains available for a normal wait retry.

Manual fallback when `kit slice` cannot run:

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

The default `kit slice` path runs review and sends findings back through `kit fix`; the builder's
brief includes closing the ticket with a Done section, `status: closed` and its owner as assignee.
On failure inspect the printed digest and phase log, resolve the cause, then rerun `kit slice`.
Record any declined findings with reasons; open findings block landing.

Manual fallback: one Sol review: `scripts/agents/kit review --ticket <ticket>` in the background (evidence lands in the
main root `.scratch/reviews/<owner>/`; `kit pr` posts it on the PR). Verify findings, fix and commit
real defects; re-review once when fixes are substantial; record rejected findings with reasons.
Then, in the same branch: append `## Done (YYYY-MM-DD)` to the ticket (behaviour, commits, tests, review
decisions, evidence; details go there, not in the report), set `status: closed` and `assignee: <owner>`.

## Land

The default `kit slice` path calls `kit pr` after a clean review and reports the merged PR and SHA.
When `kit pr` queues the PR, the slice saves the queued head and waits for its actual merged SHA
(up to two hours per invocation); retries resume that wait without reopening or requeuing the PR.
It never passes `--waive`. For a failed landing, rerun the same slice; it resumes the PR phase.

Manual fallback:

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
