---
title: One Media button for every media spot
type: task (AFK)
status: open
assignee: claude (mm-119 runner)
blocked_by: [109-image-popup-shorter, 115-placed-media-editor]
builder: claude
phase: 8
---

## What

Lex's answers to the audit's [Q5 and Q6](../ux-ui-audit.md#questions-for-lex) (2026-10-15). Lex: "Instead of thinking about an image button, it is a media button. So a way to add, change media."

- The edit bar's **Image** button becomes **Media** on every media spot: pictures, picture spots holding a looping video, videos, audio, downloads and online videos. On an empty spot it adds media; on a filled one it changes it.
- It opens one popup, shaped by what the spot holds:
  - picture: today's framing popup (slice 109's shorter version) with Replace;
  - video (including a looping video in a picture spot): still picture (Use this moment / Choose…), Loop silently, Subtitles, and **Replace** with a picture or another video (Q5: today a video can't be replaced at all);
  - audio and downloads: title and Replace; online video: Vimeo's own bar switch and Replace.
- The video's three address fields leave the edit bar; their jobs live in the popup.
- Agents: replacing a video in a picture spot becomes possible for agents too, writing exactly what the editor writes (map ticket 13).

## Done when

- Specs: Media button on a picture, a looping video in a picture spot (replace with another video, then with a picture; component layout kept), a video, audio, a download, an online video, and an empty spot.
- `tests/mcp-runtime.test.ts`: an agent replaces a video in a picture spot.
- Shots of each popup at 390, 768 and 1280, light and dark, before and after.
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code lazy (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.
