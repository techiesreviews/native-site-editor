---
title: "Conventions: a band with no tone follows the page"
type: task (AFK)
status: open
assignee:
blocked_by: [75-starter-follows-visitor-scheme]
builder: sol
phase: 7
---

## What

From slice 75 (see its Done note): the Components chapter in `worker/site-conventions.ts` still calls `light` "the default: no attribute", but in the starter a band with no tone now follows the visitor's light/dark setting. Reword it: no `data-tone` means the band follows the page (which may follow the visitor); `light` and `dark` force a scheme. Copy the chapter byte for byte into the starter's `AGENTS.md` (starter `dev`), refresh `fixtures/actual-starter` to the starter's `dev` head (it will then include `tones.css` and slice 75), and update slice 61's "Light (default)" label if it now reads wrong (e.g. "No tone (follows the page)" when the CSS doesn't define a default look for the absent attribute — keep ticket 07's rule that the CSS decides).

## Done when

- Drift test passes; `@actual` group passes on the refreshed fixture (colour comparisons may need the tolerance noted on slice 62); the edit bar's Tone default label reads correctly on the starter.
