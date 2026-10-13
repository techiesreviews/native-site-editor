---
title: Decide how video, audio and documents are handled
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [02-research-optimising-every-media-kind]
---

## Question

All media kinds are in scope (settled). Use the confirmed adding policy in [Decide the one way media gets added](07-one-upload-path.md#resolution-2026-10-13) for browser preparation, presets, previews, original retention, size limits, warnings and failure handling. Those choices are settled; this ticket decides playback and placement.

Can Lex place a video from YouTube or Vimeo by its address, and when should the editor suggest using an embedded video instead of storing one in the site? What markup do videos, audio and download links get (controls, autoplay muted for background video, `preload`, a download link with the file size)? How do these show in the compatible picker and on the canvas? How is the silent looping video made from an animated GIF placed? Preview generation is settled, but how are video still previews and PDF first-page previews used in those places?

## Comments
- 2026-10-13, how an ordinary video starts: Lex chose **still picture + play**. Visitors see the video's still preview with a play button; it plays with sound only when they tap, and the video itself loads only then. (Alternatives declined: playing silently on its own; choosing per video.)
- 2026-10-13, moving-picture videos: Lex answered with a pointer rather than an option: "Taking into account accessibility, we should be able to pick that it's looping, auto, muted and show basic pause and play buttons. If the user has motion turned off, it should be paused by default and only be playing when the button is pressed." So any video can be set, per place, to loop silently and play by itself, always with simple pause and play buttons; for visitors whose device asks for less motion, it starts paused and plays only when they press play. (The offered options were a per-place switch, recommended, or GIF videos only; Lex's answer extends the switch with the accessibility rules.)
- 2026-10-13, look of the pause/play control: Lex chose **one small corner button**: a small round pause/play button in a corner of a looping silent video, keeping the moving picture clean; the editor adds a tiny shared script to the site for it. (Alternative declined: the browser's own video bar.)
- 2026-10-13, YouTube and Vimeo: Lex chose **yes, paste the link**. Lex can paste a YouTube or Vimeo address in the media picker to place that video; the video stays on YouTube or Vimeo, taking no site space and having no size limit. (Alternative declined: only videos stored in the site.) Fact found: techies-reviews has 81 YouTube embeds and no Vimeo; the editor cannot place embeds today and its security policy blocks YouTube on the canvas.
- 2026-10-13, how YouTube and Vimeo videos load: Lex chose **still picture until tapped**. Visitors see the video's picture with a play button, as with the site's own videos; YouTube or Vimeo loads only on tap, so pages open faster and visitors who never press play are not tracked. (Alternative declined: loading the full player with the page, as techies-reviews does today.)
- 2026-10-13, the still picture for YouTube and Vimeo: Lex chose **copied into your site**. When the video is placed, the editor saves the service's picture into the site's media once, prepared like other images; visitors' browsers do not contact the service until play, and Lex can swap the picture for one of their own. (Alternative declined: loading the picture from YouTube on every visit.)
- 2026-10-13, YouTube videos already on pages: Lex chose **offer in Improve images**. Improve images also lists YouTube and Vimeo players that could switch to "picture until tapped", fixed one page or all at once with the same Undo; other embeds stay alone. This extends ticket 11's "embeds left alone" for YouTube and Vimeo players only. (Alternatives declined: switching one at a time from the edit bar only; leaving old videos as they are.)
- 2026-10-13, how audio looks: Lex chose **a player in the site's style** (not the recommended option): a custom player using the site's colours and fonts. Consequences: it needs a shared script in the site and more building and upkeep than the browser's own player, and it must keep keyboard and screen-reader use working. (Alternative declined: the browser's own audio bar.)
- 2026-10-13, the audio player's buttons: Lex chose **play, timeline, time**: play/pause, a bar to jump around, and elapsed and total time; volume stays with the visitor's device. (Alternatives declined: adding speed and download buttons; choosing per clip.)
