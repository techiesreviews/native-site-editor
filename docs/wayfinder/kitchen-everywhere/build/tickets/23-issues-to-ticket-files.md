---
title: GitHub Issues into ticket files, once
type: task (AFK)
status: closed
assignee: ke-23
builder: claude
blocked_by: [22-kit-init]
---

## Goal

`TechiesTools` (19 open Issues) and `camframe` (12) track work in GitHub Issues; the kitchen reads markdown tickets only. When either joins, its open Issues are copied once into ticket files and each Issue is closed with a link to its file ([ticket 05 resolution](../../tickets/05-grill-rollout.md#resolution-2026-10-26) point 4; research 02).

## Decided behaviour

- **`kit init --issues`** reads the project's open Issues with `gh issue list` and writes one file per Issue in `docs/wayfinder/backlog/tickets/NN-<slug>.md` (README helper decision 11): frontmatter `title`, `type: task (AFK)`, `status: needs-triage`, `assignee:`, `blocked_by: []`; body: the Issue's text, labels, its link and its comments under `## Comments`. It writes `docs/wayfinder/backlog/map.md` if missing, and the files pass `tickets.mjs check`.
- **Two steps, so nothing closes by accident:** the first run only writes the files and prints the plan; `kit init --issues --close` (after the files have landed on the project's branch) closes each Issue with a comment linking its file on GitHub. Closing is done by the lead after Lex's OK (tickets 44 and 47).
- Safe to rerun: an Issue that already has a file is skipped.

## Files

- `scripts/agents/kit.d/init`, `tests/kit-init.test.ts`
- `docs/agents/agent-scripts.md`

## Done when

- Tests with a fake `gh` prove: two Issues become two valid ticket files and a map; a rerun writes nothing new; `--close` comments with the right link and closes; `--close` refuses when the files are not on the remote branch.
- `scripts/agents/kit unit --affected` green.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only; no real Issue is read or closed.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke23 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/23-issues-to-ticket-files.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke23 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Report: unit `RESULT:` lines, one sample ticket file from the test, review decisions, PR and merge SHA.

## Done (2026-10-28)

- `kit init --issues` (in `scripts/agents/kit.d/init`) names the repo from `origin`'s URL and resolves its current name with `gh repo view`. It then reads that repo's open Issues with `gh issue list --repo <repo> --state open --limit 1000 --json number,title,body,labels,url,author,createdAt,comments`. A fork reads its own Issues, never upstream's, and an Issue gh gives for another repo stops the run. It writes one `needs-triage` ticket per Issue in `<maps>/backlog/tickets/NN-<slug>.md`:
  - `maps` comes from `kit.json`, else `docs/wayfinder` with a note. A `maps` that is not a folder name, or is absolute or holds `..`, is refused.
  - NN continues after the highest number there; the slug comes from the title (at most six words, else `issue-N`).
  - The frontmatter names the Issue as `issue: <url>`. The title is written JSON-quoted, so `:`, `#` and quotes read back unchanged.
  - The body holds the link `[owner/repo#N](url)`, author and date, labels, the Issue's text and `## Comments`. A label with a backtick gets a longer code fence.
  - Copied text gets LF line endings. Its `#` and `##` headings go two levels down, and inside code fences they get one leading space, so an Issue's `## Files`, even pasted in a fence, never becomes the ticket's Files section.
  - At 100 comments (gh's most per Issue) the file ends with a line to read the rest on GitHub, and the run prints a note.
- It writes `backlog/map.md` if missing, prints a `next:` line and closes nothing. A rerun skips an Issue whose `issue:` line names its number on this repo, or on an older name that `gh repo view` resolves to this repo, so a renamed repo writes no duplicates. Another repo's Issue with the same number never counts. Links to other Issues in the copied text never count, so a "Duplicate of #5" in #3 neither hides #5 nor stands for its file. Setup and doctor do not run in this mode.
- `kit init --issues --close` fetches `origin/<land>` with an explicit refspec and finds each open Issue's file on that branch by its `issue:` line, noting an old link after a rename. It then runs `gh issue close N --repo owner/repo --comment "Moved to a ticket file: https://github.com/owner/repo/blob/<land>/<path>\nWork on it goes on there."` (two lines).
  - If any open Issue has no file on `origin/<land>`, it closes none and lists them.
  - A failed close is named (`close failed: #N: <first error line>`) and the run ends `RESULT: fail init closed K of M Issues; failed: #N; rerun to retry them`; a rerun closes the rest.
  - `--close` without `--issues` exits 2, and so does `--issues` with `--light` or `--land`.
  - Each `gh` call and the fetch stop after `KIT_ISSUES_TIMEOUT` seconds (120 by default) with `timed out after Ns`. They read up to 256 MiB of output, else `output over 256 MiB`, and never wait at a login prompt.
  - Ticket files with non-ASCII names are found on the remote branch, and blob links encode each path segment.
- Tests in `tests/kit-init.test.ts` use a typed fake `gh` on PATH and a bare `origin`. They cover:
  - two Issues becoming two tickets and a map that pass `tickets.mjs check` (titles read back), with the exact `gh issue list` arguments checked;
  - a rerun leaving the tree byte for byte, and a later Issue getting the next number;
  - `--close` refusing before the files land and when they are only on a build branch, then closing with the exact blob links;
  - a cross-linked Issue getting its own file and its own close link;
  - a failed close being retried by a rerun;
  - the `maps` fallback note, and a `maps` path outside the project being refused;
  - flag misuse;
  - LF endings and moved-down headings in copied text, the 100-comment note and no claimed Files;
  - another GitHub host, a renamed repo, and `--close` without a landing branch;
  - running beside old kit files, and a failing, non-JSON or 1000-entry `gh issue list` writing nothing;
  - a fork with an `upstream` remote listing and closing only `origin`'s Issues, with links to `origin`'s files;
  - another repo's `issue:` line with the same number not counting, and a non-ASCII file name being found;
  - a 2 MiB Issue list being read whole, and `KIT_ISSUES_TIMEOUT=1` stopping a hanging gh.
- One sample ticket file, Issue #14 with labels, text and a comment, is the expected text in the first `--issues` test in `tests/kit-init.test.ts` (`02-search-results-ignore-accents.md`).
- Evidence: `RESULT: ok unit 27/27 (1 files)` from `scripts/agents/kit unit --affected` (also after the PR review fixes); `npm run lint` and `npm run check` pass.
- Commits (named by subject, since `kit pr` rebases them): "GitHub Issues into ticket files, once", "Review fixes round 1", "Review fixes round 2", "Review fixes round 3", "Review fixes after the PR review" and this commit; the PR number and merge SHA are in the slice report.
- Review decisions, round 1 (all taken, none declined):
  - P1: an Issue was matched by a link anywhere in a file, so a cross-link could close the wrong Issue or skip one. Now only the `issue:` line in the frontmatter counts.
  - P3: the Done text was missing the close comment's second line, a commit and evidence; added.
  - P3: the fake gh Issues were untyped; they now use a `GhIssue` type.
  - Gaps: tests added for the cross-link, a failed close retried, `--land`, the full `gh issue list` arguments and the `maps` fallback.
  - Optional nits taken: an explicit fetch refspec, `maps` trimmed and kept inside the project, labels with a backtick, and the docs saying setup and doctor are skipped.
- Review decisions, round 2 (all taken, none declined):
  - P3: the map's Notes said in the past tense that Issues were closed; they now name closing as the next step, after Lex's OK.
  - P3: the slug regex held invisible combining characters; it now reads `\u0300-\u036f`.
  - P3: copied headings could become ticket sections, and CRLF endings got through; headings now move down and line endings are LF.
  - P3: gh and fetch had no timeout; both are now bounded at 120 s, with no login prompt.
  - P3: a renamed repo broke matching; the match is now by host and Issue number, and `--close` notes the old link.
  - Gaps: tests added for a backtick label, another host, a missing landing branch, old kit files, a failing or odd `gh issue list`, and the 1000 cap.
  - Optional nits: the 100-comment cap and a non-string `maps` are handled. The live blob link is kept rather than a SHA permalink, because the close comment says work goes on in that file.
- `docs/agents/agent-scripts.md` describes both forms.
- Feature list: no change (kit command for agents; nothing in the editor changes).
- Review decisions, round 3 (all taken, none declined):
  - P2: in a fork, gh's default repo could be upstream, so a close could link a missing file. The repo now comes from `origin` and goes to gh as `--repo`.
  - P1: an Issue list over 1 MiB failed as a false "timed out". Output up to 256 MiB is now read, and a timeout, an output limit and a signal each give their own message.
  - P2: another repo's `issue:` line with the same number counted as a match. The repo must now be this one, or an older name that resolves to it.
  - Gaps: tests added for large output, the timeout (now `KIT_ISSUES_TIMEOUT`), a fork, and another repo's ticket with the same number.
  - Optional nits taken: a fence closes only on a bare marker; blob links encode each path segment; the map says "after the owner's OK"; non-ASCII file names are read with `core.quotePath=false`.
- Review decisions, PR review (after three rounds; the lead builder fixed these by hand):
  - P1: `--close` read landed ticket files under Node's 1 MiB default, so a long Issue's file counted as missing and blocked every close. Files are now read under the 256 MiB limit, and an unreadable one stops the run with its own message.
  - P2: a `## Files` pasted inside a code fence was still read as the ticket's Files by `tickets.mjs`. Top headings inside fences now get one leading space.
  - P3: the Done section named pre-rebase commit SHAs; commits are now named by subject.
  - Gaps: the 1 MiB test now also lands the ticket and closes its Issue; the heading test covers a fenced `## Files` and checks no Files are claimed.
  - Optional nits not taken (follow-ups): a failed `gh repo view` on an old repo name counts as "another repo"; a rerun checks only the local tree, not `origin/<land>`; a label holding two backticks in a row breaks its code span.
