---
title: Placed video, audio and downloads in the editor: plain words, real times
type: task (AFK)
status: open
assignee: claude (mm-115 runner)
blocked_by: [105-editor-toast]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#video-audio-download-and-online-video-placement-b-29-to-b-33).

- The video edit bar says "Video file", "Still picture" and "Title" instead of "Video URL", "Poster URL" and "Title" (`native-element-fields.ts:82`).
- The canvas audio shows its real length (`preload="metadata"`), not "0:00 / 0:00".
- The canvas hover tag over a download card says "Download", not "span.download-card-meta".
- At 1280 the edit bar sits above a selected video when there is room, and the hover outline follows the video's box.

## Done when

- Also shot (not in the audit's sets): visitor subtitles with CC on, the audio transcript, the looping video's corner pause button, and an Online video playing and its fallback when the provider is blocked.
- Specs for the bar labels and the canvas audio duration.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
