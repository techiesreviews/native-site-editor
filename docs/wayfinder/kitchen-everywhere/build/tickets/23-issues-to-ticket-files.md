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

- `kit init --issues` (in `scripts/agents/kit.d/init`) reads open Issues with `gh issue list --state open --limit 1000 --json …` and writes one `needs-triage` ticket per Issue in `<maps>/backlog/tickets/NN-<slug>.md` (`maps` from `kit.json`, else `docs/wayfinder`; NN continues after the highest file there; slug from the title, at most six words, else `issue-N`). The title is written JSON-quoted, so `:`, `#` and quotes read back unchanged. The body holds the link `[owner/repo#N](url)`, author and date, labels, the Issue's text and `## Comments`. It writes `backlog/map.md` if missing, prints a `next:` line and closes nothing. A rerun finds each Issue's link in the existing files and skips it. The setup and doctor steps do not run in this mode, so it also works before the old kit files are gone.
- `kit init --issues --close` fetches `origin/<land>`, finds each open Issue's file on that branch by its link, and runs `gh issue close N --repo owner/repo --comment "Moved to a ticket file: https://github.com/owner/repo/blob/<land>/<path>"`. If any open Issue has no file on `origin/<land>`, it closes none and lists them. A failed close is named, and a rerun retries it. `--close` without `--issues` and `--issues` with `--light` or `--land` exit 2.
- Tests in `tests/kit-init.test.ts` use a fake `gh` on PATH and a bare `origin`. Two Issues become two tickets and a map that pass `tickets.mjs check`, and the titles read back. A rerun leaves the tree byte for byte, and a later Issue gets the next number. `--close` refuses before the files land and when they are on a build branch only; once they are on `origin/dev` it closes each Issue with the exact blob link. Flag misuse is also covered.
- `docs/agents/agent-scripts.md` describes both forms.
- Feature list: no change (kit command for agents; nothing in the editor changes).
