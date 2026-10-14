---
title: Starter - the shared player
type: task (AFK)
status: closed
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

## Done (2026-10-14)

- The starter's `dev` has `scripts/media-player.js` (a dependency-free ES module, 6.8 KB gzip) and `styles/media-player.css` (2.8 KB gzip, its own `media-player` layer, site tokens only), loaded only by pages that hold media. Without the script the browser's own controls show and everything still plays.
- **Video:** still with a large play button; `preload="none"` until the tap, then plays with sound and focus moves to the bar. The bar floats on the site's surface colour: play/pause, timeline (a range input with "0:12 of 3:45" as its spoken value), elapsed and total time, sound, CC (when a subtitles or captions track exists; follows changes made elsewhere), speed (1, 1.25, 1.5, 2, 0.75×), picture-in-picture (where the API exists; Safari's presentation mode too) and full screen (the wrapper; iPhone falls back to the video's own full screen). It hides after 2.5 s of playing untouched; keys k, m, c, f and arrows; one ordinary player plays at a time; a playback error hands the video back to browser controls. Narrow players put the timeline on its own row and keep every button.
- **Looping video** (`controls muted loop playsinline`, no `autoplay`): starts silently while on screen, one small round pause/play button in a corner, paused for reduced motion. **Background video** (`data-background`, first child of its section, `preload="none"`): fills the section behind the text; shows its still for reduced motion or save-data, and its corner button plays it.
- **Audio:** play/pause, timeline, elapsed/total (`data-duration` shows the total before loading); a Transcript button opens a focusable region with the subtitles' text (WebVTT/SRT parsed to plain lines, voice tags kept as "Name: ").
- **Download cards** are CSS only: first-page picture (or a folded-page shape), name, type · size, and Open (PDF, no `download`) or Download.
- The markup contract is in the comment at the top of `scripts/media-player.js` and in the starter's `AGENTS.md` ("Video, audio and downloads"). Follow-ups: for slice 64, write looping and background videos **without** `autoplay` (the player starts them, so reduced motion holds even without JavaScript; `autoplay` still works and is paused for reduced motion), and the player wraps each video in `<div class="media-player">` that takes the `slot`, so picture-spot CSS selects the slot by name (`[slot="image"]`). A background video in a full-width toned band covers the section box, not the band's extended edges. For slice 62: subtitles tracks must be WebVTT (convert `.srt` when added). The canvas strips page scripts (`native-preview-runtime.js`), so the player never runs there.
- Tests: Playwright scratch scenario (`.scratch/mm60-scenario.mjs`, own static server with byte ranges serving the starter root plus a demo page and generated WebM/WAV/VTT media) on desktop Chromium, Firefox and WebKit: 117/117 checks, covering play, pause, seek, keyboard, sound, CC, speed, full screen, PiP presence, idle bar, looping, background, audio, transcript, reduced motion, save-data, no-script fallback, phone width and dark scheme. Harness limits recorded: Playwright's Linux WebKit needed three unpacked system libraries (LD_PRELOAD, no install), refuses muted autoplay even for the native attribute (the refused path was checked instead: the corner offers Play and plays), and applies `muted` changes unreliably. Real-phone checks (ticket 12's build checks: iPhone full screen, PiP, gestures) remain for a device.
- Commits (starter `dev`): e51c83a (player, styles, docs), 5ec3a2b (review fixes). Editor: claim 0b09ead1 and this close.
- Review (GPT-6.1 Sol, read-only, starter diff): fixed 3 (narrow players dropped speed and PiP; CC state went stale after outside changes; long transcripts not keyboard scrollable) plus 1 documented (the wrapper takes the slot, so component CSS selects media slots by name). Rejected 2: media inside component templates' shadow roots (media are page-owned slots by the conventions; template fallbacks are no placed-media case), and fixed black in full screen (the letterbox belongs to the picture; colour roles flip light in dark mode).
- Byte budget: editor boot delta 0 (no editor code changed).
