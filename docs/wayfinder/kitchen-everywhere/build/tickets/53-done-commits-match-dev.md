---
title: "A ticket's Done names commits that can be found on dev"
type: task (AFK)
status: open
builder: claude
blocked_by: [35-follow-ups-line-endings-and-old-cuts]
---

## Goal

The Done "Commits:" line of slices 10, 13, 18, 32, 33, 39 and 49 names the SHAs of the PR branch before it landed, and none of them is on `dev` (slice 32: `e3914c714`, `a81f1741b`, `436754508`; its PR branch had `81d801cb8`, `0e3d17a0a`, `9aed1d9b2`, `2a56848f4`; `dev` has `5f64f4ec1`, `3430c3377`, `350023f74`, `b3bea4633`). Two rewrites cause it: `kit pr` rebases the branch (`kit.d/pr:251`), and it lands with `gh pr merge --rebase` (`kit.d/pr:524`, `:541`), and GitHub's rebase merge always writes new commits. The landed SHAs therefore exist only after the merge, and nothing the PR carries can name them; the follow-ups commit (`kit.d/pr:115`) is itself rewritten on landing.

## Decided behaviour

Lead to confirm (easy to undo):

- Inside the PR, the Done "Commits:" line names commits by subject, which survive both rewrites: `kit pr`, after its last rebase and before it pushes, rewrites that line from `git log --reverse --format=%s origin/<land>..HEAD` (the follow-ups commit named as "this commit"), so a builder's own SHAs never reach `dev`. A Done without a "Commits:" line gets none.
- After the merge, `kit pr` prints one `landed: <sha> <subject>` line per commit, matched by subject on `origin/<land>` (`git log --format='%h %s' <merge-base>..origin/<land>`), and its last `RESULT:` names the first and last landed SHA; the lead's close-out docs PR copies them from there.
- A subject that matches no commit on `origin/<land>` after the merge is named in the report (`not found on <land>: <subject>`), not guessed.

## Files

- `scripts/agents/kit.d/pr`
- `tests/kit-pr.test.ts`
- `docs/agents/runner.md` (line 67: the commits are subjects; the SHAs come from `kit pr`'s `landed:` lines)

## Done when

- Tests in `tests/kit-pr.test.ts`, each failing before the fix: a ticket whose Done "Commits:" names branch SHAs is pushed with those subjects instead; after a (faked) rebase merge that rewrites every commit, `kit pr` prints a `landed:` line for each with the new SHA; a subject missing on the land branch gives the `not found` line.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit, tests and one runner line.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke53 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/53-done-commits-match-dev.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke53 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, a `landed:` block from a real `kit pr`, review decisions, PR and merge SHA.
