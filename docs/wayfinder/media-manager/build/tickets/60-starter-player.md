---
title: Starter - the shared player
type: task (AFK)
status: open
assignee: claude (mm-60 runner)
blocked_by: []
builder: claude
phase: 5
---

## What

Starter slice (`~/Projects/native-site-editor-starter`, its `dev` branch). Ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13) "The site's own videos", "Looping videos", "Audio", "PDFs" and "Connecting details".

- One small shared player script and style (for example `scripts/media-player.js` and `styles/media-player.css`) ★ for:
  - **Video**: still picture with a play button; loads and plays with sound only on tap; a bar in the site's style with play/pause, timeline, time, sound on/off, full screen, picture-in-picture, speed, and CC when a subtitles track exists.
  - **Looping video**: plays silently by itself with one small round pause/play button in a corner; starts paused for reduced motion; a background video shows its still for reduced motion or save-data.
  - **Audio**: play/pause, timeline, elapsed/total time; a Transcript link when subtitles exist.
  - **Download cards**: first-page picture, name, type, size; PDFs read Open, others save.
- Without the script, visitors get the browser's own controls; everything still plays.
- Site colours and fonts; keyboard and screen readers work. No build, no `package.json`, root links.

## Done when

- Checked by serving the starter root on desktop Chrome, Firefox and WebKit (Playwright scratch scenario): play, pause, seek, full screen button, reduced motion, no-script fallback.
- Committed on the starter's `dev` and pushed; the editor picks it up in slice 62.
