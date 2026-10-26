---
title: Hand off the site quality build plan
type: task (AFK)
status: closed
assignee: claude (fork)
blocked_by: [04-grill-target-scores, 05-grill-automatic-fixes, 06-grill-keeping-rules-current, 07-grill-geo-choices, 08-grill-host-dependent-rules]
---

## Question

Write `docs/wayfinder/site-quality/build/` in the style of the earlier builds.

## Resolution (2026-10-26)

Build plan: [build/README.md](../build/README.md), 26 slices in five stages and two releases (site output, then the Inbox):

- stage 1, measuring and the first screen (10–16): `kit lighthouse`, `kit site-rules`, one site-output step in the save path, starter fixes, and components written into pages (ADR 0004 in slice 16);
- stage 2, page details and site files (20–27);
- stage 3, host files (30–32);
- stage 4, the Inbox (40–44);
- stage 5, good-css for site CSS and the monthly rule check (50–51);
- close-out (59).

Gate: after the detail pass release, which itself follows the catalogue's last release. The slim top bar was added to the catalogue build as slice 66 (`docs/wayfinder/atomic-catalogue/build/tickets/66-organism-top-bar.md`), between 64 and close-out 65. Finding: GitHub Pages has no redirect pages today (Change URL writes only `_redirects`), so slice 31 adds them. Three questions for Lex are at the end of the README.
