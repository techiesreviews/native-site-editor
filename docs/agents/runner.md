# Build slice runner

The steps one slice runs through, end to end. The lead starts each slice as its own T3 helper thread with the output of `scripts/agents/kit brief <ticket>` as its task ([the kitchen rulebook](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#5-hand-out),
step 4, Build and prove; `kit rulebook`); the helper builds, reviews and lands it from here, and a new helper continues a stuck slice the same way. Command options live in [agent-scripts.md](agent-scripts.md#kit)
and each `--help`. A build's own `runner-extras.md` (next to its map) wins where it differs.

## Rules

- **Files.** Touch only your ticket's Files (plus its own new test file); need another? Stop, say so in `decide`.
- **No own subagents** (Agent/Task or T3 delegated tasks); the builder CLI (`agent.sh build`) is allowed.
- **No preview deploys** (`kit preview`, `deploy-preview.sh`, `npm run deploy:*`, wrangler); the lead deploys.
- **Never touch `main`** or production. **The merged PR is the finish line** (`kit pr`, see Land).
- **Report once, at the end.** Finish the whole job in this turn; never end it while a job of yours runs (the kit's Stop hook refuses, where `kit init` has added it).
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

- A short check runs in the foreground. A long job (a review, a long `kit pr`, specs) runs as `scripts/agents/kit go <name> -- <command…>`: its own systemd scope, records and log in `.scratch/kit-jobs/<name>/`, a turn end or app exit does not stop it.
- `kit go` waits at most 9 minutes per call: give each call a 10-minute tool limit (Claude's Bash `timeout: 600000`). On `RUNNING: <name> (…). Run again: scripts/agents/kit go <name>` (exit 75) run that line again at once, in the foreground (Claude and Codex alike),
  until the job's RESULT line. Never wait in the background and post no progress between waits.
- `kit bg --list` shows state and log paths; `kit bg --stop <name>` stops only that group. Other owned processes, logs or CI: `scripts/agents/kit wait pid|output|ci`.
  Never look up pids with `ps | grep`; never write `until … sleep` or `pgrep -f` loops.
- **After an app restart**, reconnect with `kit bg --list` and `kit go <name>` first (`kit heartbeat` was cut on 2026-11-15: the Board drive schedule, a T3 `schedule_task` every 2 hours, checks the helper threads and restarts stalled work); `scripts/agents/kit ticket list` shows the cards and T3 the linked PRs and their checks (`kit status` was cut on 2026-11-14).
  `scripts/agents/agent.sh --resume <out-dir>` continues a builder; rerunning `kit pr --ticket <ticket>` reuses the open PR and saved review.

## Build and tests

- **Default:** the helper thread is the builder, on the pinned model (pins: [the kitchen rulebook](https://github.com/techiesreviews/agent-kit/blob/main/docs/kitchen.md#who-cooks-pins-from-2026-10-22)). From a clean worktree it builds, commits after each working step, runs the checks below, reviews (Review and close), fixes its own findings in its own thread and lands with `kit pr` (Land). `kit slice` and `kit fix` were cut on 2026-11-15 (TOOLS-235); each name only says where its job went.
- Another model than the helper's own (a ticket's `builder:` line): write `.scratch/agent-brief.md`
  with ticket path, Files list and acceptance, and run `scripts/agents/agent.sh build "$PWD" .scratch/agent-brief.md --model
  <model> --effort <effort>` under `kit go`. Inspect the report and diff; stay inside the ticket's Files; then commit.
- Add unit coverage for pure rules. While building, run `scripts/agents/kit unit --affected` (or `scripts/agents/unit.sh
  <files>`), `npm run check` when types moved, `scripts/agents/kit specs --affected` (or `kit specs <spec…>`; `full-suite.sh 3`
  only for shared plumbing). `kit pr` runs the full set scaled to the change; don't run it all yourself first. `KIT_BUILDER_TICKET=<ticket> scripts/agents/kit specs --affected` keeps at most 20 specs: named and direct ones when more are affected (`N more run in kit pr`). Rerun a
  failing spec once before calling it flaky; one that also fails on plain dev: say so in `decide` and stop. Read the digest; don't open results or error-context files.
- Credit whichever model built the change: `Co-Authored-By: <model name> <noreply@<vendor>>`
  (Sol: `GPT-6.1-Sol <noreply@openai.com>`; Claude: `Claude Opus 5.5 <noreply@anthropic.com>`).

## Screenshots

For visible changes: `scripts/agents/kit shots <screen…>` (or `--steps .scratch/<file>`; `--compare dev`
for before/after). View only the contact sheet(s) printed first (`contact.webp` or `contact-N.webp`, each ≤1600 × 2400 px and ≤300 KB) and layout findings; fix visible defects.
Open a single PNG only for a specific finding, never the same PNG twice. At most one retake per scenario. Raw Playwright scenarios (`--spec`): [20-line example](agent-scripts.md#screenshots). Every visible change gets `scripts/agents/kit ux` once it is built and the feature list is updated: it tries the touched features from [features.md](features.md) and has the UX reviewer judge them fine / looks off / broken; fix what it calls broken or looks off (or say why not) and quote its per-feature lines ([agent-scripts.md](agent-scripts.md#kit)). `kit pr` lands a visible change only with a passed `kit ux` result for the branch as it is now.

## Review and close

One Claude review per round, `scripts/agents/kit review --ticket <ticket>` under `kit go` (evidence: main root `.scratch/reviews/<owner>/`); `kit pr` takes the second look (the model order per review kind is set by `second-look.json` in the kit: GPT through Codex first since 2026-11-09, then Grok, then the free OpenCode model; GPT never for a docs-only change and once per PR; Claude Opus stays the main reviewer; findings weighed like Claude's; `second look: skipped (<reason>)` when none can run).
Verify findings, fix and commit real defects; re-review after substantial fixes (at most three fix rounds, five for a change `kit pr` calls risky: `kit rulebook`'s Review loop); put rejected findings with reasons in the report and the PR text. Defects carry severity after the location: P0 = data loss, security hole, broken build/tests or wholly broken change; P1 = wrong user/runner behaviour or a broken "Done when" item; P2 = minor real defect; P3 = cosmetic/style (validation gaps have no severity). After the severity each defect names one kind (`P2 fault:`, `P1 ticket:`, `P2 race:`, `P3 style:`); a missing kind is `unsorted`, which is recorded in `findings.json` but never blocks on its own. All findings block until three completed fix rounds, then only P0/P1 defects, defects without readable severity and unreadable reviews block; `kit pr` counts only the fix rounds saved before 2026-11-15, so a helper's own rounds are not counted yet and its open findings keep blocking until fixed or waived by id. Rounds used up with findings still open: stop with `landed: none` and `decide: waive <ids> (<reasons>)` for the lead, the declined findings already in the PR text. A Defects line that starts with no `path:line` location and names no P0–P3 is a note: it is counted in findings.json `notes`, never blocks and is left out of the open findings, so start every defect with its location. Then
append `## Done (YYYY-MM-DD)` to the ticket (behaviour, commits, tests, review decisions, evidence), set `status: closed`, `assignee: <owner>`. A `Commits:` line names commits by subject: `kit pr` rewrites its list (up to the first `.` or `;`; evidence after that stays) from the PR's commits before it pushes, as rebasing and the rebase merge change every SHA; the SHAs on the land branch come from its `landed: <sha> <subject>` lines after the merge (`not found on <land>: <subject>` when none matches). A rerun after a new commit adds another such ticket commit, and the line names the earlier one by subject, since it lands too.

## Land

- Editor slices (the helper itself, never with `--waive`): `scripts/agents/kit pr --ticket <ticket>` under `kit go`.
  It rebases, runs the checks for the change's tier (docs, css, tests or full; `--full` forces all), opens the PR into
  `dev`, posts the review, waits for CI and merges. After three completed fix rounds that `kit pr` counts (so far only rounds saved before 2026-11-15), non-blocking findings go in a PR comment/body and the ticket's Done `### Follow-ups` in a new commit before CI; that ticket-only commit retains review coverage. A visible change (`paths.visible` in `scripts/agents/kit.json`) stops unless it changed the `featureList` file (here `docs/agents/features.md`) or the ticket's Done says `Feature list: no change (<reason>)`. Lead-only `--waive "<reason>"` still overrides blockers and is recorded separately; slices never pass it. The merged PR is the finish line; put its number and merge SHA in your Report's `landed:` line, not in the ticket (`kit pr` prints its `landed:` lines). Fix CI failures you caused.
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
