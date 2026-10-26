---
title: Hand off the site structure build plan
type: task (AFK)
status: closed
assignee: claude (fork)
blocked_by: [04-grill-map-behaviour, 05-grill-rearranging, 06-grill-search, 07-grill-project-overview, 08-prototype-site-map]
---

## Question

Write `docs/wayfinder/site-structure/build/` in the style of the earlier builds.

## Resolution (2026-10-26)

Written: [build/README.md](../build/README.md) and 19 slices in [build/tickets/](../build/tickets/):

- stage 1, shared foundations (10–13): a shared `src/board/`, one search rule, page pictures, and move and add checks;
- stage 2, search (20, 21);
- stage 3, the site map (30–36);
- stage 4, the project overview (40–44);
- close-out (49).

**Three releases:** search, the site map, then the project overview.

**Gate:** after the site quality build's last release. Slices also wait, in text, on atomic-catalogue slices 05 and 66 and site-quality slices 31, 63 and 65.

**First wave:** 10, 11, 12 and 13 (and 40).

The lead's technical decisions cover the open items from research: scrolling inside a live page, the phone, Safari and Firefox, and the picture engine. Site-quality slice 31 gained one line, so forwarding pages are hidden where the page list is made.

**Questions for Lex:**
1. start search earlier;
2. two GitHub accounts on one overview.
