---
title: Change URL and redirects keep the sub-folder
type: task (AFK)
status: in-progress
assignee: claude (mm-79 runner)
blocked_by: [78-prefix-every-writer]
builder: sol
phase: 7
---

## What

- Change URL and media renames write prefixed addresses in pages and in `_redirects` (`src/native-page-moves.ts:163-236`).
- `nativePageMovedUrl` keeps the sub-path (it drops it today: `shared/native-project.ts:383-397`).
- Agent `move_file` and `create_page` follow.

## Done when

- `tests/native-page-moves.test.ts` and `tests/native-project.test.ts` (or their current names): moves and redirect lines with and without a prefix.
