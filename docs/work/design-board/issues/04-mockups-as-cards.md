---
title: "Design board: the mock-ups of the mock-ups page are cards on the board, and /mockups/ opens them"
status: closed
assignee: fleet-lead
blocked_by: [03-move-everything]
---
# Design board 04: the mock-ups as cards (Orbit TOOLS-218)

Lex chose option C on 2026-11-12: refresh the mock-ups page first (PR #353), then show its mock-ups on the design canvas.

## What
On the catalogue board (catalogue.html, preview editor only) every mock-up of the mock-ups page is a card, one area per map like the page. A card shows the mock-up's name, its label (Live, On preview, Being built, Planned, Idea only) with the tickets it came from, its agreed picture when it is released and has one, and an "Open mock-up" link (opens in a new tab). Cards move like every other card (by their name; snap, nudge, place, remembered in this browser) and are found in the Outline and the search. They are not parts, so Approve and its count leave them out. `/mockups/` now redirects to `/catalogue.html#plans`, which opens the board on the mock-up areas; the plain list stays at `/mockups/list/`. The preview build writes the cards' data to `/mockups/board.json`; a board without that file (the dev server, a build without MOCKUPS=1) simply has no mock-up areas, and a list that never answers is given up on after 3 seconds.

## Done when
- Each mock-up of the page is a card in its map's area with its label, picture (released ones only) and Open mock-up link.
- A card is dragged by its title and keeps its place over a reload.
- `/mockups/` opens the board's mock-ups; `/mockups/list/` is the old plain list, with its pictures; the mock-up permission rule from PR #353 (scripts in mock-ups keep working) is untouched.
- The editor's boot stays within 355 KB.

## Done (2026-11-12)
- Feature list: no change (the catalogue board is a preview-only design tool, not an editor feature; docs/agents/features.md lists editor features only, in fixed areas)
- Tests: tests/catalogue-plans.test.ts (new: reading the list, a list that never answers); tests/vite-mockups.test.ts (the plain list at `/mockups/list/` with `../` links, `board.json`, the redirect, and in a browser behind Cloudflare's asset handler `/mockups/` reaching the board despite the sandboxed policy); tests/native-save/native-catalogue-board.spec.ts (seven new tests: the cards, picking and dragging one, `#plans`, the link opening a tab, a stuck list, long names at every zoom, a phone and the keyboard). Red before: the plans module and `mockupBoard` did not exist.
- Review: three Opus rounds (round 1: one P2, the board waited for the list without a limit, fixed with a 3 second limit and a spec; two P3, a phone opened on every area and ids with spaces, fixed; four validation gaps closed with specs; rounds 2 and 3 only nits, fixed) and one GPT second look (two P2, fixed: the link is a finger-sized target on a touch screen, and the keyboard reaching it picks its card and brings it to a readable size). Declined: none.
- Evidence: kit size boot 355 KB (±0 KB) vs dev; kit shots catalogue --compare dev shows the board unchanged with no layout findings; a raw shot of `#plans` with the real mock-ups checked by eye at 1440 and 390.
