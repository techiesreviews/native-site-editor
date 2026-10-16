---
title: "kit pr: open the PR, attach the review, and merge when checks pass"
type: task (AFK)
status: open
assignee:
blocked_by: [02-ci-pull-requests, 04-kit-wait, 05-kit-review, 09-kit-specs, 11-kit-deps]
builder: sol
---

## What

- Follow the kit layout in [the map](../../map.md#notes): one executable in `scripts/agents/kit.d/`, a `# kit: <summary>` line, `--help`, Node 24 and owner from `kit-lib`, one final `RESULT:` line, own test file.
- `kit pr [--base dev] [--title T] [--ticket FILE] [--no-merge]`: refuse on uncommitted changes, on `kit deps check` failure, or on a branch that is `dev`/`main`; fetch and rebase on `origin/<base>` (conflicts abort with the file list); run check, unit tests, lint, and `kit specs --affected`; push the branch; open the PR into `dev` (body: ticket title/path, summary from commits, test lines, `🤖 Generated with [Claude Code](https://claude.com/claude-code)` when Claude-authored); run `kit review --pr N` unless a review for this exact HEAD already exists in the evidence folder (then post that one); then either join the merge queue (`gh pr merge --auto` when the repo has a queue) or wait for checks with `kit wait ci --pr N` and merge with `gh pr merge --rebase --delete-branch`; on a "branch behind" refusal, rebase and retry up to 3 times.
- Refuse `--base main` unless `--release` is given (the release PR is Lex's call; it is opened, never merged by the kit).
- `land.sh` prints a one-line notice pointing to `kit pr` and keeps working for now.
- RESULT line: `RESULT: ok merged #N <sha>` or the failing step.

## Files

- `scripts/agents/kit.d/pr`
- `scripts/agents/land.sh`
- `tests/kit-pr.test.ts`

## Done when

- Unit tests with fake `gh`/`git` remotes in temp repos: refusals, PR body, review reuse, merge fallback, behind-retry, release guard.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
