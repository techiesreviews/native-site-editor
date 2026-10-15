---
title: Numbers that agree, a double-click that always opens, tidy dates
type: task (AFK)
status: open
assignee:
blocked_by: [89-ux-ui-audit]
builder: sol
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#improve-images-a-20-to-a-22) and the lead's notes 1 and 5. Logic only.

- Improve images' More count (`media-badge.ts:42`) equals the rows the screen lists (A-07 says 2, A-20 lists 4).
- A video's and an audio's Length in details rounds the same way as the player's time (0:02 against 0:01; 0:42 against 0:41).
- A double-click right after selecting a picture always opens the picker: the gesture becomes an editor action instead of being dropped as stale (slice 39 follow-up, `image-edit` render freshness).
- Discarding an unsaved upload also removes its date entry (and its collection entries) from the `.editor/media.json` draft (slice 103's note).

## Done when

- Unit tests for the count and the rounding; a browser spec double-clicks immediately after selecting, 20 times, and the picker opens every time, with no retry helper; a spec discards an upload and the records draft has no entry for it.
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
