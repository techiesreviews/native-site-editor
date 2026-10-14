---
title: Starter - the YouTube and Vimeo layer
type: task (AFK)
status: closed
assignee: claude (mm-61 runner)
blocked_by: [60-starter-player]
builder: claude
phase: 5
---

## What

Starter slice. Ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13) "YouTube and Vimeo".

- An **Online video** shows its copied still with a play button; the service loads only on tap (`youtube-nocookie.com`, `player.vimeo.com`).
- After the tap the site-styled bar is laid over the service's player through its player API; YouTube's small logo may still show. When a Vimeo owner's plan does not allow hiding Vimeo's bar, Vimeo's own bar shows.
- Build checks to record: what YouTube still shows over the custom bar; whether YouTube or Vimeo captions can drive the CC button.

## Done when

- Scratch scenario on the starter root: a YouTube and a Vimeo video load only after the tap; the bar plays and pauses them.
- Committed on the starter's `dev`.

## Done (2026-10-14)

- **Markup** (in the comment at the top of the starter's `scripts/media-player.js` and its `AGENTS.md`): `<a class="online-video" href="https://www.youtube.com/watch?v=…"><img src="/media/….webp" alt="the video's name" width height></a>`. The href may be any usual YouTube or Vimeo address (watch, youtu.be, embed, shorts, live, `vimeo.com/ID` or `/ID/HASH`, channels, showcase, `player.vimeo.com`); start times (`t=90`, `t=1m30s`, `#t=90s`) are kept. Without the script the link opens the video on its site, with the same play disc over the still (CSS only). Slice 67 writes this markup.
- **Before the tap** the player wraps the still in `<div class="media-player" data-kind="online">` (slot and id move to it) with the site's start button ("Play video: name (plays from YouTube)"); nothing contacts the service. `scripts/media-online.js` (6.0 KB gzip) is imported by `media-player.js` only on pages that hold one, and gets the shared bar from it (no second module copy if a page links the player with a query).
- **After the tap** an iframe from `youtube-nocookie.com/embed/…` (`controls=0`, `enablejsapi`, `origin`, `rel=0`, `playsinline`, `autoplay`) or `player.vimeo.com/video/…` (`controls=0`, `dnt=1`, title/byline/portrait off, unlisted hash) loads with the service's player API (`youtube.com/iframe_api`, `player.vimeo.com/api/player.js`). Slice 60's video bar was extracted into a shared `videoBar` that drives a small service player shaped like a `<video>`: play/pause, timeline, time, sound, speed (only speeds the service confirms; hidden when YouTube offers only 1× or Vimeo refuses), CC (Vimeo's own captions), full screen of the wrapper (bar included). No picture-in-picture for online videos. A clear surface over the frame takes clicks (play/pause) and double clicks (full screen); keys k, m, c, f and arrows as for the site's videos; one player plays at a time across both kinds. At the end the still and play button return over the service's suggestions.
- **The service's own player takes over** (its controls, its messages) when its API cannot load or does not answer within 10 s, the video cannot play here (player error), the browser refuses the start (Vimeo says so; otherwise not started after 4 s and not loading, 16 s at most), or `data-controls="service"` asks for it. That attribute is the answer for **Vimeo owners whose plan cannot hide Vimeo's bar**: the page cannot detect the plan, so it is marked per video (follow-up for slices 66/67/68: a switch in the video's details, "Show Vimeo's own bar").
- **Build checks recorded.** What YouTube shows over the bar: in real headless Chromium (Big Buck Bunny), playing and paused, YouTube drew nothing over the picture or the site's bar (the frame takes no pointer events, so hover overlays do not appear); the start of play and real phones (iPhone autoplay after a tap in the page, which may hand over to YouTube's own player) remain for a device. Captions and CC: Vimeo's documented `getTextTracks`/`enableTextTrack` drive the CC button (real Vimeo gave the button its captions); YouTube's captions can only be switched through undocumented player options, so YouTube videos get no CC button. Real Vimeo in headless Chromium reports a playback error (no H.264 decoder) and correctly hands over to Vimeo's own player; in Firefox it connected, showed CC and paused from the site's bar, though headless browsers draw no Vimeo picture.
- **Tests:** Playwright scratch scenario (`.scratch/mm61/scenario.mjs`, own static server with byte ranges serving the starter root plus a demo page; YouTube's and Vimeo's player APIs and frames stubbed by route; any other request to their hosts blocked and counted) on desktop Chromium, Firefox and WebKit: 234/234 checks (78 each): address forms and player addresses, no service contact before the tap or without script, the tap loads and plays both, the bar plays/pauses/seeks/mutes/speeds them, keys, surface click, full screen, one at a time, Vimeo CC, end returns the still, `data-controls="service"`, API blocked/never answering/arriving late, errors before and after ready, refused start, slow start keeps the bar, state reported before the API listened, late callbacks after hand-over, phone width, no-script fallback, reduced motion, and slice 60's own video still working. Plus a real-network check (`.scratch/mm61/real.mjs`). WebKit needed seven unpacked system libraries (LD_PRELOAD, no install), as in slice 60.
- **Commits** (starter `dev`): c3f5577 (layer), 8156dbd (review fixes), 293a454 (second review fixes). Editor: claim 9bf64996 and this close.
- **Review** (GPT-6.1 Sol, read-only, starter diff, two rounds): fixed 9. Round 1: Vimeo/YouTube state reported before the API listened; focus left in a hidden frame; speed shown before YouTube confirmed it; error hand-over kept the service's controls off; no loading deadline; abandoned connections still writing. Round 2: refused start left Vimeo without a play button (now hands over with controls; the real-service run then showed the 4 s rule needed the "still loading" exception, added and tested); Vimeo's first snapshot could overwrite newer events; work after a hand-over still built a connection and ran speed timers. Rejected 0.
- **Sizes:** `media-player.js` 6.8 → 7.9 KB gzip, `media-player.css` 2.8 → 3.4 KB, new `media-online.js` 6.0 KB (online-video pages only). Editor boot delta 0 (no editor code changed; 344 KB of 355 KB).
