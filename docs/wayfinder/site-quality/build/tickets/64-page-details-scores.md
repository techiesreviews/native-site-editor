---
title: "Page details: scores, What to improve and Let AI fix it"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [63-score-rings]
---

## Goal

A page's details show its five scores and what to improve, filterable by score, with a "Let AI fix it" button that copies a ready-to-paste prompt to fix it ([ticket 10](../../tickets/10-grill-page-scores.md#resolution-2026-10-26); prototype [05-page-scores.html](../../prototypes/05-page-scores.html)). Size: M–L.

## Decided behaviour

- Opens from a page's ring, in the left panel, with a way back to Pages.
- **Header:** only the page name (Lex: "the page, only show the name"), no address or file. "Let AI fix it" sits right after it ([ticket 10 second follow-up](../../tickets/10-grill-page-scores.md#second-follow-up-2026-10-26)).
- The five rings with numbers (Agents included) sit at the top of "What to improve" (Lex: "show the overview in the what to improve").
- Clicking a ring filters the list to that category; clicking it again clears the filter.
- Each item names what and where and the score it lowers; clicking it goes to the spot, as Inbox items do. Wave-offs (for example Decorative) work here too.
- A perfect page says so in one short line.
- **"Let AI fix it"** (Lex: "change the icon to use the star AI, move it close to the page name, and make the button say, let AI fix it, after the icon"; [ticket 10 second follow-up](../../tickets/10-grill-page-scores.md#second-follow-up-2026-10-26)): the AI star (the sparkle, already in the catalogue's icon set from slice 10) followed by the words "Let AI fix it". It is a catalogue button with an icon (catalogue slice 11), not a new part; Lex approves its use on the board with page details. One recognisable control everywhere a prompt can be made; it replaces the Copy prompt button and the earlier prompt icon.
- **What it does here:** with no agent connected it copies the prompt, and the button itself says "Copied" with a check for a moment; no toast. Sending to a connected agent is wired by slice 67. It shows only when the page has something to improve.
- "Show prompt" under the header lets the prompt be read before using it.
- **The prompt:** made by code from the findings, no AI. It holds the page address and file, each finding with where it is and the rule it breaks (with its Lighthouse or specification.website link), and the targets (speed 99, the rest 100, Agents included). When a filter is on, the prompt covers the filtered findings.
- The prompt builder lives in `shared/site-score/prompt.ts`, so the site prompt (slice 65), sending to an agent (slice 67) and the MCP instructions can reuse it.

## Files

Expected: `src/site-score/page-details.ts` (+ CSS), `shared/site-score/prompt.ts`, `src/pages-and-files-explorer.ts`, tests.

## Done when

- On a fixture page with one failure in each category, the filter shows one item per ring, and "Let AI fix it" with the accessibility filter on copies a prompt naming only that item (unit test on the builder's output); the header shows only the page name.

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-64 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-64 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
