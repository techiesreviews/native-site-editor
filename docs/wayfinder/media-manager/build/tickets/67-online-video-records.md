---
title: Online video records
type: task (AFK)
status: closed
assignee: claude (mm-67 runner)
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

## Done (2026-10-15)

- **Build check first (real network, 2026-10-15).** YouTube's still host `i.ytimg.com`, YouTube's oEmbed, Vimeo's oEmbed (`vimeo.com/api/oembed.json`) and Vimeo's still host `i.vimeocdn.com` all allow cross-site reading (`Access-Control-Allow-Origin: *` or the echoed origin). So the editor's browser code reads them, and only `connect-src` widens, by exactly those four hosts, in `public/_headers` and `tests/native-save/test-csp.ts` (`tests/editor-csp.test.ts` checks both). `img-src` is unchanged: the copied still shows from the site, never from the service. YouTube's `maxresdefault` is missing for some videos (404), `hqdefault` exists for every real video; Vimeo gives a 960-1280 px still when oEmbed is asked for `width=1280`.
- **Behaviour** (engine only; the picker field and Media tiles are slice 68).
  - New lazy, pure `src/page-builder/online-video.ts`: `parseOnlineVideoAddress` accepts the starter's forms (watch, `youtu.be`, embed, shorts, live, `/v/`, `youtube-nocookie`, `www.`/`m.`, no scheme; Vimeo plain, `/ID/HASH`, channels, showcase, groups, `player.vimeo.com?h=`) and start times; `onlineVideoHref` writes the canonical address, round-tripping through the starter's own parser. Records helpers (find, upsert, set still, remove), `onlineVideoMarkup` (the starter contract `<a class="online-video" href[ data-controls="service"]><img src alt width height></a>`; without a still the link carries the title and an "Add your own still picture" note), `onlineVideoUses` (pages per video, for slice 68's uses), and page rewrites for a still swap and the service-bar switch.
  - New lazy `src/page-builder/online-video-add.ts`: `readOnlineVideo` reads the title and still (YouTube maxres → sd → hq; Vimeo thumbnail only from `https://i.vimeocdn.com`), cookies and referrer omitted, redirects refused. A YouTube address with no video refuses; any blocked, private or offline read adds the video without a still and asks for Lex's own picture. `addOnlineVideo` prepares the still with the site's remembered image quality and Keep original into `media/videos/<tidy title>.webp` with responsive copies, and saves still, copies and record (plus an optional placement) through `importMedia` in **one Undo step**. A video already recorded with its still present makes **no service call**; placing it again saves only the placement.
  - Records (`shared/media-records.ts`): `onlineVideos[]` gains validated `hash` (Vimeo unlisted key), `serviceBar` (the per-video "Show Vimeo's own bar" switch slice 61 asked for) and `stillCopied` (the still is the service's picture the editor copied); removed entries can carry `onlineVideo`.
  - Workspace methods: `onlineVideo` (records-only add/placement), `onlineVideoStill` (swap: record plus every HTML file, component templates included; the old copy stays as a file; clears `stillCopied`), `onlineVideoServiceBar` (record plus every placement), `removeOnlineVideo` (drops the record; only a copied still's family goes to Recently removed, carrying the record, and restoring it brings the record back unless the video was added again; Lex's own swapped-in picture stays; pages are not edited; no service call).
- **Commits.** 97a1a9f1 claim; c3b327f5 build (GPT-6.1 Sol; runner fixes: `stillCopied` so removal never takes Lex's own picture, slashes in titles kept as words, swapping into a link without a picture replaces its title text, YouTube's oEmbed frame size no longer reported as the still's); 1d4a3770 review round 1 fixes; 280cb1a4 review round 2 fix; this close.
- **Tests.** New `tests/online-video.test.ts` (42): every address form and rejects, starter round trip, records, exact markup, uses, page swaps, service reads with a fake fetch (fallbacks, refusals, credentials omitted, Vimeo host check), one-batch add with copies and placement, no fetch on the second add or re-placement, Keep original, title slashes, swap/bar across pages and component templates, removal with zero service calls, own picture kept, restore with history and browser copies. Extended `media-records` and `editor-csp`. Ran `npm run check`, `npm run lint`, unit 3,073/3,073; browser `native-media-policy` + `native-canvas` 14/14 (test server policy changed).
- **Review (GPT-6.1 Sol, read-only, 2 rounds).** Evidence: main checkout `.scratch/reviews/mm-67/round-1/`, `round-2/` (run.log: model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`). Round 1, fixed 3 (P2): re-placing a copied video skipped the placement; switching the service bar off did not clear the saved choice; still swaps and bar switches skipped component templates. Round 2 confirmed them, fixed 1 (P2): the copied still ignored Keep original. Rejected 0.
- **Bytes.** `test:budget` 348 KB gzip of 355 KB before first preview paint. Boot entry +81 B gzip (Sol's same-session build: the shared records validation); the online-video code loads on demand.
- **Follow-ups.** Slice 68: the picker's address field calls `addOnlineVideo` with `fetch` and a placement built from `onlineVideoMarkup` and `mediaPlayerPlan(kinds: ["online-video"])`; Media tiles read `onlineVideos` and `onlineVideoUses`; removal from Media warns with uses (ticket 10) before `removeOnlineVideo`; the "Show Vimeo's own bar" switch calls `onlineVideoServiceBar`. Slice 59: group a copied still (`onlineVideos[].still`) with its Online video, not as a loose picture. YouTube's `sddefault`/`hqdefault` stills (videos without an HD still) are 4:3 with black bands for 16:9 videos; trimming them, or Lex swapping in her own picture, is left for later.
