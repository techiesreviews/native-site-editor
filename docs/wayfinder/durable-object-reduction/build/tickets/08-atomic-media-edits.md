---
title: "Include uploads and media changes in command recovery"
type: task (AFK)
status: open
assignee:
blocked_by: [07-atomic-structural-edits]
builder: sol
phase: 2
---

## What

Persist immutable upload bytes before committing referencing drafts/receipt; stage media drafts until the fenced transaction. Preserve referenced uploads on uncertain outcomes; clean only proven orphan staging.

Read the [build README](../README.md) (runner extras, lead decisions, current code) and the accepted answers: [browser recovery](../../tickets/06-define-browser-recovery.md), [connection modes](../../tickets/04-choose-connection-and-tab-ownership.md).

## Files

- `src/page-builder/media-draft-transaction.ts`
- `src/page-builder/media-workspace.ts`
- `src/uploads.ts`
- `src/agent-media-actions.ts`
- `tests/agent-media-commit.test.ts`

## Done when

- Unit tests plus existing `tests/media-draft-transaction-await-race.test.ts`; existing browser spec `native-mcp-media.spec.ts`: abort/reload/cancel preserve all-or-none drafts and recoverable bytes.
- Common checks: `npm run check`, `scripts/agents/unit.sh`, `npm run lint`, `scripts/agents/kit specs --affected`.
- One Sol review via `kit review --ticket`; landed on `dev` through `kit pr`.

## Risk

Separate upload database prevents a single cross-database transaction; durable staging must precede draft commit.
