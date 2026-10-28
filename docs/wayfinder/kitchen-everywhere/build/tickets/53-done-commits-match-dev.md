---
title: "A ticket's Done names commits that can be found on dev"
type: task (AFK)
status: closed
assignee: ke-53
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

## Comments

- Lead, 2026-10-28: take the default: inside the PR the Done list names commits by title; after the merge `kit pr` prints the landed SHAs for the close-out. Easy to undo; listed in the Tuesday pack.

## Done (2026-10-28)

- Behaviour: after each rebase and before it pushes, `kit pr --ticket` rewrites the last Done's `Commits:` line (with any lines continuing it) to name the PR's commits by subject, in order, ending with "this commit"; kit's own ticket commits (`docs: <ticket> commits by subject`, `docs: <ticket> follow-ups from review`) are never listed by subject. The rewrite goes in a ticket-only `docs: <ticket> commits by subject` commit; a rerun that finds the line already named adds none, and a Done without the line, a `--dry-run` and a `--release` get none. A clean review saved before that commit is still reused after a rebase onto a moved base (the patch is also compared without kit's trailing ticket-only commits).
- After the merge, `kit pr` fetches the land branch and prints `landed: <sha> <subject>` for each PR commit, matched by subject from the merge base to `origin/<land>`, or `not found on <land>: <subject>`; a failed lookup prints `landed: not checked (<reason>)` and the merge still counts. The first and last `landed:` lines give the range. The final `RESULT: ok merged #N <sha>` keeps its shape (the merge SHA, which is the last landed commit), as `kit slice` reads it with an anchored match.
- `docs/agents/runner.md`: the `Commits:` line names subjects; SHAs come from the `landed:` lines.
- Tests (`tests/kit-pr.test.ts`, each failing before the fix): a Done naming branch SHAs is pushed naming the subjects in a ticket-only commit (rerun adds none, a Done without the line is untouched); a review saved before the subjects commit is reused after the base moves; after a faked rebase merge that rewrites every commit, a `landed:` line per commit with its new SHA, and `not found on dev: Second change` when that commit landed under another subject.
- Validation: `scripts/agents/kit doctor` → `RESULT: ok doctor 11/11 checks passed`; `scripts/agents/kit unit --affected` → `RESULT: ok unit 125/125 (1 files)`; `npm run lint` and `npm run check` exit 0.
- Commits: the build commit; `kit pr` names them by subject before it pushes.
- Feature list: no change (agent kit plumbing; nothing a user of the editor sees).
