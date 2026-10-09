---
title: "Conventions: a band with no tone follows the page"
type: task (AFK)
status: closed
assignee:
blocked_by: [75-starter-follows-visitor-scheme]
builder: sol
phase: 7
---

## What

From slice 75 (see its Done note): the Components chapter in `worker/site-conventions.ts` still calls `light` "the default: no attribute", but in the starter a band with no tone now follows the visitor's light/dark setting. Reword it: no `data-tone` means the band follows the page (which may follow the visitor); `light` and `dark` force a scheme. Copy the chapter byte for byte into the starter's `AGENTS.md` (starter `dev`), refresh `fixtures/actual-starter` to the starter's `dev` head (it will then include `tones.css` and slice 75), and update slice 61's "Light (default)" label if it now reads wrong (e.g. "No tone (follows the page)" when the CSS doesn't define a default look for the absent attribute — keep ticket 07's rule that the CSS decides).

## Done when

- Drift test passes; `@actual` group passes on the refreshed fixture (colour comparisons may need the tolerance noted on slice 62); the edit bar's Tone default label reads correctly on the starter.

## Done (2026-10-09)

- The Components chapter says no `data-tone` means the band follows the page (which may follow the visitor), `light` and `dark` force a scheme; copied to the starter's `AGENTS.md` (`dev` 6a20035) and `fixtures/actual-starter` refreshed to it (brings slice 75's `tones.css`). The edit bar no longer assumes `light` is the absent tone: with no CSS-declared default the empty option reads "No tone (follows the page)" and Light writes `data-tone="light"`; a default the CSS declares still reads "<Value> (default)" (ticket 07). `toneDefault` is gone.
- Commit "Conventions and edit bar: a band with no tone follows the page (slice 77)". Built by Sol, checked by Claude.
- Tests: `tests/tone-band.test.ts` (no-default and declared-default cases), `tests/variant-fields.test.ts`, `tests/mcp-runtime.test.ts` (chapter line), `tests/native-save/native-tone.spec.ts` (@smoke: Light writes, No tone removes). Drift test and `@actual` pass except `native-edit-bar-label-actual.spec.ts` at 760 px (move buttons wrap, right gap), which fails the same way on `origin/dev` before this slice.
