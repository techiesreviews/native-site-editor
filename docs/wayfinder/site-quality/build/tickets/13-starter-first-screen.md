---
title: "Starter: a faster first screen and an open robots.txt"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: []
---

## Goal

One-off fixes in the starter project, which is a separate repository (`~/Projects/native-site-editor-starter`). Grounded in research 01 and 03 and [ticket 07](../../tickets/07-grill-geo-choices.md#resolution-2026-10-26). Size: S–M.

## Decided behaviour

- **robots.txt:** the `Content-Signal: … ai-input=no …` line goes (Lex, ticket 07). Add a `Sitemap:` line. The AI-robot lines match what slice 23 writes, so a new site starts in step.
- **Stylesheets:** the `@import` chain in `styles/site.css:7-12` becomes a flat list of `<link>`s in each page's head, so the page paints after one round trip.
- `<meta name="color-scheme">` in the head; the forced layout read at `components/components.js:28` (`const startY = scrollY;`) moves after layout.
- The component template image that became the LCP element in research 03 (`components/section-split/section-split.html:3`) gets `width`/`height`.
- All CSS follows good-css.
- **How it reaches this repo:** the starter change is committed in the starter repo on its `dev`; then this repo's `fixtures/actual-starter` is refreshed byte-for-byte and `fixtures/actual-starter.README.md` gets the new commit line, as earlier starter slices did.

## Files

Starter repo: `robots.txt`, `styles/site.css`, every page's `<head>` (`index.html`, `about/`, `work/`, `404.html`), `components/components.js`, `components/section-split/section-split.html`. This repo: `fixtures/actual-starter/**`, `fixtures/actual-starter.README.md`.

## Done when

- `kit lighthouse --site new` shows no `render-blocking-insight` chain and no forced reflow; scores no lower than before.
- `kit shots --compare dev` of the starter pages through the editor shows no visible change.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-13 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-13 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
- Starter repo has no kit: its change is checked here through the refreshed `fixtures/actual-starter` (this repo's `kit pr` runs `kit lighthouse` on it).
