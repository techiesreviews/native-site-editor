---
title: "Extend command commits to structural changes"
type: task (AFK)
status: open
assignee:
blocked_by: [06-atomic-text-edits]
builder: sol
phase: 2
---

## What

Stage create/move/delete/page/component changes as one draft transaction and one history action. Fence all awaited preparation and postcommit UI refreshes.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [browser recovery](../../tickets/06-define-browser-recovery.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/guarded-edit/commit.ts`
- `src/page-builder/native-operation-history.ts`
- `src/agent-site.ts`
- `src/main.ts`
- `tests/agent-structural-commit.test.ts`

## Done when

- Unit tests with `forEachAwait`; existing browser spec `native-mcp.spec.ts`: component/page/move failure writes **0 partial drafts**, successful change undoes once.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

A failed postcommit UI refresh must not relabel committed work as unapplied.
