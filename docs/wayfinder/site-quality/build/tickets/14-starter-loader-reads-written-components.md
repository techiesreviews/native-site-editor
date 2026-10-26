---
title: "Starter: the loader uses components already written into the page"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [13-starter-first-screen]
---

## Goal

Make the starter's loader ready for components written into the page's HTML as declarative shadow DOM ([ticket 05](../../tickets/05-grill-automatic-fixes.md#resolution-2026-10-26) item 6, ADR 0001 decision 6), so the header and footer show with the first paint and robots see the menu ([research 02](../../tickets/02-research-geo.md#resolution-2026-10-25)). Starter repo, like slice 13. Size: M.

## Decided behaviour

- `components/components.js`: when an element already has a shadow root from a `<template shadowrootmode="open">`, the loader keeps it if it matches the current template and replaces its content when it does not (a page written before a component changed still shows the latest version with scripts on).
- `styles/site.css:19-23` hides only components that have no written shadow root yet, so a written header keeps its real size from the first paint (this is the CLS 0.24–0.28 on the phone home page).
- The starter's own pages get their header and footer written in, by hand once, in exactly the form slice 16 writes, so the starter and new sites match.
- Without scripts, written components show their full content.
- `fixtures/actual-starter` refreshed as in slice 13.

## Files

Starter repo: `components/components.js`, `styles/site.css`, the pages' header and footer. This repo: `fixtures/actual-starter/**`, `fixtures/actual-starter.README.md`.

## Done when

- `kit lighthouse --site starter` on the phone home page: CLS ≤ 0.1 on all 5 runs.
- With scripts off (Playwright `javaScriptEnabled: false`), the header menu links are in the page and visible.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-14 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-14 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
- Starter repo has no kit: its change is checked here through the refreshed `fixtures/actual-starter` (this repo's `kit pr` runs `kit lighthouse` on it).
