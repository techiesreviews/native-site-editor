---
title: "Page details: scores, What to improve and Copy prompt"
type: task (AFK)
status: open
assignee:
builder: claude
blocked_by: [63-score-rings]
---

## Goal

A page's details show its four scores and what to improve, filterable by score, with a ready-to-paste prompt to fix it ([ticket 10](../../tickets/10-grill-page-scores.md#resolution-2026-10-26); prototype [05-page-scores.html](../../prototypes/05-page-scores.html)). Size: M–L.

## Decided behaviour

- Opens from a page's ring, in the left panel, with a way back to Pages.
- The four rings with numbers sit at the top of "What to improve" (Lex: "show the overview in the what to improve").
- Clicking a ring filters the list to that category; clicking it again clears the filter.
- Each item names what and where and the score it lowers; clicking it goes to the spot, as Inbox items do. Wave-offs (for example Decorative) work here too.
- A perfect page says so in one short line.
- **Copy prompt:** made by code from the findings, no AI. It holds the page address and file, each finding with where it is and the rule it breaks (with its Lighthouse or specification.website link), and the targets (speed 99, the rest 100). When a filter is on, the prompt covers the filtered findings. The button itself shows that it copied; no toast.
- The prompt builder lives in `shared/site-score/prompt.ts`, so the site prompt (slice 65) and the MCP instructions can reuse it.

## Files

Expected: `src/site-score/page-details.ts` (+ CSS), `shared/site-score/prompt.ts`, `src/pages-and-files-explorer.ts`, tests.

## Done when

- On a fixture page with one failure in each category, the filter shows one item per ring, and Copy prompt with the accessibility filter on copies a prompt naming only that item (unit test on the builder's output).

## Kit commands and evidence

Agent Kit is required (`scripts/agents/kit`; [runner.md](../../../../agents/runner.md)). `kit doctor` first, then `kit bg slice-sq-64 -- scripts/agents/kit slice --ticket <this ticket> --builder claude-opus-5-5`; `kit wait job slice-sq-64 --timeout 2h`.

- `kit unit --affected`, `kit specs --affected` and `npm run check` green, with `RESULT:` lines quoted in Done.
- `kit size` against dev: boot bytes unchanged or lower.
- `kit lighthouse` (with `kit site-rules`) on the new and edited site, `RESULT:` lines quoted in Done.
- `kit shots` of the touched screens, light and dark, 390 and 1280 wide (Lex sees the contact sheet); Opus UX review of the sheet against the [UX rulebook](../../../../agents/ux-rulebook.md).
- `kit review`, then `kit pr` into `dev`. A kit command that cannot run is named in `decide`, never skipped silently.
