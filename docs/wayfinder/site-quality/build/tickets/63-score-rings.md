---
title: "Pages and files: a score ring on every page"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [61-whole-site-scores, 41-inbox-site-improvements]
---

## Goal

One small ring at the end of every page row in Pages and files, showing how the page scores ([ticket 10](../../tickets/10-grill-page-scores.md#resolution-2026-10-26); prototype [05-page-scores.html](../../prototypes/05-page-scores.html)). It replaces the per-page Inbox dot that ticket 05 planned (former slice 42, folded in here). Size: S–M.

## Decided behaviour

- About 14 px, filled to the page's lowest of its four scores. No number in the row.
- Faint grey on a perfect page (Lex: "faint is great"); amber below 90 or while the page has an open site improvement; red below 50 (Lighthouse's colour bands).
- Hover or keyboard focus shows the four numbers in a tooltip (catalogue tooltip part).
- Agent questions do not colour it; they stay Inbox items (slice 43).
- Clicking the ring opens the page's details (slice 64; until it lands, the ring only shows its tooltip).
- A page without a score yet has no ring.
- The ring is a catalogue part: drafted on the board, approved by Lex there like every part.

## Files

Expected: `src/pages-and-files-explorer.ts` (+ CSS), `src/catalogue/parts.ts` (the ring part), tests.

## Done when

- On a fixture site, perfect pages show a faint ring, a page with a picture without a description shows amber, and fixing it turns the ring faint within one pause.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-63 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-63 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
