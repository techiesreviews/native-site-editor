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

- Behaviour: after each rebase and before it pushes, `kit pr --ticket` rewrites the last Done's `Commits:` line to name the PR's commits by subject, in order, ending with "this commit", in a ticket-only `docs: <ticket> commits by subject` commit. It runs without a pause from capturing HEAD to the commit, and stops (`worktree changed before naming commits`) when the branch, HEAD or a clean worktree differ from what it captured, so a ticket edited during the fetch or rebase never enters kit's commit. Only the list is replaced: it runs from the label, which stays as written (`**Commits on dev**:`), over the lines indented under it, sub-items included, to its first `.` or `;` outside brackets, quotes and code. Text after that (evidence, a note) and every line not indented under it (a plain `Tests:` line, a numbered item) stay; a CRLF ticket keeps CRLF. If the commit is refused (a `commit-msg` hook, signing), the ticket is put back as it was and `kit pr` fails at the `commits` step, so a rerun is not stopped by kit's own change. When the follow-ups commit is written, it rewrites the line too, naming every commit before it (the subjects commit included) and itself as "this commit". "This commit" is whichever of kit's two ticket commits last wrote the line, so a rerun or a behind retry adds no commit; a rerun after a new commit adds a second subjects commit and names the first by subject, since it lands too (also in `docs/agents/runner.md`). A Done without the line, a `--dry-run` and a `--release` get none. A clean review saved before these commits is still reused after a rebase onto a moved base: the patch is also compared without kit's trailing ticket-only commits.
- After the merge, `kit pr` fetches the land branch and walks back from the merge commit GitHub names. The PR's commits are the last ones up to it, compared with the PR's subjects in order. Each match prints `landed: <sha> <subject>`, and each mismatch prints `not found on <land>: <subject>`, so another PR's commit with the same subject is never named. If GitHub names no merge commit, or the lookup fails, it prints `landed: not checked (<reason>)` and the merge still counts. The first and last `landed:` lines give the range. The final `RESULT: ok merged #N <sha>` keeps its shape (the merge SHA, which is the last landed commit), because `kit slice` reads it with a match anchored at the end of the line (`kit.d/slice:485`), which allows nothing after the SHA.
- `docs/agents/runner.md`: the `Commits:` line names subjects; SHAs come from the `landed:` lines.
- Tests (`tests/kit-pr.test.ts`): a Done naming branch SHAs is pushed naming the subjects in a ticket-only commit (rerun adds none, a Done without the line is untouched); a review saved before the subjects commit is reused after the base moves; after a faked rebase merge that rewrites every commit, a `landed:` line per commit with its new SHA, `not found on dev: Second change` when that commit landed under another subject, and the PR's own SHA when another PR's "Second change" landed just before; `landed: not checked` with no usable merge commit; a plain line and a numbered item after `**Commits:**` survive; a behind retry keeps a single subjects commit and reuses the review; a follow-ups commit names the subjects commit and becomes "this commit", and a rerun adds nothing; a CRLF ticket's continuation lines are replaced with CRLF kept; a ticket edited by a `post-rewrite` hook during the rebase stops `kit pr` with no subjects commit and the edit in no commit; a rerun after a fix commit names the earlier subjects commit; text after the list (`. Evidence: …`, `; the round-2 fixes …`), the label and indented sub-items are handled as above, and a rerun adds nothing; a `--dry-run` and a `--release` leave HEAD and the ticket alone; a commit with kit's subject that also changes `file.txt` is not left out of the patch, so a fresh review runs; a `commit-msg` hook that refuses the subjects commit fails at `commits` with a clean worktree. All but the behind-retry, fix-commit rerun, dry-run/release and kit-subject review tests (which pin behaviour that already held) fail on the code before the fix.
- Validation: `scripts/agents/kit doctor` → `RESULT: ok doctor 11/11 checks passed`; `scripts/agents/kit unit --affected` → `RESULT: ok unit 136/136 (1 files)`; `npm run lint` and `npm run check` exit 0.
- Commits: "A ticket's Done names commits that can be found on dev", "Review fixes round 1", "Review fixes round 2", "Review fixes round 3", "docs: 53-done-commits-match-dev commits by subject", "docs: keep runner guide within its 96-line cap", "docs: 53-done-commits-match-dev commits by subject" and this commit; `kit pr` names them by subject before it pushes.
- Feature list: no change (agent kit plumbing; nothing a user of the editor sees).

### Follow-ups

- Spec (P3): 4073fb57c:scripts/agents/kit.d/pr:739 — P3 ticket: The ticket's Decided behaviour (53-done-commits-match-dev.md:19) says the last `RESULT:` "names the first and last landed SHA". The code still prints `RESULT: ok merged #N <merge-sha>`. The Done (ticket line 48) explains why: `kit.d/slice:485` matches the line with a pattern anchored at the end. But the lead only confirmed "prints the landed SHAs" and was never asked to drop the RESULT part. Fix: either add a Comments entry asking the lead to approve the narrower behaviour (Tuesday pack), or change both sides together, for example `RESULT: ok merged #N <sha> (landed <first>..<last>)` with `slice:485` relaxed to `([a-f\d]{7,40})(?: \(landed [^)]*\))?$`.
- Standards (P2): 4073fb57c:scripts/agents/kit.d/pr:211 — P2 fault: Subjects are wrapped in `"` without escaping, but `listEnd` (pr:183-187) treats `"` as a quote toggle. Take a subject like `Add "Change URL. Now" button`. It is written as `"Add "Change URL. Now" button"`, so `Change URL. Now` sits outside any quote. On the next run `listEnd` cuts at that `. `, and `commitsBySubject` appends the old tail (`. Now" button" and this commit.`) after the new list. The idempotence check at pr:390 then fails, so every rerun or behind retry adds another subjects commit and the line keeps growing. A subject with an odd number of `"` does the reverse: the quote never closes, `cut` is -1, and the evidence after the list (`; …`, `. Evidence: …`) is dropped. Fix: make the names unable to clash with `listEnd`. Either swap `"` inside a subject for `'` (or `“”`) before quoting, or have `commitsBySubject` first check whether `body` starts with the exact list it would generate and cut right after it. Standard: none of CODING_STANDARDS.md's sections covers kit scripts, so this is graded as a behaviour fault, not a rule breach.
- Standards (P2): 4073fb57c:scripts/agents/kit.d/pr:387-391 — P2 fault: `nameCommits` rewrites the last Done's `Commits:` line whenever `--ticket` is passed. It never checks that this PR added or changed that Done. A later `kit pr --ticket <closed ticket>` would replace the original PR's commit list with the new PR's subjects and lose the record of what landed first. Examples are a CI-fix PR for a slice that already landed ("Fix CI failures you caused", runner.md:73) or a lead docs PR that passes the ticket. Fix: rewrite only when `origin/<base>..HEAD` changes the ticket's last `## Done` section, for example when `git diff origin/<base>...HEAD -- <ticket>` touches lines at or after that heading. Otherwise skip with `commits: skipped (Done not part of this PR)`. Standard: same as above, no section applies to kit plumbing, so this is a behaviour fault.
- Validation gaps (gap): No test with a commit subject that contains `"`. Add a `tests/kit-pr.test.ts` case where `f.commit('Add "Change URL. Now" button')` sits before a Done that names SHAs and has `; evidence` after the list. Run `kit pr --no-merge` twice and assert: the line is exact, the evidence stays, and the second run leaves HEAD unchanged.
- Validation gaps (gap): No test for a `--ticket` run whose Done landed in an earlier PR. Add a case where the ticket's Done (with `Commits: "A", "B" and this commit.`) is committed on `origin/dev` first, then the branch adds an unrelated `file.txt` commit. Run `kit pr --ticket ticket.md --no-merge` and assert the ticket is unchanged and no `docs: ticket commits by subject` commit exists.
- Validation gaps (gap): `reportLanded` lines up commits by position (pr:700-703). If GitHub drops a PR commit that the rebase made empty, every earlier subject is reported as `not found` even though it landed. Add a `FAKE_LAND` variant that skips one middle cherry-pick, and assert what comes out: the other subjects are still `landed:`, or the shift is documented.

