# Build slice runner

Run one slice end to end. The lead supplies the ticket and build map.

## Sources

- Read your ticket's What, Done when, `builder`, blockers and linked spec/decisions.
- Read the build map's spec, `CONTEXT.md`, `CODING_STANDARDS.md` and
  [local-testing.md](local-testing.md); find code through [code-map.md](code-map.md).
- Read named prototype branches as primary sources; adapt their ideas to the spec.
- Hooks and their enforced rules: [guardrails.md](guardrails.md).

## Setup

- Fetch from the dev worktree, then use `scripts/agents/worktree.sh build/<slice>-<slug> origin/dev`.
  Work only in the returned worktree. Set `ASE_OWNER` to your thread identifier.
- Node PATH comes from SessionStart: Claude sets it; Codex and other CLIs receive an export instruction.
- Starter slices use a separate starter worktree based on `origin/dev`; its integration branch is `dev`.
- Prototypes live on `prototype/<slug>` branches in their own worktree and never land on dev.

## Waiting

Claude: run long Bash jobs with `run_in_background: true`; wait for the completion notice.
Codex: run in the foreground or its background terminal; wait for the command to exit.
This applies to builds, full suites and reviews. Helpers stay in the foreground within the command.

## Build and tests

- Implement with the ticket's selected model, or write `.scratch/agent-brief.md` with
  ticket/spec/file pointers and acceptance criteria. Run
  `scripts/agents/agent.sh build "$PWD" .scratch/agent-brief.md --model <model> --effort medium`.
  CLI is inferred; `--cli` overrides it. Legacy `builder: sol` uses the default model;
  `builder: claude` means implement directly. Inspect the report and diff; fix defects, then commit.
- Add unit coverage for pure rules. Run `npm run check`, `scripts/agents/unit.sh` and `npm run lint`.
  `unit.sh <files...>` selects unit files; full logs stay in `.scratch/unit/`.
- Run touched browser specs through `scripts/agents/port.sh`; select their fixture group
  as described in local-testing.md. Run `scripts/agents/full-suite.sh 3` only for shared plumbing.
  Compare failures with `tests/known-failures.json`; rerun once before calling a new failure flaky.
- Credit whichever model built the change: `Co-Authored-By: <model name> <noreply@<vendor>>`
  (OpenAI: `openai.com`; Anthropic: `anthropic.com`).

## Review

- Generate `.scratch/review-brief.md` with
  `scripts/agents/review-brief.sh <ticket-file> origin/dev > .scratch/review-brief.md`.
- Run `scripts/agents/review.sh "$PWD" .scratch/review-brief.md .scratch/review`; follow Waiting above.
  Read `.scratch/review/result.md`, verify findings, fix real defects and commit fixes.
  Re-review once when fixes are substantial; record rejected findings with reasons.
- Close the ticket in the same branch and append `## Done (YYYY-MM-DD)`:
  behavior, commits, tests, review decisions and evidence. Put details there, outside the lead report.

## Land and preview

- Editor slices: `scripts/agents/land.sh`, then `scripts/agents/ci-status.sh dev --wait`; follow Waiting above.
  Fix CI failures from your landing. Deploy when needed with `scripts/agents/deploy-preview.sh`.
  Record the landed SHA and preview version id. Options and logs: [agent-scripts.md](agent-scripts.md).
- Starter slices: rebase on `origin/dev` and push `HEAD:dev` under
  `flock /tmp/cb-starter-merge.lock`; rerun touched tests after overlapping upstream changes.
- Prototypes finish with their branch and evidence; skip landing and deployment.

## Screenshots

- For visible changes, write a Playwright scenario under `.scratch/`, using the
  [20-line example](agent-scripts.md#screenshots). Run
  `scripts/agents/shots.sh /home/ubulex/Projects/native-site-editor/.scratch/shots/<slice>/ <scenario.spec.ts>`.
  The helper serves the real starter over fake GitHub on a locked slot and stops its server.
  Inspect the PNGs and correct visible defects. `ASE_NATIVE_SAVE_FIXTURE` overrides the starter path.

## Cleanup

- Stop servers and jobs you own by PID. Inspect `scripts/agents/reap.sh --dry-run` before reaping orphans.
- From outside the worktree, `git worktree remove <worktree>`; keep the branch. Delete your temporary files.

## Report

At most 8 lines / 120 words. Use these seven lines; use `none` where absent.
If blocked, state the blocker in `decide` and leave `landed` as `none`.

```text
slice: <ticket / slice>
landed: <sha or none>
preview: <version id or none>
tests: <added; ran; result>
review: fixed <n>; rejected <n> (<one-line reasons>)
shots: <dir or none>
decide: <lead decision / blocker, or none>
```
