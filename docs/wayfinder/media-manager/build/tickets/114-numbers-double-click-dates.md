---
title: Numbers that agree, a double-click that always opens, tidy dates
type: task (AFK)
status: open
assignee: claude (mm-114 runner)
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

- Shots at 390, 768 and 1280, light and dark, of More beside Improve images and of video and audio details, showing the numbers agree.
- Unit tests for the count and the rounding; a browser spec double-clicks immediately after selecting, 20 times, and the picker opens every time, with no retry helper; a spec discards an upload and the records draft has no entry for it.
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Build notes (2026-10-15)

- More and Improve images use `planWithPictureSizes`; the lazy usage check reads picture dimensions after publishing Clean up. An open More menu updates when its count arrives. Fix and Undo are covered.
- Uploads retain exact duration. Details use the loaded player's duration, rounded down with the same minimum-one-second rule as tiles, and refresh the current tile's length. Chromium reads the test MP4 as 1.9629 seconds; the audio fixture is 41.9 seconds.
- `image-edit` is an action with its painted-source proof. The lazy host checks the current image start tag before opening the picker. One double-click passes 20 consecutive selections; the helper has no retry.
- Discard removes the upload's complete record and restores the saved records' exact formatting when otherwise unchanged. It keeps existing no-Undo discard behavior so upload bytes are released. Other records edits and collection definitions stay.
- Screenshots: `.scratch/shots/mm114/`, 390/768/1280, light/dark; narrow details have separate player and Length shots.
- No commits, pushes, deploys or agents. Independent Sol review remains for the lead under the no-agents build contract.
- Validation: `npm run check`, `npm test` (also through `scripts/agents/unit.sh`, 3432 passing), `npm run lint`, and the four touched browser specs through `scripts/agents/port.sh` (31 passing). `npm run build:ui` followed by `npm run test:budget -- --no-build`: 347 KB / 355 KB; entry gzip +207 bytes against HEAD. The budget command's default bundled config loader cannot write into shared `node_modules`; the repository's runner-loader build works.
- Fixture limit: the checked-in starter contains no playable audio/video, and the audit's original `studio-tour.mp3` bytes are unavailable. Duration coverage uses the repository's real MP4 and a generated playable 41.9-second WAV, with deliberately inaccurate stored durations.
