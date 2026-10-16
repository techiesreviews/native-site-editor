---
title: "kit pr: open the PR, attach the review, and merge when checks pass"
type: task (AFK)
status: closed
assignee: ak-14
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

## Done (2026-10-16)

- **Behaviour.** `scripts/agents/kit pr [--base dev] [--title T] [--ticket FILE] [--no-merge] [--dry-run] [--release]`:
  guards (detached HEAD, `dev`/`main`/base branch, dirty tree, `--base main` without `--release`),
  `kit deps check`, fetch + rebase on `origin/<base>` (conflicts abort with the file list), `npm run check`,
  `npm test`, `npm run lint`, `kit specs --affected`; PR body with ticket, commit summary, test lines and the
  Claude Code line when `CLAUDECODE=1` or a commit has a Claude co-author. `--dry-run` stops before pushing.
  Pushes with an explicit lease, opens or reuses the PR, posts a saved review only when it is complete and
  covers this exact HEAD and merge base (else runs `kit review --pr N`), then `kit wait ci --pr N` and
  `gh pr merge --rebase --delete-branch --match-head-commit <sha> --repo <owner/name>` (merge queue:
  `--auto`). "Behind" refusals rebase and retry up to 3 merges; a head changed by someone else stops.
  `--release` opens, never merges. `land.sh` prints a notice pointing to `kit pr`.
- **Commits.** 6f7ea1b8 (build, Sol), ed1346be and c2170ca2 (review fixes).
- **Tests.** `tests/kit-pr.test.ts`, 21 tests with fake `gh`/`npm`/kit and real git against a bare origin.
  check, lint, unit 3789/3789 pass. Dry-run on this branch: every local step ok, nothing pushed,
  `RESULT: ok dry-run 6f7ea1b build/ak-14-kit-pr -> dev`.
- **Review** (`.scratch/reviews/ak-14/` in the main root). 20261016T131905Z: fixed 3 (incomplete review reused;
  single-commit review reused for the whole PR; merge not pinned to the reviewed head).
  20261016T132343Z: fixed 1 (first push leased against refs refreshed by our own fetch); rejected 1
  (re-review after each behind-rebase: a clean rebase replays reviewed commits, conflicts abort, CI reruns
  on the new head; the ticket asks one review per PR).
- **Not run for real.** No PR was opened; ticket 24 runs the first real `kit pr`.
