---
title: GitHub Issues into ticket files, once
type: task (AFK)
status: open
assignee:
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
