---
title: "kit pr updates an existing PR's body through the REST API"
type: task (AFK)
status: closed
assignee: ak-36 (lead)
blocked_by: []
builder: claude
---

## What

Re-running `kit pr` on a branch whose PR is already open (PR #14, 2026-10-16) failed at `open`:
`gh pr edit` queries the retired Projects (classic) field and GitHub answers
`Projects (classic) is being deprecated … (repository.pullRequest.projectCards)`. Use
`gh api --method PATCH repos/{owner}/{repo}/pulls/<n> -F body=@<file>` instead.

## Files

- `scripts/agents/kit.d/pr`
- `tests/kit-pr.test.ts`

## Done when

- The existing-PR test asserts the REST call and no `gh pr edit`; a live PATCH of PR #14's own body works.
- Sol review on the PR; merged into `dev` through `kit pr`.

## Done (2026-10-16)

- `kit pr` updates an open PR's body with the REST endpoint; the fake gh records `body=@<file>`.
- Tests: `tests/kit-pr.test.ts` 21/21. Live check: PATCH of PR #14 with its current body returned #14.
