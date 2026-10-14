---
title: Video, audio and download markup
type: task (AFK)
status: closed
assignee: claude (mm-62 runner)
blocked_by: [60-starter-player, 56-media-security-policy, 33-placed-image-markup]
builder: sol
phase: 5
---

## What

Ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13); the starter's player from slice 60.

- Writers for a placed video (`<video>` with `poster`, `preload="none"`, `controls` for the no-script fallback, subtitles `<track>`), audio (`<audio>`), and a download card (link with the first-page picture, name, type and size).
- Placing any of these adds the player script and style link to the page once, when missing, as the component loader is added today ★ (`src/page-builder/components.ts`, slice 103 of the components build).
- Same output for agents.

## Done when

- `tests/player-markup.test.ts`: each kind's markup, the player added once, a page that has it already, subtitles track.

## Done (2026-10-14)

- **Behaviour.** New lazy, DOM-free `src/page-builder/player-markup.ts`, the one writer for picker placement (slice 63) and agent tools (slice 69); nothing on the boot path imports it and nothing places with it yet. Markup follows the starter's contract (`scripts/media-player.js` header, `AGENTS.md` "Video, audio and downloads"):
  - `videoMarkup`: `<video src poster controls preload="none" playsinline width height aria-label>` (still, size and name only when known; never `autoplay`).
  - `audioMarkup`: `<audio src controls preload="none" data-duration aria-label>` (whole seconds; left out when unknown).
  - Subtitles: only WebVTT is written as `<track kind="subtitles" src srclang label>`; any other file (`.srt`) writes no track and returns a plain note (slice 66 converts). `srclang` is the given language, else the page's `<html lang>` (`pageMediaLanguage`), both kept only when well formed (canonical spelling, `en-gb` → `en-GB`), else left out; `label` is the language's name in the page's language (`Intl.DisplayNames`), else "Subtitles".
  - `downloadCardMarkup`: `<a class="download-card">` with the optional first-page or file-type `<img alt="" loading="lazy">` (none: the CSS draws a folded page), name (default: file name), "PDF · 240 KB" meta (size via `formatBytes` when known), and Open for PDFs (no `download`) or Download with `download`.
  - **The player added once:** `pageMediaPlayer` reads what the page's own head loads (the stylesheet link and the module script, query/hash ignored, relative or root; `<noscript>`/`<template>`/comments do not count). `addMediaPlayerLinks` adds `<link rel="stylesheet" href="/styles/media-player.css">` after the head's last stylesheet and `<script type="module" src="/scripts/media-player.js"></script>` right after the component loader script (else after the player's stylesheet), keeping line endings and indentation (shared `insertHeadLine`, extracted from `addComponentLoaderScript`, unchanged behaviour). `mediaPlayerPlan` (shaped like `componentLoaderPlan`): download cards need only the stylesheet; every other kind (video, audio, and the reserved online/looping/background kinds of slices 64 and 67) needs the script too; creates `styles/media-player.css`, `scripts/media-player.js` and `scripts/media-online.js` from the vendored starter only when missing, never overwriting; two passes, so the bytes load (`starterPlayerFiles` in `starter-loader.ts`) only when a file must be created; unreadable or head-less pages get a plain note.
- **Commits.** 27a61021 claim; 798c552e build (GPT-6.1 Sol; runner made every player-driven kind need the script and tidied the shared helper); ca63ef54 review fix; this close.
- **Tests.** New `tests/player-markup.test.ts` (22): each kind's exact markup, escaping and encoded root URLs, subtitles from the page language and display name, explicit language, malformed language falling back, `.srt` note, player added once (placement after the loader and stylesheets, CRLF and indentation), a page that already has it (query, relative link), `<noscript>` not counting, download-only stylesheet, every player kind needing the files, files created only when missing, head-less and unreadable notes, `starterPlayerFiles` with a fake fetcher and against the vendored copy. `npm run check`, `npm run lint`, `scripts/agents/unit.sh` 2,860/2,860 (before the review fix; targeted 22/22 after). No browser spec touched (no UI; slice 63 adds `native-media-video.spec.ts`).
- **Review (GPT-6.1 Sol, read-only).** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-62/` (run.log: model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`). No defects. One validation gap: subtitles with a missing or invalid `srclang`. Fixed the invalid part (ca63ef54). Rejected its browser-test request (CC selection and cues with a real VTT): the player's CC and cue handling belong to the starter and were checked in slice 60's three-browser scenario with this exact markup; this slice's unit tests pin the markup to that contract, and slice 63's browser spec covers placement. A missing language stays omitted rather than guessed; browsers still use the track.
- **Bytes.** `test:budget` 345 KB of 355 KB; unchanged dev measured 347 KB in the same session (cold-median noise). Boot delta 0: only the lazy module, `starter-loader.ts` (lazy) and a refactor inside `component-loader.ts`.
