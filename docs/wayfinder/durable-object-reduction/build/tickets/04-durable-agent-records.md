---
title: "Extend browser persistence for receipts and fences"
type: task (AFK)
status: open
assignee:
blocked_by: [03-remote-recovery]
builder: sol
phase: 2
---

## What

Add versioned receipt, workspace revision/owner and conversation stores alongside drafts. Provide one transaction API for drafts + receipt + revision checks; retain manual-editor fallback separately.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [browser recovery](../../tickets/06-define-browser-recovery.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/drafts.ts`
- `src/agent-records.ts`
- `shared/agent-command.ts`
- `tests/agent-records.test.ts`
- `tests/drafts.test.ts`

## Done when

- Unit tests in both files: upgrade preserves drafts; injected abort commits neither drafts nor receipt; unavailable IndexedDB refuses agent transactions.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Do not send agent transactions through existing per-file failure recovery.
