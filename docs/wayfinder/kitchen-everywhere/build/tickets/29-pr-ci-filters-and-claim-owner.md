---
title: kit pr waits for push workflows that may run on a PR branch, and a slice keeps its claim owner
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [17-second-look-per-kind]
---

## Goal

Claude's review of [ticket 14](14-settings-for-other-projects.md#follow-ups) (P2, evidence `.scratch/reviews/build/ke-14-settings-for-other-projects/20261027T114732Z` in the main checkout) found that round 3's "is this workflow CI?" test in `kit pr` (`runsOnPullRequests`, `scripts/agents/kit.d/pr:71`) counts any block-form `push` with a `branches`, `branches-ignore`, `tags`, `paths` or `paths-ignore` child as "no CI". Many of those run on PR branches (`push: branches: ['**']`, `push: branches-ignore: [main]`, a `paths` filter the PR hits), so `kit pr` prints `ci: none …`, records `landed.ci: "none"` and merges without waiting: a failing CI run no longer stops the landing. Ticket 14 only meant to skip the wait with no workflows that can run. This has to be fixed before projects 40–47 move, since their workflows are exactly these shapes. The same review found the opposite case (P3): the inline flow form `on: { push: { branches: [main] } }`, a deploy-only workflow, still waits 30 minutes for runs that never come.

Claude's P3 on the same ticket: its `assignee` became the branch name `build/ke-14-settings-for-other-projects` instead of the claim owner `ke-14` (fixed by hand in the second-look docs PR). The cause is `kit slice`: its builder brief says `Set status: closed, assignee: ${kitOwner()}` (`scripts/agents/kit.d/slice:253`), and `kitOwner()` (`scripts/agents/kit-lib.mjs:89`) falls back to the branch name when neither `ASE_OWNER` nor `.scratch/owner` is there, as in a slice started from a T3 worktree thread rather than `kit next --start`. `kit status`'s "who" column and `kit next`'s claim checks read that field.

## Decided behaviour

- **A filtered push is CI unless it cannot match a PR branch:** a block-form `push` counts as "not CI" only when its `branches` (or `tags`, with no `branches`) list names no pattern a feature branch can match: plain names such as `main`, `dev`, `release/v1` with no `*`, `**`, `?`, `[` or `!`. `branches-ignore`, `paths` and `paths-ignore` (alone or beside `branches` that can match) count as CI, so `kit pr` waits; if such a run never comes, the existing wait timeout says so, as for a `pull_request` with a `paths` filter today.
- **The inline flow form is read the same way:** `on: { push: { branches: [main] } }` and `on: {push: {branches: [main, dev]}}` are deploy-only (no wait); `on: { push: { branches: ['**'] } }` and `on: { push: {} }` wait. Inline lists and strings (`on: push`, `on: [push, pull_request]`) keep today's answer.
- **A slice keeps its claim owner:** `kit slice`'s brief tells the builder to keep the ticket's existing `assignee:` (the claim owner `kit next --start` wrote, `ke-14`) and only fill it with `kitOwner()` when the line is empty. A worktree started outside `kit next --start` no longer turns it into the branch name.

## Files

- `scripts/agents/kit.d/pr`, `scripts/agents/kit.d/slice`
- `tests/kit-pr.test.ts`, `tests/kit-slice.test.ts`
- `docs/agents/agent-scripts.md` (the `kit pr` CI line)

## Done when

- The workflow-shape table in `tests/kit-pr.test.ts` ("only a workflow that runs for a PR branch is CI to wait for…") gains `push:\n    branches-ignore: [main]`, `push:\n    branches: ['**']`, `push:\n    paths: [src/**]`, `push:\n    branches: [main]\n    paths: [src/**]`, `on: { push: { branches: [main] } }` and `on: { push: { branches: ['**'] } }`: the first three and the last wait (`wait ci --pr …` called, `landed.ci: "pass"`), the fourth and fifth do not (`landed.ci: "none"`); the seven existing shapes keep their answers.
- `tests/kit-slice.test.ts`: a ticket with `assignee: ke-99` run from a worktree with no `ASE_OWNER` and no `.scratch/owner` gets a brief that keeps `ke-99`; an empty `assignee:` still gets `kitOwner()`.
- `scripts/agents/kit unit --affected` green; this editor's own `kit pr` still waits for its CI.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). Kit and docs only.

- `scripts/agents/kit doctor`; `ASE_REVIEW_MODEL=claude-opus-5-5 scripts/agents/kit bg slice-ke29 -- scripts/agents/kit slice --ticket docs/wayfinder/kitchen-everywhere/build/tickets/29-pr-ci-filters-and-claim-owner.md --builder claude-opus-5-5`; `scripts/agents/kit wait job slice-ke29 --timeout 2h`. While building: `scripts/agents/kit unit --affected`.
- Second look: as the README says.
- Report: unit `RESULT:` lines, each new workflow shape's answer, review decisions, PR and merge SHA.
