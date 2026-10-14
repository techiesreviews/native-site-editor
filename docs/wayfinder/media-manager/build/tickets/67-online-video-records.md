---
title: Online video records
type: task (AFK)
status: open
assignee:
blocked_by: [61-starter-online-video-layer, 62-player-markup]
builder: sol
phase: 5
---

## What

Ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13) "YouTube and Vimeo".

- Parse a YouTube or Vimeo address; record the **Online video** in `.editor/media.json` (service, id, title).
- Copy its still picture into the site once, prepared like other images (slice 25), in the video's family; Lex can swap it for an own image.
- Markup for the starter's layer (slice 61): still, play button, the service loaded on tap.
- Removing one from Media never touches the service.
- Build check first: whether the browser may read the services' still pictures and Vimeo's oEmbed across sites under the editor's policy; widen `img-src`/`connect-src` only for those hosts, or list the still as "add your own" when blocked.

## Done when

- `tests/online-video.test.ts`: address forms (watch, short, embed, Vimeo), records, markup, removal leaves no service call.
