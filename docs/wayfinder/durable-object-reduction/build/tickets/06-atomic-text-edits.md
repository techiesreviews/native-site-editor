---
title: "Commit text edits before acknowledging success"
type: task (AFK)
status: open
assignee:
blocked_by: [05-owner-fencing]
builder: sol
phase: 2
---

## What

Stage text edits; commit durable drafts/receipt before publishing model/history changes or success. Serialize pending manual writes and validate their revisions. Reconcile lost responses; never automatically replay receiptless operations.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [browser recovery](../../tickets/06-define-browser-recovery.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/draft-store.ts`
- `src/drafts.ts`
- `src/guarded-edit/commit.ts`
- `src/editor-workspace.ts`
- `src/components/source-editor.ts`
- `tests/agent-text-commit.test.ts`

## Done when

- Unit tests plus existing `tests/guarded-edit.test.ts`: cancellation before commit applies nothing; after commit reports applied; reload finds matching drafts/receipt.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Current synchronous history APIs need a staged agent-only boundary; preserve manual typing behavior.
