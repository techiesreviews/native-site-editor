# Build slice runner

The steps one slice runs through, end to end. The lead starts each slice as its own T3 thread ([kitchen.md](kitchen.md),
station 5) with the brief in station 5; a helper continues a stuck slice from here. Command options live in [agent-scripts.md](agent-scripts.md#kit)
and each `--help`. A build's own `runner-extras.md` (next to its map) wins where it differs.

## Rules

- **Files.** Touch only your ticket's Files (plus its own new test file); need another? Stop, say so in `decide`.
- **No own subagents** (Agent/Task or T3 delegated tasks); the builder CLI (`agent.sh build`) is allowed.
- **No preview deploys** (`kit preview`, `deploy-preview.sh`, `npm run deploy:*`, wrangler); the lead deploys.
- **Never touch `main`** or production. **The merged PR is the finish line** (`kit pr`, see Land).
- **Report once, at the end.** Never end your turn while your own background job still runs (it dies with the turn).
- **Your PR is your thread's:** link it (T3 `link_pull_request`) once `kit pr` opens it; T3 settles your thread on merge.

## Sources

- Read your ticket (What, Files, Done when, `builder`, blockers, linked spec), the build map, its
  `runner-extras.md`, `CONTEXT.md`, `CODING_STANDARDS.md` and [local-testing.md](local-testing.md);
  find code through [code-map.md](code-map.md).
- Read named prototype branches as primary sources; adapt their ideas. Hooks: [guardrails.md](guardrails.md).

## Setup

- In a T3 child thread your checkout is the build worktree: `git fetch -q origin && git switch -c build/<owner>-<slug> origin/dev`.
  Elsewhere: `ASE_OWNER=<owner> scripts/agents/worktree.sh build/<owner>-<slug> origin/dev`. Use `git -C` or `cd … || exit 1`.
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
- **After an app restart**, reconnect with `kit bg --list` and `kit wait job <name>` first (the lead then runs `kit heartbeat <map>`, its 30-minute check-in: [kitchen.md station 5](kitchen.md#5-hand-out)); `scripts/agents/kit status [map]` shows landed work and open PRs.
  `scripts/agents/agent.sh --resume <out-dir>` continues a builder; rerunning `kit pr --ticket <ticket>` reuses the open PR and saved review.

## Build and tests

- **Default:** from a clean worktree, `scripts/agents/kit bg slice-<NN> -- scripts/agents/kit slice --ticket <ticket> --builder claude-opus-5-5`
  with `ASE_REVIEW_MODEL=claude-opus-5-5` (pins: [kitchen.md](kitchen.md#who-cooks-pins-from-2026-10-22)), then `kit wait job slice-<NN> --timeout 2h` (brief, build, commit, review, ≤3 `kit fix` rounds, `kit pr`; a rerun resumes). Every open finding blocks before three completed rounds; afterwards P2/P3 defects and validation gaps proceed as follow-ups, while P0/P1 defects, defects without readable severity and unreadable reviews leave the PR unmerged. A covering review survives ticket-only commits on resume.
- Manual fallback: `builder: claude`: implement directly. Another model: write `.scratch/agent-brief.md`
  with ticket path, Files list and acceptance, and run `scripts/agents/agent.sh build "$PWD" .scratch/agent-brief.md --model
  <model> --effort <effort>` in the background. Inspect the report and diff; stay inside the ticket's Files; then commit.
- Add unit coverage for pure rules. While building, run `scripts/agents/kit unit --affected` (or `scripts/agents/unit.sh
  <files>`), `npm run check` when types moved, `scripts/agents/kit specs --affected` (or `kit specs <spec…>`; `full-suite.sh 3`
  only for shared plumbing). `kit pr` runs the full set scaled to the change; don't run it all yourself first. Rerun a
  failing spec once before calling it flaky; one that also fails on plain dev: say so in `decide` and stop. Read the digest; don't open results or error-context files.
- Credit whichever model built the change: `Co-Authored-By: <model name> <noreply@<vendor>>`
  (Sol: `GPT-6.1-Sol <noreply@openai.com>`; Claude: `Claude Opus 5.5 <noreply@anthropic.com>`).

## Screenshots

For visible changes: `scripts/agents/kit shots <screen…>` (or `--steps .scratch/<file>`; `--compare dev`
for before/after). View only the contact sheet(s) printed first (`contact.webp` or `contact-N.webp`, each ≤1600 × 2400 px and ≤300 KB) and layout findings; fix visible defects.
Open a single PNG only for a specific finding, never the same PNG twice. At most one retake per scenario. Raw Playwright scenarios (`--spec`): [20-line example](agent-scripts.md#screenshots). `kit slice` runs `scripts/agents/kit ux` for every visible change: it tries the touched features from [features.md](features.md) and has the UX reviewer judge them fine / looks off / broken; outside a slice run it yourself and quote its per-feature lines ([agent-scripts.md](agent-scripts.md#kit)).

## Review and close

`kit slice` reviews, runs `kit fix` rounds, takes the second look (Grok or a free OpenCode model per review kind, findings weighed like Claude's; `second look: skipped (<reason>)` when none can run) and has the builder close the ticket. Manual fallback: one Claude review,
`scripts/agents/kit review --ticket <ticket>` in the background (evidence: main root `.scratch/reviews/<owner>/`). Verify
findings, fix and commit real defects; re-review after substantial fixes; record rejected findings with reasons. Defects carry severity after the location: P0 = data loss, security hole, broken build/tests or wholly broken change; P1 = wrong user/runner behaviour or a broken "Done when" item; P2 = minor real defect; P3 = cosmetic/style (validation gaps have no severity). After the severity each defect names one kind (`P2 fault:`, `P1 ticket:`, `P2 race:`, `P3 style:`); a missing kind is `unsorted`, which is recorded in `findings.json` but never blocks on its own. All findings block until three completed fix rounds, then only P0/P1 defects, defects without readable severity and unreadable reviews block. A Defects line that starts with no `path:line` location and names no P0–P3 is a note: it is counted in findings.json `notes`, never blocks and is left out of the `kit fix` open-findings list, so start every defect with its location. Then
append `## Done (YYYY-MM-DD)` to the ticket (behaviour, commits, tests, review decisions, evidence), set `status: closed`, `assignee: <owner>`.

## Land

- Editor slices (`kit slice` does this, never with `--waive`): `scripts/agents/kit pr --ticket <ticket>` in the background.
  It rebases, runs the checks for the change's tier (docs, css, tests or full; `--full` forces all), opens the PR into
  `dev`, posts the review, waits for CI and merges. After three completed fix rounds, non-blocking findings go in a PR comment/body and the ticket's Done `### Follow-ups` in a new commit before CI; that ticket-only commit retains review coverage. A visible change (`paths.visible` in `scripts/agents/kit.json`) stops unless it changed the `featureList` file (here `docs/agents/features.md`) or the ticket's Done says `Feature list: no change (<reason>)`. Lead-only `--waive "<reason>"` still overrides blockers and is recorded separately; slices never pass it. The merged PR is the finish line; put its number and merge SHA in your Report's `landed:` line, not in the ticket (`scripts/agents/kit status [map]` shows each ticket's landing). Fix CI failures you caused.
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
